// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Types } from "./Types.sol";

interface IL1DeployManager {
    event ChainConfigSet(uint256 _chainId, ChainConfig _config);
    event FactorySet(bytes32 _contractType, address _factory);
    event BytecodeSent(uint256 _chainId, Types.BytecodeVersion _bytecodeVersion);
    event ContractDeployed(
        Types.BytecodeVersion _bytecodeVersion,
        bytes _constructorParams,
        address _newContract,
        address _deployer
    );

    error UnsupportedChain(uint256 _chainId);
    error OnlyGovernor();
    error OnlyDeveloperOrGovernor();
    error BytecodeAlreadySent(uint256 _chainId, bytes32 _bytecodeHash);

    /**
     * @notice Represents a chain config.
     * @dev Fields:
     * - `l2DeployManager`: Address of L2DeployManager on the specific network
     * - `destinationChainSelector`: Chain selector for Chainlink CCIP. See https://docs.chain.link/ccip/directory/mainnet for details
     * - `gasLimit`: Gas limit for sending the message to the specific network
     */
    struct ChainConfig {
        address l2DeployManager;
        uint64 destinationChainSelector;
        uint256 gasLimit;
    }
}
