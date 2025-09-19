# Solidity API

## VersionController

assignDeveloperForContractType
This contract manages versioned smart contract bytecode storage, developer role assignment, and cryptographic audit verification for cross-chain deployment systems.
- The contract implements semantic versioning (Major.Minor.Patch) with support for alternative versions (e.g., "gas-optimized", "minimal") for the same base version.
- Bytecode is stored using SSTORE2 optimization.
- Role-based access control with hierarchical permissions: Governor (admin) → Key Developer (contract type owner) → Sub Developer (team member, max 3 per key developer).
- Audit verification system using EIP-712 cryptographic signatures ensures only verified bytecode can be deployed.
- Governor is able to:
  1. Assign key developers to specific contract types (bytes32 identifiers) for specialized development workflows.
  2. Grant and revoke auditor roles for bytecode verification authority.
  3. Manage system-wide permissions and upgrade the contract via UUPS proxy pattern.
- Key Developers are able to:
  1. Release bytecode versions (initial, major, minor, patch, alternative) for their assigned contract types.
  2. Add and remove sub-developers (maximum 3) to scale their development team.
  3. Manage version history and alternative implementations for their contract types.
- Sub Developers are able to:
  1. Release bytecode versions for their key developer's assigned contract types.
  2. Access the same versioning functions as key developers within their permitted scope.
- Auditors are able to:
  1. Submit EIP-712 signed audit reports verifying bytecode security and compliance.
  2. Attach audit report URLs (IPFS/Arweave) to specific bytecode hashes for transparency.
- Version management follows semantic versioning principles with automatic incrementing and validation of version dependencies.
- All bytecode is stored immutably with cryptographic integrity guarantees, and audit signatures provide unforgeable verification records.
- The contract serves as the canonical repository for all the bytecodes for L1 (Ethereum) and integrates with L1DeployManager for cross-chain bytecode distribution via Chainlink CCIP.

### AUDIT_REPORT_TYPEHASH

```solidity
bytes32 AUDIT_REPORT_TYPEHASH
```

Audit report typehash.

### KEY_DEVELOPER_ROLE

```solidity
bytes32 KEY_DEVELOPER_ROLE
```

Key Developer role for AccessControl.

### SUB_DEVELOPER_ROLE

```solidity
bytes32 SUB_DEVELOPER_ROLE
```

Sub Developer role for AccessControl.

### AUDITOR_ROLE

```solidity
bytes32 AUDITOR_ROLE
```

Auditor role for AccessControl.

### GUARDIAN_ROLE

```solidity
bytes32 GUARDIAN_ROLE
```

Guardian role for AccessControl.

### SUB_DEVELOPERS_LIMIT

```solidity
uint256 SUB_DEVELOPERS_LIMIT
```

A limit of sub developers per key developer.

### MAJOR_RELEASE_COOLDOWN

```solidity
uint256 MAJOR_RELEASE_COOLDOWN
```

A period of time which should pass before releasing a new major version.

### MINOR_RELEASE_COOLDOWN

```solidity
uint256 MINOR_RELEASE_COOLDOWN
```

A period of time which should pass before releasing a new minor version.

### PATCH_RELEASE_COOLDOWN

```solidity
uint256 PATCH_RELEASE_COOLDOWN
```

A period of time which should pass before releasing a new patch version.

### contractTypeKeyDeveloper

```solidity
mapping(bytes32 => address) contractTypeKeyDeveloper
```

Stores current key developer for given contract type.

### subToKeyDeveloper

```solidity
mapping(address => address) subToKeyDeveloper
```

Stores a key developer for given sub developer.

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

Stores the bytecode information for given bytecode hash.

### minMajorReleaseTimestamp

```solidity
mapping(bytes32 => uint64) minMajorReleaseTimestamp
```

Stores the next minimum release timestamp of major version for given contract type.

### minPatchReleaseTimestamp

```solidity
mapping(bytes32 => uint64) minPatchReleaseTimestamp
```

Stores the next minimum release timestamp of patch version for all versions for given contract type.

### minMinorReleaseTimestamp

```solidity
mapping(bytes32 => mapping(uint256 => uint64)) minMinorReleaseTimestamp
```

Stores the next minimum release timestamp of minor version for given contract type and its major version.

### isBytecodeUploaded

```solidity
mapping(bytes32 => bool) isBytecodeUploaded
```

