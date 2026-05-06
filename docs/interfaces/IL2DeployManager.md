# Solidity API

## IL2DeployManager

### BytecodeRequested

```solidity
event BytecodeRequested(bytes32 _messageId, bytes32 _bytecodeHash, bytes32 _initCodeHash)
```

### BytecodeUploaded

```solidity
event BytecodeUploaded(bytes32 _bytecodeHash)
```

### ContractDeployed

```solidity
event ContractDeployed(struct Types.BytecodeVersion _bytecodeVersion, bytes _constructorParams, address _newContract, address _deployer)
```

### DeveloperAccessGranted

```solidity
event DeveloperAccessGranted(address _developer)
```

### DeveloperRevoked

```solidity
event DeveloperRevoked(address _account)
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

### ZeroAddress

```solidity
error ZeroAddress()
```

### BytecodeAlreadyUploaded

```solidity
error BytecodeAlreadyUploaded(bytes32 _bytecodeHash)
```

### InvalidBytecode

```solidity
error InvalidBytecode(bytes32 _bytecodeHash, bytes32 _initCodeHash)
```

### BytecodeNotRequested

```solidity
error BytecodeNotRequested(bytes32 _bytecodeHash)
```

### MessageType

A type of message to receive from Ethereum.

```solidity
enum MessageType {
  SEND_BYTECODE,
  BECOME_DEVELOPER,
  REVOKE_DEVELOPER
}
```

