// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IVersionController, Types } from "../interfaces/IVersionController.sol";
import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";
import { ICometFactoryV2 } from "../interfaces/ICometFactoryV2.sol";
import { Configuration } from "../integration/CometConfiguration.sol";
import { BaseFactory } from "./BaseFactory.sol";

/**
 * @title InstCometFactory
 * @author WOOF! Software
 * @custom:security-contact dmitriy@woof.software
 * @notice This factory contract deploys Compound InstitutionalComet implementations with version control and timelock governance integration for secure protocol upgrades.
 * - The contract is specifically designed for Compound V3 Configurator compatibility, enabling seamless integration with existing Compound governance and deployment infrastructure.
 * - Version management enforces iterative major version upgrades through timelock governance, preventing unauthorized or non-sequential protocol updates.
 * - Deployment targets the InstitutionalComet implementation, an extended asset list Comet tailored for institutional markets.
 * - Automatic salt generation using an internal counter ensures unique deployment addresses while maintaining deterministic behavior for identical configurations.
 * - Integration with BytecodeRepository ecosystem provides audit verification and cross-chain deployment consistency for Comet protocol implementations.
 * - Timelock (governance contract) is able to:
 *   1. Upgrade the factory to use new major versions of Comet implementations following iterative upgrade constraints (N+1 major version only).
 *   2. Validate that new versions exist in the BytecodeRepository before approval, ensuring only audited implementations are deployed.
 *   3. Control the pace of protocol upgrades through time-delayed execution and community governance processes.
 * - Anyone is able to:
 *   1. Deploy new InstitutionalComet implementations using the current approved version with Compound V3-compatible configuration structures.
 *   2. Deploy markets with custom configurations including interest rate models, collateral assets, and protocol parameters.
 * - The contract automatically handles:
 *   1. Bytecode retrieval from BytecodeProvider with version validation and audit verification integration.
 *   2. Salt generation using internal counter to ensure unique addresses while maintaining deployment predictability.
 *   3. Configuration validation and deployment via inherited BaseFactory infrastructure for security and consistency.
 *   4. Deployment of the InstitutionalComet implementation, providing extended asset capacity.
 * - Version constraints ensure protocol security by preventing arbitrary version jumps and requiring sequential major version upgrades.
 * - The factory maintains compatibility with existing Compound tooling while adding BytecodeRepository audit verification and cross-chain deployment capabilities.
 * - Deployment patterns follow Compound V3 standards for seamless integration with existing governance, monitoring, and operational infrastructure.
 */
contract InstCometFactory is BaseFactory, ICometFactoryV2 {
    /// @notice The contract type deployed by this factory: InstitutionalComet.
    bytes32 public constant COMET_CT = "InstitutionalComet";
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
        if (!bytecodeProvider.versionExists(Types.BytecodeVersion(COMET_CT, _newVersion))) revert NonExistingVersion();

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

    /// @notice Deploys a new InstitutionalComet implementation with the current version.
    /// @dev The function is compatible with the Compound V3 Configurator smart contract.
    /// @param config constructor argumets for the InstitutionalComet.
    /// @return Address of the newly deployed InstitutionalComet implementation.
    function clone(Configuration calldata config) external returns (address) {
        return
            _deployContractType(
                Types.BytecodeVersion(COMET_CT, version),
                abi.encode(config),
                bytes32(counters[msg.sender]++)
            );
    }
}
