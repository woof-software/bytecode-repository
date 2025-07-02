pragma solidity 0.8.30;

interface IVersionController {
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
    error InitCodeIsEmpty();
    error BytecodeNotReleased(bytes32 _contractType);
    error NonExistingMajorVersion(bytes32 _contractType, uint64 _major);
    error NonExistingMinorVersion(bytes32 _contractType, uint64 _major, uint64 _minor);
    error AuditReportAlreadySubmitted(address _auditor, string _auditReport);
    error InvalidAuditor(address _author);
    error BytecodeNotVerified(BytecodeVersion _version);
    error NotDeveloper(address _account);
    error NonExistingPatch(bytes32 _contractType, Version _version);

    struct Version {
        uint64 major;
        uint64 minor;
        uint64 patch;
    }

    struct VersionWithAlternative {
        Version version;
        string alternative;
    }

    struct BytecodeInput {
        bytes32 contractType;
        bytes initCode;
        string sourceURL;
    }

    struct AuditStatus {
        address[] auditors;
        bool verified;
        mapping(address => string) auditReports;
    }

    struct Bytecode {
        bytes32 contractType;
        address[] initCodePtrs;
        string sourceURL;
        address author;
    }

    struct BytecodeVersion {
        bytes32 contractType;
        VersionWithAlternative version;
    }
}
