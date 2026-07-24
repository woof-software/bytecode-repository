// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { BytecodeStore } from "./libraries/BytecodeStore.sol";
import { IBytecodeProvider } from "./interfaces/IBytecodeProvider.sol";
import { Types } from "./interfaces/Types.sol";

/**
 * @title SingleTypeBytecodeProvider
 * @author WOOF! Software
 * @custom:security-contact dmitriy@woof.software
 * @notice A minimal, self-contained {IBytecodeProvider} serving the bytecode of a SINGLE contract type.
 * - The contract type is fixed at construction time and can never change. Queries for any other contract
 *   type report the version as non-existing.
 * - Multiple versions of that one contract type can be hosted simultaneously, which is what allows
 *   {CometFactoryV2-setVersion} (enforcing incremental major upgrades) to be exercised.
 * - Bytecode is stored via SSTORE2 (see {BytecodeStore}) with the same version-hashing scheme as the
 *   {VersionController}, so version hashes are identical across the ecosystem.
 * - The Uploader (UPLOADER_ROLE, granted to the initial admin) is able to:
 *   1. Upload the init code for a given version of the fixed contract type.
 *   2. Re-upload a version to correct a faulty upload (see {uploadBytecode}).
 * - The Admin (DEFAULT_ADMIN_ROLE) is able to grant and revoke the UPLOADER_ROLE.
 * - No audit verification is performed: `getVerifiedBytecode` returns any uploaded bytecode. Use
 *   {getInitCodeHash} to confirm the uploaded init code matches the source repository byte-for-byte,
 *   which is what guarantees identical CREATE2 addresses across networks.
 * - This contract is a deployment aid, NOT a governance-grade bytecode repository: it carries none of the
 *   audit, cooldown or developer-hierarchy guarantees of the full {VersionController}.
 */
contract SingleTypeBytecodeProvider is AccessControl, IBytecodeProvider, Types {
    /// @notice Uploader role for AccessControl. Uploaders can upload bytecode.
    bytes32 public constant UPLOADER_ROLE = keccak256("UPLOADER_ROLE");

    /// @notice The single contract type served by this provider. Fixed at construction time.
    bytes32 public immutable contractType;

    /// @notice Address pointers of the SSTORE2-stored init code for given bytecode version hash.
    mapping(bytes32 => address[]) private initCodePtrs;
    /// @notice Hash of the uploaded init code for given bytecode version hash.
    mapping(bytes32 => bytes32) public initCodeHashes;

    event BytecodeUploaded(bytes32 _contractType, VersionWithAlternative _version, bytes32 _initCodeHash);

    error ZeroAddress();
    error ZeroContractType();
    error WrongContractType(bytes32 _expected, bytes32 _provided);
    error BytecodeNotUploaded(bytes32 _contractType, VersionWithAlternative _version);

    /// @param _contractType The single contract type this provider serves, e.g. "CometWithAssetList".
    /// @param _initialAdmin An address that receives the DEFAULT_ADMIN_ROLE and the UPLOADER_ROLE.
    constructor(bytes32 _contractType, address _initialAdmin) {
        if (_contractType == bytes32(0)) revert ZeroContractType();
        if (_initialAdmin == address(0)) revert ZeroAddress();
        contractType = _contractType;
        _grantRole(DEFAULT_ADMIN_ROLE, _initialAdmin);
        _grantRole(UPLOADER_ROLE, _initialAdmin);
    }

    /* Upload function */

    /// @notice Uploads the init code for a given version of this provider's contract type.
    /// @dev Can only be called by an uploader.
    /// @dev Re-uploading an already populated version overwrites it, which allows a faulty upload to be
    /// corrected without redeploying this contract. The previously written SSTORE2 pointers are simply
    /// orphaned. Take care when overwriting a version a factory already points at, as this silently
    /// changes what that factory deploys.
    /// @dev Init code must not be empty (enforced by {BytecodeStore}).
    /// @param _version The version to upload the bytecode for.
    /// @param _initCode The creation (init) code of the contract, without constructor arguments.
    function uploadBytecode(
        VersionWithAlternative calldata _version,
        bytes calldata _initCode
    ) external onlyRole(UPLOADER_ROLE) {
        bytes32 versionHash = computeBytecodeHash(contractType, _version);
        bytes32 initCodeHash = keccak256(_initCode);

        initCodePtrs[versionHash] = BytecodeStore._writeInitCode(_initCode);
        initCodeHashes[versionHash] = initCodeHash;

        emit BytecodeUploaded(contractType, _version, initCodeHash);
    }

    /* View functions */

    /// @notice Returns the uploaded bytecode of the specified version.
    /// @dev No audit verification is enforced. Reverts if the contract type does not match this
    /// provider's contract type, or if nothing was uploaded for the version.
    /// @param _version A bytecode version for which to return bytecode.
    /// @return The init code of the specified version.
    function getVerifiedBytecode(BytecodeVersion calldata _version) external view returns (bytes memory) {
        if (_version.contractType != contractType) revert WrongContractType(contractType, _version.contractType);
        address[] memory ptrs = initCodePtrs[computeBytecodeHash(contractType, _version.version)];
        if (ptrs.length == 0) revert BytecodeNotUploaded(_version.contractType, _version.version);
        return BytecodeStore._readInitCode(ptrs);
    }

    /// @notice Validates if bytecode was uploaded for the specified version.
    /// @dev Returns false for any contract type other than this provider's contract type.
    /// @param _version A bytecode version to check.
    /// @return A boolean flag indicating if the version exists. True if exists, false otherwise.
    function versionExists(BytecodeVersion calldata _version) external view returns (bool) {
        if (_version.contractType != contractType) return false;
        return initCodePtrs[computeBytecodeHash(contractType, _version.version)].length != 0;
    }

    /// @notice Returns the init code hash of the uploaded bytecode of the specified version.
    /// @dev Use this to verify that the bytecode uploaded here is byte-for-byte identical to the one
    /// registered in the canonical repository on another network, which is what guarantees identical
    /// CREATE2 deployment addresses.
    /// @param _version A bytecode version for which to return the init code hash.
    /// @return The init code hash of the specified version.
    function getInitCodeHash(BytecodeVersion calldata _version) external view returns (bytes32) {
        if (_version.contractType != contractType) revert WrongContractType(contractType, _version.contractType);
        bytes32 initCodeHash = initCodeHashes[computeBytecodeHash(contractType, _version.version)];
        if (initCodeHash == bytes32(0)) revert BytecodeNotUploaded(_version.contractType, _version.version);
        return initCodeHash;
    }

    /// @notice Validates if given account is allowed to upload bytecode.
    /// @dev Required by {IBytecodeProvider}. Not used by {CometFactoryV2}, whose `clone` is permissionless
    /// and whose `setVersion` is timelock-gated.
    /// @param _account Address to check.
    /// @return true if the account is an uploader, false otherwise.
    function isDeveloper(address _account) external view returns (bool) {
        return hasRole(UPLOADER_ROLE, _account);
    }

    /// @notice Computes a bytecode version hash for specified contract type and its version.
    /// @dev Uses the same scheme as the {VersionController}, so hashes match across the ecosystem.
    /// @param _contractType A type of contract for which to compute hash.
    /// @param _version A version of specified contract type for which to compute hash.
    /// @return Hash of specified bytecode version.
    function computeBytecodeHash(
        bytes32 _contractType,
        VersionWithAlternative memory _version
    ) public pure returns (bytes32) {
        return BytecodeStore._computeBytecodeHash(_contractType, _version);
    }
}
