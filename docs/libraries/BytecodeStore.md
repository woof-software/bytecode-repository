# Solidity API

## BytecodeStore

### BYTECODE_VERSION_TYPEHASH

```solidity
bytes32 BYTECODE_VERSION_TYPEHASH
```

Bytecode version typehash.

### CHUNK_SIZE

```solidity
uint256 CHUNK_SIZE
```

small buffer to account for `SSTORE2` overhead.

### InitCodeIsEmpty

```solidity
error InitCodeIsEmpty()
```

### _computeBytecodeHash

```solidity
function _computeBytecodeHash(bytes32 _contractType, struct Types.VersionWithAlternative _version) internal pure returns (bytes32)
```

### _writeInitCode

```solidity
function _writeInitCode(bytes _initCode) internal returns (address[])
```

Writes the bytecode in the storage.

_Utilizes SSTORE2 for storing the bytecode.
Bytecode must not be empty.
The size of chunk is set to 24500 to leave small buffer for SSTORE2 metadata._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _initCode | bytes | Bytecode to store. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | An array of pointer addresses at which parts of bytecode was stored. |

### _readInitCode

```solidity
function _readInitCode(address[] _initCodePtrs) internal view returns (bytes)
```

Returns the bytecode stored at given address pointers.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _initCodePtrs | address[] | Address pointers at which parts of the bytecode is stored. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes | Bytecode stored at the given pointers. |

