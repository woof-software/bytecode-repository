# Solidity API

## IL2DeployManager

### BytecodeReceived

```solidity
event BytecodeReceived(bytes32 _messageId, bytes32 _bytecodeHash)
```

### ContractDeployed

```solidity
event ContractDeployed(struct Types.BytecodeVersion _bytecodeVersion, bytes _constructorParams, address _newContract, address _deployer)
```

### DeveloperAccessGranted

```solidity
event DeveloperAccessGranted(address _developer)
```

### InvalidSender

```solidity
error InvalidSender()
```

### OnlyTimelock

```solidity
error OnlyTimelock()
```

### BytecodeIsEmpty

```solidity
error BytecodeIsEmpty()
```

### OnlyDeveloperOrGovernor

```solidity
error OnlyDeveloperOrGovernor()
```

### MessageType

A type of message to receive from Ethereum.

```solidity
enum MessageType {
  SEND_BYTECODE,
  BECOME_DEVELOPER
}
```

