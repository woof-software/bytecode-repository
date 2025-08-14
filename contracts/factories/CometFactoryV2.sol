pragma solidity 0.8.30;

import { IVersionController, Types } from "../interfaces/IVersionController.sol";
import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";
import { ICometFactoryV2 } from "../interfaces/ICometFactoryV2.sol";
import { Configuration, ExtConfiguration } from "../integration/CometConfiguration.sol";
import { BaseFactory } from "./BaseFactory.sol";

/**
 * @title CometFactoryV2
 * @author WOOF! Software
 * @custom:security-contact dmitriy@woof.software
 * @notice This factory contract deploys Compound Comet protocol implementations with version control and timelock governance integration for secure protocol upgrades.
 * - The contract is specifically designed for Compound V3 Configurator compatibility, enabling seamless integration with existing Compound governance and deployment infrastructure.
 * - Version management enforces iterative major version upgrades through timelock governance, preventing unauthorized or non-sequential protocol updates.
 * - Support for both standard Comet and CometWithExtendedAssetList variants enables deployment of markets with different asset capacity requirements.
 * - Automatic salt generation using an internal counter ensures unique deployment addresses while maintaining deterministic behavior for identical configurations.
 * - Integration with BytecodeRepository ecosystem provides audit verification and cross-chain deployment consistency for Comet protocol implementations.
 * - Timelock (governance contract) is able to:
 *   1. Upgrade the factory to use new major versions of Comet implementations following iterative upgrade constraints (N+1 major version only).
 *   2. Validate that new versions exist in the BytecodeRepository before approval, ensuring only audited implementations are deployed.
 *   3. Control the pace of protocol upgrades through time-delayed execution and community governance processes.
 * - Anyone is able to:
 *   1. Deploy new Comet implementations using the current approved version with Compound V3-compatible configuration structures.
 *   2. Deploy markets with custom configurations including interest rate models, collateral assets, and protocol parameters.
 * - The contract automatically handles:
 *   1. Bytecode retrieval from BytecodeProvider with version validation and audit verification integration.
 *   2. Salt generation using internal counter to ensure unique addresses while maintaining deployment predictability.
 *   3. Configuration validation and deployment via inherited BaseFactory infrastructure for security and consistency.
 *   4. Support for both standard Comet (limited asset lists) and CometWithAssetList (extended asset capacity) variants.
 * - Version constraints ensure protocol security by preventing arbitrary version jumps and requiring sequential major version upgrades.
 * - The factory maintains compatibility with existing Compound tooling while adding BytecodeRepository audit verification and cross-chain deployment capabilities.
 * - Deployment patterns follow Compound V3 standards for seamless integration with existing governance, monitoring, and operational infrastructure.
 */
contract CometFactoryV2 is BaseFactory, ICometFactoryV2 {
    /// @notice Comet contract type.
    bytes32 public immutable COMET_CT;
    /// @notice Address of timelock which can set the version of the bytecode.
    address public immutable timelock;
    /// @notice A value used for the salt generation during deployments.
    mapping(address => uint256) public counters;
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
    function setVersion(Types.VersionWithAlternative memory _newVersion) external {
        if (msg.sender != timelock) revert OnlyTimelock();
        if (!bytecodeProvider.versionExists(Types.BytecodeVersion(COMET_CT, _newVersion))) revert NonExistingVersion();
        if (version.version.major + 1 != _newVersion.version.major) revert OnlyIterativeUpdate();
        version = _newVersion;

        emit VersionSet(_newVersion);
    }

    /* Deploy functionality */

    /// @notice Deploys a new implementation of the Comet with specified version.
    /// @dev The function is compatible with the Compound V3 Configurator smart contract.
    /// @param config constructor argumets for the Comet.
    /// @return Address of the newly deployed Comet implementation.
    function clone(Configuration calldata config) external returns (address) {
        return
            _deployContractType(
                Types.BytecodeVersion(COMET_CT, version),
                abi.encode(config),
                bytes32(counters[msg.sender]++)
            );
    }
}
