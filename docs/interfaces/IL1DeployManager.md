# Solidity API

## IL1DeployManager

### ChainConfigSet

```solidity
event ChainConfigSet(uint256 _chainId, struct IL1DeployManager.ChainConfig _config)
```

### FactorySet

```solidity
event FactorySet(bytes32 _contractType, address _factory)
```

### BytecodeSent

```solidity
event BytecodeSent(uint256 _chainId, struct Types.BytecodeVersion _bytecodeVersion)
```

### UnsupportedChain

```solidity
error UnsupportedChain(uint256 _chainId)
```

### OnlyGovernor

```solidity
error OnlyGovernor()
```

### OnlyDeveloper

```solidity
error OnlyDeveloper()
```

### BytecodeAlreadySent

```solidity
error BytecodeAlreadySent(uint256 _chainId, bytes32 _bytecodeHash)
```

### ChainConfig

Represents a chain config.

_Fields:
- `l2DeployManager`: Address of L2DeployManager on the specific network
- `destinationChainSelector`: Chain selector for Chainlink CCIP. See https://docs.chain.link/ccip/directory/mainnet for details
- `gasLimit`: Gas limit for sending the message to the specific network_

```solidity
struct ChainConfig {
  address l2DeployManager;
  uint64 destinationChainSelector;
  uint256 gasLimit;
}
```

