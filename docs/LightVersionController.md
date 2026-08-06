# Solidity API

## LightVersionController

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ⚠️  TEST BYTECODE REGISTRY ONLY — NOT FOR PRODUCTION USE  ⚠️         │
│                                                                         │
│   This registry stores bytecode exclusively for live, on-chain testing  │
│   of protocol features. It carries no guarantees whatsoever: bytecode   │
│   may be unaudited, incorrect, or removed/abandoned at any              │
│   moment without notice. It is NOT the canonical VersionController — it │
│   omits audit verification, cooldowns, and the developer hierarchy.     │
│                                                                         │
│   The DAO has NO control over this registry: no governance,             │
│   no pause, no recovery, no upgrades.                                   │
│                                                                         │
│   The same applies to EVERY contract deployed from bytecode served by   │
│   this instance: none of them are for production use, do not ever       │
│   deposit funds you are not willing to risk into them.                  │
│   Any assets supplied should be considered permanently at risk          │
│   and potentially unrecoverable.                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
A lightweight variant of the {VersionController} intended for test deployments.
- Acts purely as an {IBytecodeProvider}: it stores versioned bytecode, while deployment is performed
  by an external deploy manager (e.g. {L1DeployManager}) that retrieves bytecode from here.
- The Admin (DEFAULT_ADMIN_ROLE) assigns and removes developers.
- This contract is NOT for production use: it removes the security guarantees of the full
  {VersionController} and exists purely to streamline test deployments.

### DEVELOPER_ROLE

```solidity
bytes32 DEVELOPER_ROLE
```

Developer role for AccessControl. Developers can release bytecode.

### latestVersions

```solidity
mapping(bytes32 => struct Types.Version) latestVersions
```

Stores the latest available version for given contract type.

### latestMinor

```solidity
mapping(bytes32 => mapping(uint64 => uint64)) latestMinor
```

Stores the latest available minor version for given contract type and major version.

### latestPatch

```solidity
mapping(bytes32 => mapping(uint64 => mapping(uint64 => uint64))) latestPatch
```

Stores the latest available patch version for given contract type, major and minor versions.

### bytecodes

```solidity
mapping(bytes32 => struct Types.Bytecode) bytecodes
```

Stores the bytecode information for given bytecode version hash.

### testingPurpose

```solidity
string testingPurpose
```

Describes the testing purpose of this smart contract.

### BytecodeUploaded

```solidity
event BytecodeUploaded(bytes32 _contractType, struct Types.Version _version)
```

### ZeroAddress

```solidity
error ZeroAddress()
```

### NotDeveloper

```solidity
error NotDeveloper(address _account)
```

### BytecodeAlreadyReleased

```solidity
error BytecodeAlreadyReleased(bytes32 _contractType)
```

### BytecodeNotReleased

```solidity
error BytecodeNotReleased(bytes32 _contractType)
```

### NonExistingMajorVersion

```solidity
error NonExistingMajorVersion(bytes32 _contractType, uint64 _major)
```

### NonExistingMinorVersion

```solidity
error NonExistingMinorVersion(bytes32 _contractType, uint64 _major, uint64 _minor)
```

### NonExistingVersion

```solidity
error NonExistingVersion(bytes32 _contractType, struct Types.VersionWithAlternative _version)
```

### VersionAlreadyExists

```solidity
error VersionAlreadyExists(bytes32 _contractType, struct Types.VersionWithAlternative _version)
```

### EmptyURL

