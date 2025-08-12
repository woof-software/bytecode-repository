pragma solidity 0.8.30;

import { IVersionController, Types } from "../interfaces/IVersionController.sol";
import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";
import { Configuration, ExtConfiguration } from "../integration/CometConfiguration.sol";
import { BaseFactory } from "./BaseFactory.sol";

contract CometFactoryV2 is BaseFactory {
    /// @notice Comet contract type.
    bytes32 public immutable COMET_CT = "Comet";
    address public immutable timelock;
    uint256 public counter;
    Types.VersionWithAlternative public version;

    error OnlyTimelock();
    error OnlyIterativeUpdate();
    error NonExistingVersion();
    event VersionSet(Types.VersionWithAlternative _newVersion);

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

    function setVersion(Types.VersionWithAlternative calldata _newVersion) external {
        Types.VersionWithAlternative storage _version = version;
        if (msg.sender != timelock) revert OnlyTimelock();
        if (!bytecodeProvider.versionExists(Types.BytecodeVersion(COMET_CT, _newVersion))) revert NonExistingVersion();
        if (_version.version.major + 1 != _newVersion.version.major) revert OnlyIterativeUpdate();
        version = _version;

        emit VersionSet(_newVersion);
    }

    /* Deploy functionality */

    function clone(Configuration calldata config) external returns (address) {
        return _deployContractType(Types.BytecodeVersion(COMET_CT, version), abi.encode(config), bytes32(counter++));
    }
}
