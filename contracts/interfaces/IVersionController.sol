pragma solidity 0.8.30;

interface IVersionController {
    event PrimaryAuditorSet(address _primaryAuditor);
    event KeyDeveloperAssigned(bytes32 _contractType, address _keyDeveloper);

    error NotAuthorized(address _caller);
    error SameKeyDeveloper(address _keyDeveloper);
    error TooManySubDevelopers(address _keyDeveloper);
    error AlreadySubDeveloper(address _subDeveloper);
    error NotSubDeveloper(address _subDeveloper);
    error SubDeveloperNotInSet(address _keyDeveloper, address _subDeveloper);
    error SubDeveloperAlreadyInSet(address _keyDeveloper, address _subDeveloper);

    struct Version {
        uint64 major;
        uint64 minor;
        uint64 patch;
    }

    struct BytecodeInput {
        bytes32 contractType;
        bytes initCode;
        string sourceURL;
    }

    struct Bytecode {
        bytes32 contractType;
        address initCodePtr;
        string sourceURL;
        address author;
    }

    struct Audit {
        string reportURL;
        bytes signature;
    }
}