```solidity
error EmptyURL()
```

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(address _initialAdmin, string _testingPurpose) external
```

Initializes the contract and grants the admin role.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _initialAdmin | address | An address that receives the DEFAULT_ADMIN_ROLE. |
| _testingPurpose | string | Testing purpose of LightVersionController. |

### onlyDeveloper

```solidity
modifier onlyDeveloper()
```

Validates that the caller is a developer.

### bytecodeReleased

```solidity
modifier bytecodeReleased(bytes32 _contractType)
```

Validates if initial bytecode for specified contract type is already released.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract for which to validate if bytecode is released. |

### checkURL

```solidity
modifier checkURL(string _url)
```

### releaseBytecode

```solidity
function releaseBytecode(struct Types.BytecodeInput _bytecodeInput) external
```

Releases an initial version of the contract type.

_Contract type can only be released once.
Any developer can release any contract type without prior registration.
Sets the initial version to "1.0.0"._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeInput | struct Types.BytecodeInput | A struct of params necessary to upload the bytecode. |

### releaseMajorVersion

```solidity
function releaseMajorVersion(struct Types.BytecodeInput _bytecodeInput) external
```

Releases a new major version of the contract type.

_Can only be called if initial bytecode was released for contract type.
Increments a previously stored major version. E.g. "1.0.3" becomes "2.0.0"._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeInput | struct Types.BytecodeInput | A struct of params necessary to upload the bytecode. |

### releaseMinorVersion

```solidity
function releaseMinorVersion(struct Types.BytecodeInput _bytecodeInput, uint64 _major) external
```

Releases a new minor version of the contract type for specified major version.

_Specified major version must exist.
Increments a previously stored minor version of specified major version. E.g. latest "4.2.1"
with `_major` = 4 becomes "4.3.0"._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeInput | struct Types.BytecodeInput | A struct of params necessary to upload the bytecode. |
| _major | uint64 | A major version for which to release new minor version. |

### releasePatchVersion

```solidity
function releasePatchVersion(struct Types.BytecodeInput _bytecodeInput, uint64 _major, uint64 _minor) external
```

Releases a new patch version of the contract type for specified major and minor versions.

_Specified major and minor versions must exist.
Increments a previously stored patch version. E.g. latest "4.3.2" with `_major` = 4 and
`_minor` = 3 becomes "4.3.3"._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeInput | struct Types.BytecodeInput | A struct of params necessary to upload the bytecode. |
| _major | uint64 | A major version for which to release new patch version. |
| _minor | uint64 | A minor version for which to release new patch version. |

### releaseAlternativeVersion

```solidity
function releaseAlternativeVersion(struct Types.BytecodeInput _bytecodeInput, struct Types.VersionWithAlternative _version) external
```

Releases an alternative version for specified contract type and version.

_Specified version, for which alternative is released, must exist._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeInput | struct Types.BytecodeInput | A struct of params necessary to upload the bytecode. |
| _version | struct Types.VersionWithAlternative | A struct containing the core version for which to release an alternative and the alternative label to release. |

### computeBytecodeHash

```solidity
function computeBytecodeHash(bytes32 _contractType, struct Types.VersionWithAlternative _version) public pure returns (bytes32)
```

Computes a bytecode version hash for specified contract type and its version.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract for which to compute hash. |
| _version | struct Types.VersionWithAlternative | A version of specified contract type for which to compute hash. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | Hash of specified bytecode version. |

### isDeveloper

```solidity
function isDeveloper(address _account) public view returns (bool)
```

Validates if given account is a developer.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Address to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | true if account is a developer, false otherwise. |

### getLatestVersion

```solidity
function getLatestVersion(bytes32 _contractType) external view returns (string)
```

Returns the latest version for given contract type in human-readable format.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract for which to return latest version. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | Latest version for given contract type. E.g. "2.3.0". |

### versionExists

```solidity
function versionExists(struct Types.BytecodeVersion _version) public view returns (bool)
```

Validates if a specified bytecode version exists based on struct with contract type and version.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | A bytecode version to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | A boolean flag indicating if the version exists. True if exists, false otherwise. |

### versionExists

```solidity
function versionExists(bytes32 _bytecodeHash) public view returns (bool)
```

Validates if a specified bytecode version exists based on bytecode version hash.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeHash | bytes32 | A bytecode version hash to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | A boolean flag indicating if the version exists. True if exists, false otherwise. |

### getVerifiedBytecode

```solidity
function getVerifiedBytecode(struct Types.BytecodeVersion _version) external view returns (bytes)
```

Returns any registered bytecode of a specified contract type and version.

_No audit verification is enforced. Reverts only if the version does not exist._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | A bytecode version for which to return bytecode. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes | A bytecode of specified contract type and version. |

### getVerifiedInitCodeHash

```solidity
function getVerifiedInitCodeHash(struct Types.BytecodeVersion _version) external view returns (bytes32)
```

Returns the init code hash of any registered bytecode of a specified contract type and version.

_No audit verification is enforced. Reverts only if the version does not exist._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | A bytecode version for which to return init code hash. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | Init code hash of specified contract type and version. |

### getAllAlternativeVersions

```solidity
function getAllAlternativeVersions(bytes32 _contractType) external view returns (struct Types.VersionWithAlternative[])
```

Returns all alternative versions for given contract type.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract for which to return alternative versions. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct Types.VersionWithAlternative[] | Array containing all the alternative versions of given contract type. |

### _uploadBytecode

```solidity
function _uploadBytecode(struct Types.BytecodeInput _bytecodeInput, struct Types.VersionWithAlternative _version) internal
```

Stores the bytecode of given contract type and version.

_Validates that the version slot (contract type + version) does not already exist. The same
raw init code may be uploaded multiple times (e.g. reused across contract types or versions)._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeInput | struct Types.BytecodeInput | A struct of params containing info about bytecode. |
| _version | struct Types.VersionWithAlternative | A new version of bytecode for which it is uploaded. |

### _getBytecode

```solidity
function _getBytecode(struct Types.BytecodeVersion _version) internal view returns (bytes)
```

Reads the registered bytecode for a given version, reverting if the version does not exist.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | A bytecode version for which to return bytecode. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes | A bytecode of specified contract type and version. |

### _versionToStr

```solidity
function _versionToStr(struct Types.VersionWithAlternative _version) internal pure returns (string)
```

Returns given version in human-readable format. E.g. "4.3.0".

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.VersionWithAlternative | Version of the bytecode. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | A string containing the version. |

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address newImplementation) internal
```

_Function that should revert when `msg.sender` is not authorized to upgrade the contract. Called by
{upgradeToAndCall}.

Normally, this function will use an xref:access.adoc[access control] modifier such as {Ownable-onlyOwner}.

```solidity
function _authorizeUpgrade(address) internal onlyOwner {}
```_

