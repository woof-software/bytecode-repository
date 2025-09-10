# Solidity API

## IVersionController

### PrimaryAuditorSet

```solidity
event PrimaryAuditorSet(address _primaryAuditor)
```

### KeyDeveloperAssigned

```solidity
event KeyDeveloperAssigned(bytes32 _contractType, address _keyDeveloper)
```

### BytecodeUploaded

```solidity
event BytecodeUploaded(bytes32 _contractType, struct Types.Version _version)
```

### AuditReportSubmitted

```solidity
event AuditReportSubmitted(address _author, string _auditReport, bytes32 _bytecodeHash, bytes _signature)
```

### CooldownReset

```solidity
event CooldownReset(bytes32 _contractType, enum Types.VersionType _version, uint64 _major)
```

### NotAuthorizedForContractType

```solidity
error NotAuthorizedForContractType(bytes32 _contractType, address _caller)
```

### SameKeyDeveloper

```solidity
error SameKeyDeveloper(address _keyDeveloper)
```

### TooManySubDevelopers

```solidity
error TooManySubDevelopers(address _keyDeveloper)
```

### AlreadySubDeveloper

```solidity
error AlreadySubDeveloper(address _subDeveloper)
```

### NotSubDeveloper

```solidity
error NotSubDeveloper(address _subDeveloper)
```

### SubDeveloperNotInSet

```solidity
error SubDeveloperNotInSet(address _keyDeveloper, address _subDeveloper)
```

### SubDeveloperAlreadyInSet

```solidity
error SubDeveloperAlreadyInSet(address _keyDeveloper, address _subDeveloper)
```

### WrongDeveloper

```solidity
error WrongDeveloper(bytes32 _contractType, address _developer)
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

### AuditReportAlreadySubmitted

```solidity
error AuditReportAlreadySubmitted(address _auditor, string _auditReport)
```

### InvalidAuditor

```solidity
error InvalidAuditor(address _author)
```

### BytecodeNotVerified

```solidity
error BytecodeNotVerified(struct Types.BytecodeVersion _version)
```

### NotDeveloper

```solidity
error NotDeveloper(address _account)
```

### WrongKeyDeveloper

```solidity
error WrongKeyDeveloper(address account, address _subDeveloper)
```

### VersionAlreadyExists

```solidity
error VersionAlreadyExists(bytes32 _contractType, struct Types.VersionWithAlternative _version)
```

### NonExistingVersion

```solidity
error NonExistingVersion(bytes32 _contractType, struct Types.VersionWithAlternative _version)
```

### BytecodeAlreadyUploaded

```solidity
error BytecodeAlreadyUploaded(bytes32 _bytecodeHash)
```

### AuditReportEmpty

```solidity
error AuditReportEmpty()
```

### CantReleaseYet

```solidity
error CantReleaseYet()
```

### assignDeveloperForContractType

```solidity
function assignDeveloperForContractType(bytes32 _contractType, address _keyDeveloper) external
```

### releaseBytecode

```solidity
function releaseBytecode(struct Types.BytecodeInput _bytecodeInput) external
```

### releaseMajorVersion

```solidity
function releaseMajorVersion(struct Types.BytecodeInput _bytecodeInput) external
```

### releaseMinorVersion

```solidity
function releaseMinorVersion(struct Types.BytecodeInput _bytecodeInput, uint64 _major) external
```

### releasePatchVersion

```solidity
function releasePatchVersion(struct Types.BytecodeInput _bytecodeInput, uint64 _major, uint64 _minor) external
```

### releaseAlternativeVersion

```solidity
function releaseAlternativeVersion(struct Types.BytecodeInput _bytecodeInput, struct Types.VersionWithAlternative _version) external
```

### verifyBytecode

```solidity
function verifyBytecode(struct Types.BytecodeVersion _bytecodeVersion, string _auditReport, bytes _signature) external
```

### addSubDeveloper

```solidity
function addSubDeveloper(address _subDeveloper) external
```

### removeSubDeveloper

```solidity
function removeSubDeveloper(address _subDeveloper) external
```

### computeBytecodeHash

```solidity
function computeBytecodeHash(bytes32 _contractType, struct Types.VersionWithAlternative _version) external pure returns (bytes32)
```

### computeAuditReportHash

```solidity
function computeAuditReportHash(bytes32 _bytecodeVersionHash, bytes32 _bytecodeHash, string _auditReport) external pure returns (bytes32)
```

### getKeyDeveloper

```solidity
function getKeyDeveloper(address _account) external view returns (address)
```

### getSubDevsForKeyDeveloper

```solidity
function getSubDevsForKeyDeveloper(address _keyDeveloper) external view returns (address[])
```

### isBytecodeVerified

```solidity
function isBytecodeVerified(struct Types.BytecodeVersion _version) external view returns (bool)
```

### getLatestVersion

```solidity
function getLatestVersion(bytes32 _contractType) external view returns (string)
```

### getAuditorsForBytecodeVersion

```solidity
function getAuditorsForBytecodeVersion(struct Types.BytecodeVersion _version) external view returns (address[])
```

### getAuditReport

```solidity
function getAuditReport(struct Types.BytecodeVersion _version, address _auditor) external view returns (string)
```

### versionExists

```solidity
function versionExists(bytes32 _bytecodeHash) external view returns (bool)
```

### getAllAlternativeVersions

```solidity
function getAllAlternativeVersions(bytes32 _contractType) external view returns (struct Types.VersionWithAlternative[])
```

