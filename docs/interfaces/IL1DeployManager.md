# Solidity API

## IL1DeployManager

### ChainConfigSet

```solidity
event ChainConfigSet(uint256 _chainId, struct IL1DeployManager.ChainConfig _config)
```

### BytecodeSent

```solidity
event BytecodeSent(uint256 _chainId, struct Types.BytecodeVersion _bytecodeVersion)
```

### DeveloperAccessRequested

```solidity
event DeveloperAccessRequested(uint256 _chainId, address _developer)
```

### ContractDeployed

```solidity
event ContractDeployed(struct Types.BytecodeVersion _bytecodeVersion, bytes _constructorParams, address _newContract, address _deployer)
```

### UnsupportedChain

```solidity
error UnsupportedChain(uint256 _chainId)
```

### OnlyGovernor

```solidity
error OnlyGovernor()
```

### OnlyDeveloperOrGovernor

```solidity
error OnlyDeveloperOrGovernor()
```

### BytecodeAlreadySent

```solidity
error BytecodeAlreadySent(uint256 _chainId, bytes32 _bytecodeHash)
```

### MessageType

A type of message to send to other chain.

```solidity
enum MessageType {
  SEND_BYTECODE,
  BECOME_DEVELOPER
}
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

