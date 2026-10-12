// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Types } from "../interfaces/Types.sol";
import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";
import { IAssetListFactoryV2 } from "../interfaces/IAssetListFactoryV2.sol";
import { IAssetListStructs } from "../integration/IAssetListStructs.sol";
import { BaseFactory } from "./BaseFactory.sol";

/**
 * @title AssetListFactoryV2
 * @author WOOF! Software
 * @custom:security-contact dmitriy@woof.software
 * @notice This factory contract deploys Compound AssetList implementations with version control and timelock governance integration for secure protocol upgrades.
 * - The contract is a drop-in replacement for Compound's AssetListFactory: it exposes the same `createAssetList` function and `AssetListCreated` event, so it can be set as the asset list factory of a Comet proxy in the Compound V3 Configurator and called through its `deployAssetList` function.
 * - Version management enforces iterative major version upgrades through timelock governance, preventing unauthorized or non-sequential protocol updates.
 * - Deployment targets the AssetList contract type, which stores collateral asset configurations of markets with extended asset capacity. A deployed AssetList is an implementation with disabled initializers, intended to be used through the AssetList proxy of a Comet.
 * - Only the immutable part of asset configurations (asset, decimals, price feed) is passed to the AssetList constructor. Collateral factors and supply caps are not handled by this factory: they are kept in the storage of the AssetList proxy.
 * - Automatic salt generation using an internal counter ensures unique deployment addresses while maintaining deterministic behavior for identical configurations.
 * - Integration with BytecodeRepository ecosystem provides audit verification and cross-chain deployment consistency for AssetList implementations.
 * - Timelock (governance contract) is able to:
 *   1. Upgrade the factory to use new major versions of AssetList following iterative upgrade constraints (N+1 major version only).
 *   2. Validate that new versions exist in the BytecodeRepository before approval, ensuring only audited implementations are deployed.
 *   3. Control the pace of protocol upgrades through time-delayed execution and community governance processes.
 * - Anyone is able to:
 *   1. Deploy new AssetList implementations using the current approved version with the immutable part of Compound V3 asset configurations.
 * - The contract automatically handles:
 *   1. Bytecode retrieval from BytecodeProvider with version validation and audit verification integration.
 *   2. Salt generation using internal counter to ensure unique addresses while maintaining deployment predictability.
 *   3. Deployment via inherited BaseFactory infrastructure for security and consistency.
 * - Version constraints ensure protocol security by preventing arbitrary version jumps and requiring sequential major version upgrades.
 */
contract AssetListFactoryV2 is BaseFactory, IAssetListFactoryV2 {
    /// @notice The contract type deployed by this factory: AssetList.
    bytes32 public constant ASSET_LIST_CT = "AssetList";
    /// @notice Address of timelock which can set the version of the bytecode.
    address public immutable timelock;
    /// @notice A value used for the salt generation during deployments.
    mapping(address => uint256) public counters;
    /// @notice Version of the bytecode used for deployments.
    Types.VersionWithAlternative public version;

    constructor(
        Types.VersionWithAlternative memory _initialVersion,
        IBytecodeProvider _bytecodeProvider,
        address _timelock
    ) BaseFactory(_bytecodeProvider) {
        timelock = _timelock;
        version = _initialVersion;
    }

    /* Timelock functionality */

    /// @notice Sets the version of the contract type used for the deployment.
    /// @dev Only timelock can call this function.
    /// @dev The new version's major version must be equal to previous version's major version + 1.
    /// @dev New version must be released.
    /// @param _newVersion New version of the contract type.
    function setVersion(Types.VersionWithAlternative memory _newVersion) external {
        if (msg.sender != timelock) revert OnlyTimelock();
        if (!bytecodeProvider.versionExists(Types.BytecodeVersion(ASSET_LIST_CT, _newVersion)))
            revert NonExistingVersion();

        Types.Version memory currVersion = version.version;
        Types.Version memory newVersion = _newVersion.version;

        // Cannot set the same version
        if (
            currVersion.major == newVersion.major &&
            currVersion.minor == newVersion.minor &&
            currVersion.patch == newVersion.patch
        ) {
            revert SameVersion();
        }

        if (newVersion.major == currVersion.major) {
            // Same major: minor cannot decrease (patch can be any)
            if (newVersion.minor < currVersion.minor) {
                revert InvalidMinorVersion();
            }
            // If minor stays the same, patch can be any value (allows rollback)
        } else {
            // Different major: must be incremental (+1), minor and patch can be any
            if (newVersion.major != currVersion.major + 1) {
                revert OnlyIterativeUpdate();
            }
        }

        version = _newVersion;
        emit VersionSet(_newVersion);
    }

    /* Deploy functionality */

    /// @notice Deploys a new AssetList implementation with the current version.
    /// @dev The function is compatible with Compound's AssetListFactory interface used by the Compound V3 Configurator.
    /// @dev Factors and supply caps are not part of the AssetList constructor, they are kept in the storage of the AssetList proxy.
    /// @param assetConfigs The immutable part of the asset configurations passed to the AssetList constructor.
    /// @return assetList Address of the newly deployed AssetList implementation.
    function createAssetList(
        IAssetListStructs.ImmutableAssetConfig[] calldata assetConfigs
    ) external returns (address assetList) {
        assetList = _deployContractType(
            Types.BytecodeVersion(ASSET_LIST_CT, version),
            abi.encode(assetConfigs),
            bytes32(counters[msg.sender]++)
        );
        emit AssetListCreated(assetList, assetConfigs);
    }
}
