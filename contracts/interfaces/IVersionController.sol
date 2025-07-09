pragma solidity 0.8.30;

import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";

interface IVersionController is IAccessControl {
    event PrimaryAuditorSet(address _primaryAuditor);
    event KeyDeveloperAssigned(bytes32 _contractType, address _keyDeveloper);
    event BytecodeUploaded(bytes32 _contractType, Version _version);
    event AuditReportSubmitted(address _author, string _auditReport, bytes32 _bytecodeHash, bytes _signature);

    error NotAuthorizedForContractType(bytes32 _contractType, address _caller);
    error SameKeyDeveloper(address _keyDeveloper);
    error TooManySubDevelopers(address _keyDeveloper);
    error AlreadySubDeveloper(address _subDeveloper);
    error NotSubDeveloper(address _subDeveloper);
    error SubDeveloperNotInSet(address _keyDeveloper, address _subDeveloper);
    error SubDeveloperAlreadyInSet(address _keyDeveloper, address _subDeveloper);
    error WrongDeveloper(bytes32 _contractType, address _developer);
    error BytecodeAlreadyReleased(bytes32 _contractType);
    error BytecodeNotReleased(bytes32 _contractType);
    error NonExistingMajorVersion(bytes32 _contractType, uint64 _major);
    error NonExistingMinorVersion(bytes32 _contractType, uint64 _major, uint64 _minor);
    error AuditReportAlreadySubmitted(address _auditor, string _auditReport);
    error InvalidAuditor(address _author);
    error BytecodeNotVerified(BytecodeVersion _version);
    error NotDeveloper(address _account);
    error WrongKeyDeveloper(address account, address _subDeveloper);
    error VersionAlreadyExists(bytes32 _contractType, VersionWithAlternative _version);
    error NonExistingVersion(bytes32 _contractType, VersionWithAlternative _version);

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

    // Governor
    function assignDeveloperForContractType(bytes32 _contractType, address _keyDeveloper) external;

    // Bytecode Upload
    function releaseBytecode(BytecodeInput calldata _bytecodeInput) external;

    function releaseMajorVersion(BytecodeInput calldata _bytecodeInput) external;

    function releaseMinorVersion(BytecodeInput calldata _bytecodeInput, uint64 _major) external;

    function releasePatchVersion(BytecodeInput calldata _bytecodeInput, uint64 _major, uint64 _minor) external;

    function releaseAlternativeVersion(
        BytecodeInput calldata _bytecodeInput,
        VersionWithAlternative calldata _version
    ) external;

    // Auditor
    function verifyBytecode(
        BytecodeVersion calldata _bytecodeVersion,
        string calldata _auditReport,
        bytes calldata _signature
    ) external;

    // Key Developer
    function addSubDeveloper(address _subDeveloper) external;

    function removeSubDeveloper(address _subDeveloper) external;

    // View
    function computeBytecodeHash(
        bytes32 _contractType,
        VersionWithAlternative memory _version
    ) external pure returns (bytes32);

    function computeAuditReportHash(
        bytes32 _bytecodeHash,
        string calldata _auditReport
    ) external pure returns (bytes32);

    function getKeyDeveloper(address _account) external view returns (address);

    function getSubDevsForKeyDeveloper(address _keyDeveloper) external view returns (address[] memory);

    function isBytecodeVerified(BytecodeVersion calldata _version) external view returns (bool);

    function getLatestVersion(bytes32 _contractType) external view returns (string memory);

    function getAuditorsForBytecodeVersion(BytecodeVersion calldata _version) external view returns (address[] memory);

    function getAuditReport(BytecodeVersion calldata _version, address _auditor) external view returns (string memory);

    function versionExists(BytecodeVersion calldata _version) external view returns (bool);

    function versionExists(bytes32 _bytecodeHash) external view returns (bool);

    function getVerifiedBytecode(BytecodeVersion calldata _version) external view returns (bytes memory);

    function getAllAlternativeVersions(bytes32 _contractType) external view returns (VersionWithAlternative[] memory);
}
