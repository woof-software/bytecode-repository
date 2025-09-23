// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { IVersionController } from "../interfaces/IVersionController.sol";
import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";

/**
 * @title BaseFactory
 * @author WOOF! Software
 * @custom:security-contact dmitriy@woof.software
 * @notice This abstract contract provides standardized deployment infrastructure for factory contracts that deploy audited bytecode with deterministic CREATE2 addresses.
 * - The contract abstracts bytecode retrieval from BytecodeProviders (VersionController on L1 or L2DeployManager on L2 networks) enabling unified deployment patterns across chains.
 * - All deployments use CREATE2 with deployer-specific salt generation, ensuring deterministic addresses while preventing deployment conflicts between different users.
 * - Address computation functions enable predictable contract addresses before deployment for integration planning and multi-chain coordination.
 * - The abstract design allows specialized factory contracts to inherit standardized deployment functionality while implementing domain-specific deployment logic.
 * - Internal functions provide:
 *   1. Bytecode retrieval from configured BytecodeProvider with version validation and audit verification integration.
 *   2. CREATE2 deployment with automatic salt generation combining user-provided salt and deployer address for uniqueness.
 *   3. Address computation using identical salt logic as deployment functions for predictable contract addresses.
 *   4. Utility functions for bytecode preparation and address manipulation required for complex deployment patterns.
 * - Salt generation methodology ensures:
 *   1. Unique contract addresses for each deployer using the same salt, preventing deployment conflicts and enabling parallel deployments.
 *   2. Deterministic addresses for the same deployer and salt combination across all networks, enabling consistent multi-chain UX.
 *   3. Predictable address computation before deployment for integration planning and cross-chain address verification.
 * - Bytecode validation is handled by the underlying BytecodeProvider, ensuring only audited and verified contracts can be deployed.
 * - The contract serves as the foundation for all specialized factory contracts in the BytecodeRepository ecosystem, promoting code reuse and consistent behavior.
 * - Derived factory contracts can focus on protocol-specific logic while inheriting battle-tested deployment infrastructure and security guarantees.
 * - Address computation functions support both single-contract and multi-contract deployment patterns required for complex protocols and interconnected systems.
 */
abstract contract BaseFactory {
    /// @notice Smart contract to retrieve bytecodes from. Can be either VersionController or L2DeployManager.
    IBytecodeProvider public immutable bytecodeProvider;

    constructor(IBytecodeProvider _bytecodeProvider) {
        bytecodeProvider = _bytecodeProvider;
    }

    /* Internal helpers */

    /// @notice Retrieves bytecode from Bytecode provider.
    /// @param _bytecodeVersion Version of contract type to retrieve.
    /// @return Bytecode.
    function _getInitCode(
        IVersionController.BytecodeVersion memory _bytecodeVersion
    ) internal view returns (bytes memory) {
        return bytecodeProvider.getVerifiedBytecode(_bytecodeVersion);
    }

    /// @notice Prepares bytecode with params and deploys a smart contract of specified contract type and version.
    /// @dev Uses Create2 library by OpenZeppelin.
    /// @dev Unique salt for deployment consists of _salt and msg.sender address.
    /// @param _bytecodeVersion Version of contract to deploy.
    /// @param _constructorArgs Encoded constructor arguments.
    /// @param _salt Parameter necessary for deployment via Create2.
    /// @return Address of deployed smart contract.
    function _deployContractType(
        IVersionController.BytecodeVersion memory _bytecodeVersion,
        bytes memory _constructorArgs,
        bytes32 _salt
    ) internal returns (address) {
        bytes memory initCode = _getInitCode(_bytecodeVersion);
        bytes memory bytecodeWithParams = abi.encodePacked(initCode, _constructorArgs);
        return _deployContract(bytecodeWithParams, _salt);
    }

    /// @notice Deploys a smart contract of specified contract type and version.
    /// @param _bytecodeWithParams Encoded bytecode and constructor arguments.
    /// @param _salt Parameter necessary for deployment via Create2.
    /// @return Address of deployed smart contract.
    function _deployContract(bytes memory _bytecodeWithParams, bytes32 _salt) internal returns (address) {
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, msg.sender));
        return Create2.deploy(0, uniqueSalt, _bytecodeWithParams);
    }

    /// @notice Prepares bytecode with params and computes a pre-deployed address of smart contract.
    /// @dev Uses Create2 library by OpenZeppelin.
    /// @param _bytecodeVersion Version of contract to compute pre-deployed address for.
    /// @param _constructorArgs Encoded constructor arguments.
    /// @param _salt Parameter necessary for deployment via Create2.
    /// @param _deployer Address of the deployer. Necessary for unique salt generation.
    /// @return Address of deployed smart contract.
    function _computeContractTypeAddress(
        IVersionController.BytecodeVersion memory _bytecodeVersion,
        bytes memory _constructorArgs,
        bytes32 _salt,
        address _deployer
    ) internal view returns (address) {
        bytes memory initCode = _getInitCode(_bytecodeVersion);
        bytes memory bytecodeWithParams = abi.encodePacked(initCode, _constructorArgs);
        return _computeContractAddress(bytecodeWithParams, _salt, _deployer);
    }

    /// @notice Computes a pre-deployed address of smart contract.
    /// @param _bytecodeWithParams Encoded bytecode and constructor arguments.
    /// @param _salt Parameter necessary for deployment via Create2.
    /// @param _deployer Address of the deployer. Necessary for unique salt generation.
    /// @return Address of deployed smart contract.
    function _computeContractAddress(
        bytes memory _bytecodeWithParams,
        bytes32 _salt,
        address _deployer
    ) internal view returns (address) {
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, _deployer));
        return Create2.computeAddress(uniqueSalt, keccak256(_bytecodeWithParams));
    }

    /// @notice A helper functon for converting address into bytes32.
    /// @param addr Address to convert.
    /// @return result Address encoded into bytes32.
    function addressToBytes32(address addr) internal pure returns (bytes32 result) {
        assembly {
            result := shl(96, addr) // shift left by 12 bytes (96 bits) to pad with zeros
        }
    }
}
