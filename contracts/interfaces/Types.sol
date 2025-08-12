pragma solidity 0.8.30;

interface Types {
    /**
     * @notice Represents a version.
     * @dev Fields:
     * - `major`: major version
     * - `minor`: minor version
     * - `patch`: patch version
     */
    struct Version {
        uint64 major;
        uint64 minor;
        uint64 patch;
    }

    /**
     * @notice Represents a version with alternative.
     * @dev Fields:
     * - `version`: core version
     * - `alternative`: alternative version
     */
    struct VersionWithAlternative {
        Version version;
        string alternative;
    }

    /**
     * @notice Represents params necessary for releasing bytecode.
     * @dev Fields:
     * - `contractType`: a type of contract to release
     * - `initCode`: bytecode to upload
     * - `sourceURL`: link to repository containing the source code of bytecode
     */
    struct BytecodeInput {
        bytes32 contractType;
        bytes initCode;
        string sourceURL;
    }

    /**
     * @notice Represents information about audit status of bytecode.
     * @dev Fields:
     * - `auditors`: array of auditors who have approved the bytecode
     * - `verified`: a boolean flag indicating if the bytecode has been approved by at least a single auditor
     * - `auditReports`: a mapping containing audit report URL of a given auditor
     */
    struct AuditStatus {
        address[] auditors;
        bool verified;
        mapping(address => string) auditReports;
    }

    /**
     * @notice Represents information about stored bytecode.
     * @dev Fields:
     * - `contractType`: a type of contract of given bytecode
     * - `initCodePtrs`: address pointers at which parts of bytecode are stored
     * - `sourceURL`: link to repository where source code of bytecode is stored
     * - `author`: address of the author of bytecode
     */
    struct Bytecode {
        bytes32 contractType;
        address[] initCodePtrs;
        string sourceURL;
        address author;
    }

    /**
     * @notice Represents a contract type with its version
     * @dev Fields:
     * - `contractType`: a type of contract
     * - `version`: version with alternative for given contract type
     */
    struct BytecodeVersion {
        bytes32 contractType;
        VersionWithAlternative version;
    }
}