Stores the status of bytecode uploading. keccak256(initCode) => boolean status.

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(address _governor, address _guardian) external
```

### checkDeveloper

```solidity
modifier checkDeveloper(bytes32 _contractType, address _developer)
```

Validates if the function is called by key developer of corresponding sub developer.

_Additionally checks if developer has an appropriate role._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract for which to validate developer. |
| _developer | address | An address of developer to validate. |

### bytecodeReleased

```solidity
modifier bytecodeReleased(bytes32 _contractType)
```

Validates if initial bytecode for specified contract type is already released.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract for which to validate if bytecode is released. |

### checkReleaseTimestamp

```solidity
modifier checkReleaseTimestamp(uint64 _minNextReleaseTimestamp)
```

Validates if provided release timestamp is reached and a new version can be released.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minNextReleaseTimestamp | uint64 | Minimum next release timestamp. |

### checkURL

```solidity
modifier checkURL(string _url)
```

### assignDeveloperForContractType

```solidity
function assignDeveloperForContractType(bytes32 _contractType, address _keyDeveloper) external
```

Assigns a new key developer for a certain contract type.

_Governor can use this function to initializes contract type and forcibly assign new key developer.
Grants a key developer role to a given account.
Correctness of  contract type should be checked by the Governance before calling this function._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract to assign developer for. |
| _keyDeveloper | address | An address of key developer to assign. address(0) is allowed to remove developer for contract type. |

### resetCooldown

```solidity
function resetCooldown(enum Types.VersionType _version, bytes32 _contractType, uint64 _major) external
```

Allows the Governance to reset cooldown for publishing new version.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | enum Types.VersionType | A type of version to reset cooldown for: major, minor or patch. |
| _contractType | bytes32 | A type of contract for which to reset cooldown. |
| _major | uint64 | An optional parameter required for restoring determine for which major version to reset the minor. Thus, only used with Minor version. |

### transferContractTypeOwnership

```solidity
function transferContractTypeOwnership(bytes32 _contractType, address _newKeyDeveloper) external
```

Transfers ownership over contract type to a new key developer.

_Key developer can use this functions to transfer developer rights over contract type to another key developer.
New key developer must already have a KEY_DEVELOPER_ROLE._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract to assign developer for. |
| _newKeyDeveloper | address | An address of key developer to assign. |

### releaseBytecode

```solidity
function releaseBytecode(struct Types.BytecodeInput _bytecodeInput) external
```

Releases an initial version of the contract type.

_Contract type can only be released once.
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

_Can only be called of initial bytecode was released for contract type.
Increments a previously stored major version.
Updates the latest version of the contract type. For example, if previous latest version was "1.0.3", the new latest version will be set to "2.0.0"._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeInput | struct Types.BytecodeInput | A struct of params necessary to upload the bytecode. |

### releaseMinorVersion

```solidity
function releaseMinorVersion(struct Types.BytecodeInput _bytecodeInput, uint64 _major) external
```

Released a new minor version of the contract type for specified major version.

_Can only be called of initial bytecode was released for contract type.
Specified major version must exist.
Increments a previously stored minor version of specified major version.
Updates the latest version of the contract type if specified major version is latest. For example, if latest version is "4.2.1" and passed major
version is 4, the new latest version will be set to "4.3.0"._

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
Increments a previously stored patch version for specified major and minor versions.
Updates the latest version of the contract type if specified major and minor versions are latest. For example, if latest version is "4.3.2", passed major
version is 4 and minor is 3, the new latest version will be set to "4.3.3"._

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
| _version | struct Types.VersionWithAlternative | A struct of params containing version for which to release alternative version and an alternative version to release. |

### verifyBytecode

```solidity
function verifyBytecode(struct Types.BytecodeVersion _bytecodeVersion, string _auditReport, bytes _signature) external
```

Uploads an audit report for specified bytecode.

_Can only be called by the auditors.
Uploaded audit report must be unique for specified bytecode version.
Auditor should provide a signature following the https://eips.ethereum.org/EIPS/eip-712.
Caller must be the developer of contract type._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeVersion | struct Types.BytecodeVersion | A version of bytecode to verify. |
| _auditReport | string | a URL to the audit report. |
| _signature | bytes | a signature signed by auditor verifying that the auditor intents to approve the bytecode. |

### addSubDeveloper

```solidity
function addSubDeveloper(address _subDeveloper) external
```

Adds a sub developer for a key developer.

_Can only be called by key developer.
Key developer can add up to `SUB_DEVELOPERS_LIMIT` developers.
New sub developer should not already have a SUB_DEVELOPER_ROLE._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _subDeveloper | address | Address of sub developer to add. |

### removeSubDeveloper

```solidity
function removeSubDeveloper(address _subDeveloper) external
```

Removes a sub developer for a key developer.

_Can only be called by key developer.
Sub developer must be in msg.sender's sub developers set added via `addSubDeveloper()` function._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _subDeveloper | address | Address of sub developer to remove. |

### computeBytecodeHash

```solidity
function computeBytecodeHash(bytes32 _contractType, struct Types.VersionWithAlternative _version) public pure returns (bytes32)
```

Computes a bytecode hash for specified contract type and its version.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract for which to compute hash. |
| _version | struct Types.VersionWithAlternative | A version of specified contract type for which to compute hash. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | Hash of specified bytecode. |

### computeAuditReportHash

```solidity
function computeAuditReportHash(bytes32 _bytecodeVersionHash, bytes32 _bytecodeHash, string _auditReport) public pure returns (bytes32)
```

Computes an audit report hash.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeVersionHash | bytes32 | A hash of bytecode version for which the audit report hash is computed. |
| _bytecodeHash | bytes32 | A hash of bytecode. |
| _auditReport | string | a URL of the audit report. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32 | Hash of specified audit report. |

### isDeveloper

```solidity
function isDeveloper(address _account) public view returns (bool)
```

Validates if given account is developer.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Address to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | true if account is developer, false otherwise. |

### getKeyDeveloper

```solidity
function getKeyDeveloper(address _account) public view returns (address)
```

Returns the key developer for given account.

_Returns given account address if it has a key developer role.
Returns a key developer of a given account if the given account is sub developer.
Returns zero address if given account is not a developer._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _account | address | Address for which to return a key developer. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Address of key developer. |

### getSubDevsForKeyDeveloper

```solidity
function getSubDevsForKeyDeveloper(address _keyDeveloper) public view returns (address[])
```

Returns a list of sub developers for given key developer.

_Returns empty array if given account is not a key developer._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _keyDeveloper | address | Address of key developer. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | Array containing the list of sub developers for given key developer. |

### isBytecodeVerified

```solidity
function isBytecodeVerified(struct Types.BytecodeVersion _version) public view returns (bool)
```

Validates if given bytecode version is verified by at least one auditor.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | Version of bytecode to validate. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | A boolean flag indicating if bytecode is verified. True if verified, false otherwise. |

### getLatestVersion

```solidity
function getLatestVersion(bytes32 _contractType) external view returns (string)
```

Returns the latest version for given bytecode in human-readable format.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _contractType | bytes32 | A type of contract for which to return latest version. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | Latest version for given contract type. E.g. "2.3.0". |

### getAuditorsForBytecodeVersion

```solidity
function getAuditorsForBytecodeVersion(struct Types.BytecodeVersion _version) external view returns (address[])
```

Returns a list of auditors who have approved the specified bytecode.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | Bytecode version for which to return a lits of auditors. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | Array containing all the auditors of specified bytecode. Empty if none of the auditors have approved the bytecode yet. |

### getAuditReport

```solidity
function getAuditReport(struct Types.BytecodeVersion _version, address _auditor) external view returns (string)
```

Returns the audit report for a certain bytecode version and auditor.

_Can also be used to check if a certain auditor verified the bytecode version._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | Struct containing contract type and version for which to get audit report. |
| _auditor | address | Address of auditor whose audit report to get. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | Audit report of specified auditor for specified contract type and version. |

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

Validates if a specified bytecode version exists based on bytecode hash.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeHash | bytes32 | A bytecode hash to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | A boolean flag indicating if the version exists. True if exists, false otherwise. |

### getVerifiedBytecode

```solidity
function getVerifiedBytecode(struct Types.BytecodeVersion _version) external view returns (bytes)
```

Returns a verified bytecode of a specified contract type and version.

_Throws and error if bytecode is not verified by at least one auditor._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | A bytecode version for which to return bytecode. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes | A bytecode of specified contract type and version. |

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

### getRegisteredContractTypes

```solidity
function getRegisteredContractTypes() external view returns (bytes32[])
```

Returns all registered contract types.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes32[] | Bytes32 array containing all contract types. |

### _uploadBytecode

```solidity
function _uploadBytecode(struct Types.BytecodeInput _bytecodeInput, address _keyDeveloper, struct Types.VersionWithAlternative _version) internal
```

Stores the bytecode of given contract type and version.

_Validates if bytecode is not already uploaded for given contract type and version._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeInput | struct Types.BytecodeInput | A struct of params containing info about bytecode. |
| _keyDeveloper | address | Address of key developer for given contract type at the time of uploading the bytecode. |
| _version | struct Types.VersionWithAlternative | A new version of bytecode for which it is uploaded. |

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

### grantRole

```solidity
function grantRole(bytes32 role, address account) public
```

### _revokeRole

```solidity
function _revokeRole(bytes32 role, address account) internal returns (bool)
```

_Overload {AccessControl-_revokeRole} to track enumerable memberships_

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

