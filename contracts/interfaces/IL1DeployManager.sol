pragma solidity 0.8.30;

import { IVersionController } from "./IVersionController.sol";

interface IL1DeployManager {
    event ChainConfigSet(uint256 _chainId, ChainConfig _config);
    event FactorySet(bytes32 _contractType, address _factory);
    event BytecodeSent(uint256 _chainId, IVersionController.BytecodeVersion _bytecodeVersion);

    error UnsupportedChain(uint256 _chainId);
    error OnlyGovernor();
    error OnlyDeveloper();
    error InsufficientBalance();
    error BytecodeAlreadySent(uint256 _chainId, bytes32 _bytecodeHash);

    struct DeployData {
        bytes32 contractType;
        uint256 chainId;
    }

    struct ChainConfig {
        address l2DeployManager;
        uint64 destinationChainSelector;
        uint256 gasLimit;
    }
}
