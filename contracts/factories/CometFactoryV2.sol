pragma solidity 0.8.30;

import { IVersionController, Types } from "../interfaces/IVersionController.sol";
import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";
import { ICometFactoryV2 } from "../interfaces/ICometFactoryV2";
import { Configuration, ExtConfiguration } from "../integration/CometConfiguration.sol";
import { BaseFactory } from "./BaseFactory.sol";

contract CometFactoryV2 is BaseFactory, ICometFactoryV2 {
    /// @notice Comet contract type.
    bytes32 public immutable COMET_CT;
    /// @notice Address of timelock which can set the version of the bytecode.
    address public immutable timelock;
    /// @notice A value used for the salt generation during deployments.
    uint256 public counter;
    /// @notice Version of the bytecode used for deployments.
    Types.VersionWithAlternative public version;

    constructor(
        Types.VersionWithAlternative memory _initialVersion,
        IBytecodeProvider _bytecodeProvider,
        address _timelock,
        bool _withAssetList
    ) BaseFactory(_bytecodeProvider) {
        timelock = _timelock;
        version = _initialVersion;
        COMET_CT = _withAssetList ? bytes32("CometWithAssetList") : bytes32("Comet");
    }

    /* Timelock functionality */

    /// @notice Sets the version of the contract type used for the deployment.
    /// @dev Only timelock can call this function.
    /// @dev The new version's major version must be equal to previous version's major version + 1.
    /// @dev New version must be released.
    /// @param _newVersion New version of the contract type.
    function setVersion(Types.VersionWithAlternative calldata _newVersion) external {
        Types.VersionWithAlternative storage _version = version;
        if (msg.sender != timelock) revert OnlyTimelock();
        if (!bytecodeProvider.versionExists(Types.BytecodeVersion(COMET_CT, _newVersion))) revert NonExistingVersion();
        if (_version.version.major + 1 != _newVersion.version.major) revert OnlyIterativeUpdate();
        version = _version;

        emit VersionSet(_newVersion);
    }

    /* Deploy functionality */

    /// @notice Deploys a new implementation of the Comet with specified version.
    /// @dev The function is compatible with the Compound V3 Configurator smart contract.
    /// @param config constructor argumets for the Comet.
    /// @return Address of the newly deployed Comet implementation.
    function clone(Configuration calldata config) external returns (address) {
        return _deployContractType(Types.BytecodeVersion(COMET_CT, version), abi.encode(config), bytes32(counter++));
    }
}
