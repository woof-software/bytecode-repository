// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { BytecodeStore } from "./libraries/BytecodeStore.sol";
import { IBytecodeProvider } from "./interfaces/IBytecodeProvider.sol";
import { Types } from "./interfaces/Types.sol";

/**
 * @title LightVersionController
 * @author WOOF! Software
 * @custom:security-contact dmitriy@woof.software
 * @notice A lightweight variant of the {VersionController} intended for test deployments.
 * - Merges the {L1DeployManager} `deploy` flow into a single contract so bytecode can be stored and
 *   deployed via CREATE2 from one place.
 * - The Admin (DEFAULT_ADMIN_ROLE) assigns and removes developers.
 * - This contract is NOT for production use: it removes the security guarantees of the full
 *   {VersionController} and exists purely to streamline test deployments.
 */
contract LightVersionController is AccessControl, IBytecodeProvider, Types {
    using Strings for uint256;

    /// @notice Developer role for AccessControl. Developers can release and deploy bytecode.
    bytes32 public constant DEVELOPER_ROLE = keccak256("DEVELOPER_ROLE");

    /// @notice Stores the latest available version for given contract type.
    mapping(bytes32 => Version) public latestVersions;
    /// @notice Stores the latest available minor version for given contract type and major version.
    mapping(bytes32 => mapping(uint64 => uint64)) public latestMinor;
    /// @notice Stores the latest available patch version for given contract type, major and minor versions.
    mapping(bytes32 => mapping(uint64 => mapping(uint64 => uint64))) public latestPatch;
    /// @notice Stores the list of alternative versions for given contract type.
    mapping(bytes32 => VersionWithAlternative[]) private alternativeVersions;
    /// @notice Stores the bytecode information for given bytecode version hash.
    mapping(bytes32 => Bytecode) public bytecodes;
    /// @notice Stores the status of bytecode uploading. keccak256(initCode) => boolean status.
    mapping(bytes32 => bool) public isBytecodeUploaded;

    event DeveloperAssigned(address _developer);
    event DeveloperRemoved(address _developer);
    event BytecodeUploaded(bytes32 _contractType, Version _version);
    event ContractDeployed(
        BytecodeVersion _bytecodeVersion,
        bytes _constructorParams,
        address _newContract,
        address _deployer
    );

    error ZeroAddress();
    error NotDeveloper(address _account);
    error NotDeveloperOrAdmin(address _account);
    error BytecodeAlreadyReleased(bytes32 _contractType);
    error BytecodeNotReleased(bytes32 _contractType);
    error NonExistingMajorVersion(bytes32 _contractType, uint64 _major);
    error NonExistingMinorVersion(bytes32 _contractType, uint64 _major, uint64 _minor);
    error NonExistingVersion(bytes32 _contractType, VersionWithAlternative _version);
    error VersionAlreadyExists(bytes32 _contractType, VersionWithAlternative _version);
    error BytecodeAlreadyUploaded(bytes32 _bytecodeHash);
    error EmptyURL();

    /// @param _initialAdmin An address that receives the DEFAULT_ADMIN_ROLE.
    constructor(address _initialAdmin) {
        if (_initialAdmin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, _initialAdmin);
    }

    /// @notice Validates that the caller is a developer.
    modifier onlyDeveloper() {
        if (!isDeveloper(msg.sender)) revert NotDeveloper(msg.sender);
        _;
    }

    /// @notice Validates that the caller is a developer or the admin.
    modifier onlyDeveloperOrAdmin() {
        if (!isDeveloper(msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender))
            revert NotDeveloperOrAdmin(msg.sender);
        _;
    }

    /// @notice Validates if initial bytecode for specified contract type is already released.
    /// @param _contractType A type of contract for which to validate if bytecode is released.
    modifier bytecodeReleased(bytes32 _contractType) {
        if (latestVersions[_contractType].major == 0) revert BytecodeNotReleased(_contractType);
        _;
    }

    modifier checkURL(string calldata _url) {
        if (bytes(_url).length == 0) revert EmptyURL();
        _;
    }

    /* Upload bytecode functions */

    /// @notice Releases an initial version of the contract type.
    /// @dev Contract type can only be released once.
    /// @dev Any developer can release any contract type without prior registration.
    /// @dev Sets the initial version to "1.0.0".
    /// @param _bytecodeInput A struct of params necessary to upload the bytecode.
    function releaseBytecode(BytecodeInput calldata _bytecodeInput) external onlyDeveloper {
        if (latestVersions[_bytecodeInput.contractType].major != 0)
            revert BytecodeAlreadyReleased(_bytecodeInput.contractType);
        VersionWithAlternative memory version = VersionWithAlternative(Version(1, 0, 0), "");
        _uploadBytecode(_bytecodeInput, version);

        latestVersions[_bytecodeInput.contractType] = version.version;
    }

    /// @notice Releases a new major version of the contract type.
    /// @dev Can only be called if initial bytecode was released for contract type.
    /// @dev Increments a previously stored major version. E.g. "1.0.3" becomes "2.0.0".
    /// @param _bytecodeInput A struct of params necessary to upload the bytecode.
    function releaseMajorVersion(
        BytecodeInput calldata _bytecodeInput
    ) external onlyDeveloper bytecodeReleased(_bytecodeInput.contractType) {
        VersionWithAlternative memory version = VersionWithAlternative(
            Version(latestVersions[_bytecodeInput.contractType].major + 1, 0, 0),
            ""
        );
        _uploadBytecode(_bytecodeInput, version);

        latestVersions[_bytecodeInput.contractType] = version.version;
    }

    /// @notice Releases a new minor version of the contract type for specified major version.
    /// @dev Specified major version must exist.
    /// @dev Increments a previously stored minor version of specified major version. E.g. latest "4.2.1"
    /// with `_major` = 4 becomes "4.3.0".
    /// @param _bytecodeInput A struct of params necessary to upload the bytecode.
    /// @param _major A major version for which to release new minor version.
    function releaseMinorVersion(
        BytecodeInput calldata _bytecodeInput,
        uint64 _major
    ) external onlyDeveloper bytecodeReleased(_bytecodeInput.contractType) {
        Version storage latestVersion = latestVersions[_bytecodeInput.contractType];
        if (_major > latestVersion.major) revert NonExistingMajorVersion(_bytecodeInput.contractType, _major);
        VersionWithAlternative memory version = VersionWithAlternative(
            Version(_major, ++latestMinor[_bytecodeInput.contractType][_major], 0),
            ""
        );
        _uploadBytecode(_bytecodeInput, version);

        if (_major == latestVersion.major) {
            latestVersion.minor = version.version.minor;
            latestVersion.patch = 0;
        }
    }

    /// @notice Releases a new patch version of the contract type for specified major and minor versions.
    /// @dev Specified major and minor versions must exist.
    /// @dev Increments a previously stored patch version. E.g. latest "4.3.2" with `_major` = 4 and
    /// `_minor` = 3 becomes "4.3.3".
    /// @param _bytecodeInput A struct of params necessary to upload the bytecode.
    /// @param _major A major version for which to release new patch version.
    /// @param _minor A minor version for which to release new patch version.
    function releasePatchVersion(
        BytecodeInput calldata _bytecodeInput,
        uint64 _major,
        uint64 _minor
    ) external onlyDeveloper bytecodeReleased(_bytecodeInput.contractType) {
        Version storage latestVersion = latestVersions[_bytecodeInput.contractType];
        if (_major > latestVersion.major) revert NonExistingMajorVersion(_bytecodeInput.contractType, _major);
        uint64 latestMinorVersion = latestMinor[_bytecodeInput.contractType][_major];
        if (_minor > latestMinorVersion) revert NonExistingMinorVersion(_bytecodeInput.contractType, _major, _minor);

        VersionWithAlternative memory version = VersionWithAlternative(
            Version(_major, _minor, ++latestPatch[_bytecodeInput.contractType][_major][_minor]),
            ""
        );
        _uploadBytecode(_bytecodeInput, version);

        if (_major == latestVersion.major && _minor == latestVersion.minor) latestVersion.patch = version.version.patch;
    }

    /// @notice Releases an alternative version for specified contract type and version.
    /// @dev Specified version, for which alternative is released, must exist.
    /// @param _bytecodeInput A struct of params necessary to upload the bytecode.
    /// @param _version A struct containing the core version for which to release an alternative and the
    /// alternative label to release.
    function releaseAlternativeVersion(
        BytecodeInput calldata _bytecodeInput,
        VersionWithAlternative calldata _version
    ) external onlyDeveloper {
        VersionWithAlternative memory coreVersion = VersionWithAlternative(_version.version, "");
        if (!versionExists(computeBytecodeHash(_bytecodeInput.contractType, coreVersion)))
            revert NonExistingVersion(_bytecodeInput.contractType, coreVersion);
        _uploadBytecode(_bytecodeInput, _version);

        alternativeVersions[_bytecodeInput.contractType].push(_version);
    }

    /* Deploy function */

    /// @notice Allows developers or the admin to deploy a certain version of bytecode via CREATE2.
    /// @dev Bytecode must be registered (released) in this contract.
    /// @dev Mirrors the signature of {L1DeployManager-deploy}. Any registered bytecode is deployable
    /// @param _bytecodeVersion A specific version of contract type to deploy.
    /// @param _salt A value used together with the caller to generate a unique CREATE2 salt.
    /// @param _constructorParams Encoded parameters necessary to deploy the specified contract.
    /// @return Address of the newly deployed contract.
    function deploy(
        BytecodeVersion calldata _bytecodeVersion,
        bytes32 _salt,
        bytes calldata _constructorParams
    ) external payable onlyDeveloperOrAdmin returns (address) {
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, msg.sender));
        bytes memory bytecodeWithParams = abi.encodePacked(_getBytecode(_bytecodeVersion), _constructorParams);
        address newContract = Create2.deploy(msg.value, uniqueSalt, bytecodeWithParams);

        emit ContractDeployed(_bytecodeVersion, _constructorParams, newContract, msg.sender);
        return newContract;
    }

    /* View functions */

    /// @notice Computes a pre-deployed address of specified contract type and version.
    /// @param _bytecodeVersion A specific version of contract type.
    /// @param _salt A value used together with the deployer to generate a unique CREATE2 salt.
    /// @param _constructorParams Encoded parameters necessary to deploy the specified contract.
    /// @param _deployer Address of deployer. Necessary for unique salt generation.
    /// @return Address of computed pre-deployed smart contract.
    function computeAddress(
        BytecodeVersion calldata _bytecodeVersion,
        bytes32 _salt,
        bytes calldata _constructorParams,
        address _deployer
    ) external view returns (address) {
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, _deployer));
        bytes memory bytecodeWithParams = abi.encodePacked(_getBytecode(_bytecodeVersion), _constructorParams);
        return Create2.computeAddress(uniqueSalt, keccak256(bytecodeWithParams));
    }

    /// @notice Computes a bytecode version hash for specified contract type and its version.
    /// @param _contractType A type of contract for which to compute hash.
    /// @param _version A version of specified contract type for which to compute hash.
    /// @return Hash of specified bytecode version.
    function computeBytecodeHash(
        bytes32 _contractType,
        VersionWithAlternative memory _version
    ) public pure returns (bytes32) {
        return BytecodeStore._computeBytecodeHash(_contractType, _version);
    }

    /// @notice Validates if given account is a developer.
    /// @param _account Address to check.
    /// @return true if account is a developer, false otherwise.
    function isDeveloper(address _account) public view returns (bool) {
        return hasRole(DEVELOPER_ROLE, _account);
    }

    /// @notice Returns the latest version for given contract type in human-readable format.
    /// @param _contractType A type of contract for which to return latest version.
    /// @return Latest version for given contract type. E.g. "2.3.0".
    function getLatestVersion(bytes32 _contractType) external view returns (string memory) {
        return _versionToStr(VersionWithAlternative(latestVersions[_contractType], ""));
    }

    /// @notice Validates if a specified bytecode version exists based on struct with contract type and version.
    /// @param _version A bytecode version to check.
    /// @return A boolean flag indicating if the version exists. True if exists, false otherwise.
    function versionExists(BytecodeVersion calldata _version) public view returns (bool) {
        return versionExists(computeBytecodeHash(_version.contractType, _version.version));
    }

    /// @notice Validates if a specified bytecode version exists based on bytecode version hash.
    /// @param _bytecodeHash A bytecode version hash to check.
    /// @return A boolean flag indicating if the version exists. True if exists, false otherwise.
    function versionExists(bytes32 _bytecodeHash) public view returns (bool) {
        return bytecodes[_bytecodeHash].author != address(0);
    }

    /// @notice Returns any registered bytecode of a specified contract type and version.
    /// @dev No audit verification is enforced. Reverts only if the version does not exist.
    /// @param _version A bytecode version for which to return bytecode.
    /// @return A bytecode of specified contract type and version.
    function getVerifiedBytecode(BytecodeVersion calldata _version) external view returns (bytes memory) {
        return _getBytecode(_version);
    }

    /// @notice Returns the init code hash of any registered bytecode of a specified contract type and version.
    /// @dev No audit verification is enforced. Reverts only if the version does not exist.
    /// @param _version A bytecode version for which to return init code hash.
    /// @return Init code hash of specified contract type and version.
    function getVerifiedInitCodeHash(BytecodeVersion calldata _version) external view returns (bytes32) {
        if (!versionExists(_version)) revert NonExistingVersion(_version.contractType, _version.version);
        return bytecodes[computeBytecodeHash(_version.contractType, _version.version)].initCodeHash;
    }

    /// @notice Returns all alternative versions for given contract type.
    /// @param _contractType A type of contract for which to return alternative versions.
    /// @return Array containing all the alternative versions of given contract type.
    function getAllAlternativeVersions(bytes32 _contractType) external view returns (VersionWithAlternative[] memory) {
        return alternativeVersions[_contractType];
    }

    /* Internal helpers */

    /// @notice Stores the bytecode of given contract type and version.
    /// @dev Validates that the raw init code has not been uploaded before and the version does not already exist.
    /// @param _bytecodeInput A struct of params containing info about bytecode.
    /// @param _version A new version of bytecode for which it is uploaded.
    function _uploadBytecode(
        BytecodeInput calldata _bytecodeInput,
        VersionWithAlternative memory _version
    ) internal checkURL(_bytecodeInput.sourceURL) {
        address[] memory initCodePointers = BytecodeStore._writeInitCode(_bytecodeInput.initCode);
        bytes32 initCodeHash = keccak256(_bytecodeInput.initCode);

        if (isBytecodeUploaded[initCodeHash]) revert BytecodeAlreadyUploaded(initCodeHash);
        isBytecodeUploaded[initCodeHash] = true;

        Bytecode memory bc = Bytecode({
            contractType: _bytecodeInput.contractType,
            initCodeHash: initCodeHash,
            initCodePtrs: initCodePointers,
            sourceURL: _bytecodeInput.sourceURL,
            author: msg.sender
        });

        bytes32 versionHash = computeBytecodeHash(_bytecodeInput.contractType, _version);
        if (versionExists(versionHash)) revert VersionAlreadyExists(_bytecodeInput.contractType, _version);
        bytecodes[versionHash] = bc;

        emit BytecodeUploaded(_bytecodeInput.contractType, _version.version);
    }

    /// @notice Reads the registered bytecode for a given version, reverting if the version does not exist.
    /// @param _version A bytecode version for which to return bytecode.
    /// @return A bytecode of specified contract type and version.
    function _getBytecode(BytecodeVersion calldata _version) internal view returns (bytes memory) {
        if (!versionExists(_version)) revert NonExistingVersion(_version.contractType, _version.version);
        return
            BytecodeStore._readInitCode(
                bytecodes[computeBytecodeHash(_version.contractType, _version.version)].initCodePtrs
            );
    }

    /// @notice Returns given version in human-readable format. E.g. "4.3.0".
    /// @param _version Version of the bytecode.
    /// @return A string containing the version.
    function _versionToStr(VersionWithAlternative memory _version) internal pure returns (string memory) {
        return
            string.concat(
                uint256(_version.version.major).toString(),
                ".",
                uint256(_version.version.minor).toString(),
                ".",
                uint256(_version.version.patch).toString(),
                _version.alternative
            );
    }
}
