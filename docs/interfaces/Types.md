# Solidity API

## Types

### Version

Represents a version.

_Fields:
- `major`: major version
- `minor`: minor version
- `patch`: patch version_

```solidity
struct Version {
  uint64 major;
  uint64 minor;
  uint64 patch;
}
```

### VersionWithAlternative

Represents a version with alternative.

_Fields:
- `version`: core version
- `alternative`: alternative version_

```solidity
struct VersionWithAlternative {
  struct Types.Version version;
  string alternative;
}
```

### BytecodeInput

Represents params necessary for releasing bytecode.

_Fields:
- `contractType`: a type of contract to release
- `initCode`: bytecode to upload
- `sourceURL`: link to repository containing the source code of bytecode_

```solidity
struct BytecodeInput {
  bytes32 contractType;
  bytes initCode;
  string sourceURL;
}
```

### AuditStatus

Represents information about audit status of bytecode.

_Fields:
- `auditors`: array of auditors who have approved the bytecode
- `verified`: a boolean flag indicating if the bytecode has been approved by at least a single auditor
- `auditReports`: a mapping containing audit report URL of a given auditor_

```solidity
struct AuditStatus {
  address[] auditors;
  bool verified;
  mapping(address => string) auditReports;
}
```

### Bytecode

Represents information about stored bytecode.

_Fields:
- `contractType`: a type of contract of given bytecode
- `initCodePtrs`: address pointers at which parts of bytecode are stored
- `sourceURL`: link to repository where source code of bytecode is stored
- `author`: address of the author of bytecode_

```solidity
struct Bytecode {
  bytes32 contractType;
  address[] initCodePtrs;
  string sourceURL;
  address author;
}
```

### BytecodeVersion

Represents a contract type with its version

_Fields:
- `contractType`: a type of contract
- `version`: version with alternative for given contract type_

```solidity
struct BytecodeVersion {
  bytes32 contractType;
  struct Types.VersionWithAlternative version;
}
```

