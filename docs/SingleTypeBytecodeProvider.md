# Solidity API

## SingleTypeBytecodeProvider

A minimal, self-contained {IBytecodeProvider} serving the bytecode of a SINGLE contract type.
- The contract type is fixed at construction time and can never change. Queries for any other contract
  type report the version as non-existing.
- Multiple versions of that one contract type can be hosted simultaneously, which is what allows
  {CometFactoryV2-setVersion} (enforcing incremental major upgrades) to be exercised.
- Bytecode is stored via SSTORE2 (see {BytecodeStore}) with the same version-hashing scheme as the
  {VersionController}, so version hashes are identical across the ecosystem.
- The Uploader (UPLOADER_ROLE, granted to the initial admin) is able to:
  1. Upload the init code for a given version of the fixed contract type.
  2. Re-upload a version to correct a faulty upload (see {uploadBytecode}).
- The Admin (DEFAULT_ADMIN_ROLE) is able to grant and revoke the UPLOADER_ROLE.
- No audit verification is performed: `getVerifiedBytecode` returns any uploaded bytecode. Use
  {getInitCodeHash} to confirm the uploaded init code matches the source repository byte-for-byte,
  which is what guarantees identical CREATE2 addresses across networks.
- This contract is a deployment aid, NOT a governance-grade bytecode repository: it carries none of the
  audit, cooldown or developer-hierarchy guarantees of the full {VersionController}.

### UPLOADER_ROLE

```solidity
bytes32 UPLOADER_ROLE
```

Uploader role for AccessControl. Uploaders can upload bytecode.

### contractType

```solidity
bytes32 contractType
```

The single contract type served by this provider. Fixed at construction time.

### initCodeHashes

```solidity
mapping(bytes32 => bytes32) initCodeHashes
```

Hash of the uploaded init code for given bytecode version hash.

### BytecodeUploaded

```solidity
event BytecodeUploaded(bytes32 _contractType, struct Types.VersionWithAlternative _version, bytes32 _initCodeHash)
```

### ZeroAddress

```solidity
error ZeroAddress()
```

### ZeroContractType

```solidity
error ZeroContractType()
```

### WrongContractType

```solidity
error WrongContractType(bytes32 _expected, bytes32 _provided)
```

### BytecodeNotUploaded

```solidity
error BytecodeNotUploaded(bytes32 _contractType, struct Types.VersionWithAlternative _version)
```

### constructor

```solidity
constructor(bytes32 _contractType, address _initialAdmin) public
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | The single contract type this provider serves, e.g. "CometWithAssetList". |
| _initialAdmin | address | An address that receives the DEFAULT_ADMIN_ROLE and the UPLOADER_ROLE. |

### uploadBytecode

```solidity
function uploadBytecode(struct Types.VersionWithAlternative _version, bytes _initCode) external
```

Uploads the init code for a given version of this provider's contract type.

_Can only be called by an uploader.
Re-uploading an already populated version overwrites it, which allows a faulty upload to be
corrected without redeploying this contract. The previously written SSTORE2 pointers are simply
orphaned. Take care when overwriting a version a factory already points at, as this silently
changes what that factory deploys.
Init code must not be empty (enforced by {BytecodeStore})._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.VersionWithAlternative | The version to upload the bytecode for. |
| _initCode | bytes | The creation (init) code of the contract, without constructor arguments. |

### getVerifiedBytecode

```solidity
function getVerifiedBytecode(struct Types.BytecodeVersion _version) external view returns (bytes)
```

Returns the uploaded bytecode of the specified version.

_No audit verification is enforced. Reverts if the contract type does not match this
provider's contract type, or if nothing was uploaded for the version._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | A bytecode version for which to return bytecode. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes | The init code of the specified version. |

### versionExists

```solidity
function versionExists(struct Types.BytecodeVersion _version) external view returns (bool)
```

Validates if bytecode was uploaded for the specified version.

_Returns false for any contract type other than this provider's contract type._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | A bytecode version to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | A boolean flag indicating if the version exists. True if exists, false otherwise. |

### getInitCodeHash

```solidity
function getInitCodeHash(struct Types.BytecodeVersion _version) external view returns (bytes32)
```

Returns the init code hash of the uploaded bytecode of the specified version.

_Use this to verify that the bytecode uploaded here is byte-for-byte identical to the one
registered in the canonical repository on another network, which is what guarantees identical
CREATE2 deployment addresses._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | A bytecode version for which to return the init code hash. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | The init code hash of the specified version. |

### isDeveloper

```solidity
function isDeveloper(address _account) external view returns (bool)
```

Validates if given account is allowed to upload bytecode.

_Required by {IBytecodeProvider}. Not used by {CometFactoryV2}, whose `clone` is permissionless
and whose `setVersion` is timelock-gated._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Address to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | true if the account is an uploader, false otherwise. |

### computeBytecodeHash

```solidity
function computeBytecodeHash(bytes32 _contractType, struct Types.VersionWithAlternative _version) public pure returns (bytes32)
```

Computes a bytecode version hash for specified contract type and its version.

_Uses the same scheme as the {VersionController}, so hashes match across the ecosystem._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract for which to compute hash. |
| _version | struct Types.VersionWithAlternative | A version of specified contract type for which to compute hash. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | Hash of specified bytecode version. |

