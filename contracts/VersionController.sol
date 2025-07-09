pragma solidity 0.8.30;

import {
    AccessControlEnumerableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { BytecodeStore } from "./libraries/BytecodeStore.sol";
import { IVersionController } from "./interfaces/IVersionController.sol";

contract VersionController is
    AccessControlEnumerableUpgradeable,
    UUPSUpgradeable,
    IVersionController,
    EIP712Upgradeable
{
    using EnumerableSet for EnumerableSet.AddressSet;
    using Strings for uint256;

    /// @notice Bytecode version typehash.
    bytes32 public constant BYTECODE_VERSION_TYPEHASH =
        keccak256("BytecodeVersion(bytes32 contractType,uint64 major,uint64 minor,uint64 patch,string alternative)");
    /// @notice Audit report typehash.
    bytes32 public constant AUDIT_REPORT_TYPEHASH = keccak256("AuditReport(bytes32 bytecodeHash,string auditReport)");
    /// @notice Key Developer role for AccessControl.
    bytes32 public constant KEY_DEVELOPER_ROLE = keccak256("KEY_DEVELOPER_ROLE");
    /// @notice Sub Developer role for AccessControl.
    bytes32 public constant SUB_DEVELOPER_ROLE = keccak256("SUB_DEVELOPER_ROLE");
    /// @notice Auditor role for AccessControl.
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    /// @notice A limit of sub developers per key developer.
    uint256 public constant SUB_DEVELOPERS_LIMIT = 3;
    /// @notice Stores current key developer for given contract type.
    mapping(bytes32 => address) public contractTypeKeyDeveloper;
    /// @notice Stores a list of sub developers for given key developer.
    mapping(address => EnumerableSet.AddressSet) private subDevelopers;
    /// @notice Stores a key developer for given sub developer.
    mapping(address => address) public subToKeyDeveloper;
    /// @notice Stores the latest available version for given contract type.
    mapping(bytes32 => Version) public latestVersions;
    /// @notice Stores the latest available minor version for given contract type and major version.
    mapping(bytes32 => mapping(uint64 => uint64)) public latestMinor;
    /// @notice Stores the latest available patch version for given contract type, major and minor versions.
    mapping(bytes32 => mapping(uint64 => mapping(uint64 => uint64))) public latestPatch;
    /// @notice Stores the list of alternative versions for given contract type.
    mapping(bytes32 => VersionWithAlternative[]) private alternativeVersions;
    /// @notice Stores the bytecode information for given bytecode hash.
    mapping(bytes32 => Bytecode) public bytecodes;
    /// @notice Stores the audits information for given bytecode hash.
    mapping(bytes32 => AuditStatus) private bytecodeAuditStatus;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _governor) external initializer {
        __AccessControlEnumerable_init();
        __UUPSUpgradeable_init();
        __EIP712_init("VersionController", "1");
        _grantRole(DEFAULT_ADMIN_ROLE, _governor);
    }

    /// @notice Validates if the function is called by key developer of corresponding sub developer.
    /// @dev Additionally checks if developer has an appropriate role.
    /// @param _contractType A type of contract for which to validate developer.
    /// @param _developer An address of developer to validate.
    modifier checkDeveloper(bytes32 _contractType, address _developer) {
        address contractTypeKeyDev = contractTypeKeyDeveloper[_contractType];
        if (!hasRole(KEY_DEVELOPER_ROLE, _developer) && !hasRole(SUB_DEVELOPER_ROLE, _developer))
            revert NotDeveloper(_developer);
        if (contractTypeKeyDev != _developer && subToKeyDeveloper[_developer] != contractTypeKeyDev)
            revert WrongDeveloper(_contractType, _developer);
        _;
    }

    /// @notice Validates if initial bytecode for specified contract type is already released.
    /// @param _contractType A type of contract for which to validate if bytecode is released.
    modifier bytecodeReleased(bytes32 _contractType) {
        if (latestVersions[_contractType].major == 0) revert BytecodeNotReleased(_contractType);
        _;
    }

    /* Governor functions */

    /// @notice Assigns a new key developer for a certain contract type.
    /// @dev Governor can use this function to initializes contract type and forcibly assign new key developer.
    /// @dev Key developer can use this functions to transfer developer rights over contract type to another key developer.
    /// @dev Key developer must already have a KEY_DEVELOPER_ROLE.
    /// @param _contractType A type of contract to assign developer for.
    /// @param _keyDeveloper An address of key developer to assign.
    function assignDeveloperForContractType(bytes32 _contractType, address _keyDeveloper) external {
        if (
            !hasRole(DEFAULT_ADMIN_ROLE, msg.sender) &&
            (!hasRole(KEY_DEVELOPER_ROLE, msg.sender) || contractTypeKeyDeveloper[_contractType] != msg.sender)
        ) revert NotAuthorizedForContractType(_contractType, msg.sender);
        _checkRole(KEY_DEVELOPER_ROLE, _keyDeveloper);
        if (contractTypeKeyDeveloper[_contractType] == _keyDeveloper) revert SameKeyDeveloper(_keyDeveloper);
        contractTypeKeyDeveloper[_contractType] = _keyDeveloper;

        emit KeyDeveloperAssigned(_contractType, _keyDeveloper);
    }

    /* Upload bytecode functions */

    /// @notice Releases an initial version of the contract type.
    /// @dev Contract type can only be released once.
    /// @dev Sets the initial version to "1.0.0".
    /// @param _bytecodeInput A struct of params necessary to upload the bytecode.
    function releaseBytecode(
        BytecodeInput calldata _bytecodeInput
    ) external checkDeveloper(_bytecodeInput.contractType, msg.sender) {
        if (latestVersions[_bytecodeInput.contractType].major != 0)
            revert BytecodeAlreadyReleased(_bytecodeInput.contractType);
        VersionWithAlternative memory version = VersionWithAlternative(Version(1, 0, 0), "");
        address keyDeveloper = getKeyDeveloper(msg.sender);
        _uploadBytecode(_bytecodeInput, keyDeveloper, version);

        latestVersions[_bytecodeInput.contractType] = version.version;
    }

    /// @notice Releases a new major version of the contract type.
    /// @dev Can only be called of initial bytecode was released for contract type.
    /// @dev Increments a previously stored major version.
    /// @dev Updates the latest version of the contract type. For example, if previous latest version was "1.0.3", the new latest version will be set to "2.0.0".
    /// @param _bytecodeInput A struct of params necessary to upload the bytecode.
    function releaseMajorVersion(
        BytecodeInput calldata _bytecodeInput
    ) external bytecodeReleased(_bytecodeInput.contractType) checkDeveloper(_bytecodeInput.contractType, msg.sender) {
        VersionWithAlternative memory version = VersionWithAlternative(
            Version(latestVersions[_bytecodeInput.contractType].major + 1, 0, 0),
            ""
        );
        address keyDeveloper = getKeyDeveloper(msg.sender);
        _uploadBytecode(_bytecodeInput, keyDeveloper, version);

        latestVersions[_bytecodeInput.contractType] = version.version;
    }

    /// @notice Released a new minor version of the contract type for specified major version.
    /// @dev Can only be called of initial bytecode was released for contract type.
    /// @dev Specified major version must exist.
    /// @dev Increments a previously stored minor version of specified major version.
    /// @dev Updates the latest version of the contract type if specified major version is latest. For example, if latest version is "4.2.1" and passed major
    /// version is 4, the new latest version will be set to "4.3.0".
    /// @param _bytecodeInput A struct of params necessary to upload the bytecode.
    /// @param _major A major version for which to release new minor version.
    function releaseMinorVersion(
        BytecodeInput calldata _bytecodeInput,
        uint64 _major
    ) external bytecodeReleased(_bytecodeInput.contractType) checkDeveloper(_bytecodeInput.contractType, msg.sender) {
        Version storage latestVersion = latestVersions[_bytecodeInput.contractType];
        if (_major > latestVersion.major) revert NonExistingMajorVersion(_bytecodeInput.contractType, _major);
        VersionWithAlternative memory version = VersionWithAlternative(
            Version(_major, ++latestMinor[_bytecodeInput.contractType][_major], 0),
            ""
        );
        address keyDeveloper = getKeyDeveloper(msg.sender);
        _uploadBytecode(_bytecodeInput, keyDeveloper, version);

        if (_major == latestVersion.major) {
            latestVersion.minor = version.version.minor;
            latestVersion.patch = 0;
        }
    }

    /// @notice Releases a new patch version of the contract type for specified major and minor versions.
    /// @dev Specified major and minor versions must exist.
    /// @dev Increments a previously stored patch version for specified major and minor versions.
    /// @dev Updates the latest version of the contract type if specified major and minor versions are latest. For example, if latest version is "4.3.2", passed major
    /// version is 4 and minor is 3, the new latest version will be set to "4.3.3".
    /// @param _bytecodeInput A struct of params necessary to upload the bytecode.
    /// @param _major A major version for which to release new patch version.
    /// @param _minor A minor version for which to release new patch version.
    function releasePatchVersion(
        BytecodeInput calldata _bytecodeInput,
        uint64 _major,
        uint64 _minor
    ) external checkDeveloper(_bytecodeInput.contractType, msg.sender) {
        Version storage latestVersion = latestVersions[_bytecodeInput.contractType];
        if (_major > latestVersion.major) revert NonExistingMajorVersion(_bytecodeInput.contractType, _major);
        uint64 latestMinorVersion = latestMinor[_bytecodeInput.contractType][_major];
        if (_minor > latestMinorVersion) revert NonExistingMinorVersion(_bytecodeInput.contractType, _major, _minor);

        VersionWithAlternative memory version = VersionWithAlternative(
            Version(_major, _minor, ++latestPatch[_bytecodeInput.contractType][_major][_minor]),
            ""
        );
        address keyDeveloper = getKeyDeveloper(msg.sender);
        _uploadBytecode(_bytecodeInput, keyDeveloper, version);

        if (_major == latestVersion.major && _minor == latestVersion.minor) latestVersion.patch = version.version.patch;
    }

    /// @notice Releases an alternative version for specified contract type and version.
    /// @dev Specified version, for which alternative is released, must exist.
    /// @param _bytecodeInput A struct of params necessary to upload the bytecode.
    /// @param _version A struct of params containing version for which to release alternative version and an alternative version to release.
    function releaseAlternativeVersion(
        BytecodeInput calldata _bytecodeInput,
        VersionWithAlternative calldata _version
    ) external checkDeveloper(_bytecodeInput.contractType, msg.sender) {
        VersionWithAlternative memory coreVersion = VersionWithAlternative(_version.version, "");
        if (!versionExists(computeBytecodeHash(_bytecodeInput.contractType, coreVersion)))
            revert NonExistingVersion(_bytecodeInput.contractType, coreVersion);
        address keyDeveloper = getKeyDeveloper(msg.sender);
        _uploadBytecode(_bytecodeInput, keyDeveloper, _version);

        alternativeVersions[_bytecodeInput.contractType].push(_version);
    }

    /* Auditor functions */

    /// @notice Uploads an audit report for specified bytecode.
    /// @dev Can only be called by the auditors.
    /// @dev Uploaded audit report must be unique for specified bytecode version.
    /// @dev Auditor should provide a signature following the https://eips.ethereum.org/EIPS/eip-712.
    /// @dev Caller must be the author of the signature.
    /// @param _bytecodeVersion A version of bytecode to verify.
    /// @param _auditReport a URL to the audit report.
    /// @param _signature a signature signed by auditor verifying that the auditor intents to approve the bytecode.
    function verifyBytecode(
        BytecodeVersion calldata _bytecodeVersion,
        string calldata _auditReport,
        bytes calldata _signature
    ) external onlyRole(AUDITOR_ROLE) bytecodeReleased(_bytecodeVersion.contractType) {
        bytes32 bytecodeHash = computeBytecodeHash(_bytecodeVersion.contractType, _bytecodeVersion.version);
        AuditStatus storage auditStatus = bytecodeAuditStatus[bytecodeHash];
        if (bytes(auditStatus.auditReports[msg.sender]).length > 0)
            revert AuditReportAlreadySubmitted(msg.sender, _auditReport);
        bytes32 reportHash = computeAuditReportHash(bytecodeHash, _auditReport);
        address author = ECDSA.recover(_hashTypedDataV4(reportHash), _signature);
        if (author != msg.sender) revert InvalidAuditor(author);
        // Store report
        auditStatus.auditors.push(author);
        auditStatus.auditReports[author] = _auditReport;
        if (!auditStatus.verified) auditStatus.verified = true;

        emit AuditReportSubmitted(author, _auditReport, bytecodeHash, _signature);
    }

    /* Key Developer functions */

    /// @notice Adds a sub developer for a key developer.
    /// @dev Can only be called by key developer.
    /// @dev Key developer can add up to `SUB_DEVELOPERS_LIMIT` developers.
    /// @dev New sub developer should not already have a SUB_DEVELOPER_ROLE.
    /// @param _subDeveloper Address of sub developer to add.
    function addSubDeveloper(address _subDeveloper) external {
        bool result = _grantRole(SUB_DEVELOPER_ROLE, _subDeveloper);
        // _grantRole() returns false if account already has a specified role
        if (!result) revert AlreadySubDeveloper(_subDeveloper);
    }

    /// @notice Removes a sub developer for a key developer.
    /// @dev Can only be called by key developer.
    /// @dev Sub developer must be in msg.sender's sub developers set added via `addSubDeveloper()` function.
    /// @param _subDeveloper Address of sub developer to remove.
    function removeSubDeveloper(address _subDeveloper) external onlyRole(KEY_DEVELOPER_ROLE) {
        if (subToKeyDeveloper[_subDeveloper] != msg.sender) revert WrongKeyDeveloper(msg.sender, _subDeveloper);
        bool result = _revokeRole(SUB_DEVELOPER_ROLE, _subDeveloper);
        // _revokeRole() returns false if account already doesn't have a specified role
        if (!result) revert NotSubDeveloper(_subDeveloper);
    }

    /* View functions */

    /// @notice Computes a bytecode hash for specified contract type and its version.
    /// @param _contractType A type of contract for which to compute hash.
    /// @param _version A version of specified contract type for which to compute hash.
    /// @return Hash of specified bytecode.
    function computeBytecodeHash(
        bytes32 _contractType,
        VersionWithAlternative memory _version
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BYTECODE_VERSION_TYPEHASH,
                    _contractType,
                    _version.version.major,
                    _version.version.minor,
                    _version.version.patch,
                    _version.alternative
                )
            );
    }

    /// @notice Computes an audit report hash.
    /// @param _bytecodeHash A hash of bytecode version for which the audit report hash is computed.
    /// @param _auditReport a URL of the audit report.
    /// @return Hash of specified audit report.
    function computeAuditReportHash(bytes32 _bytecodeHash, string calldata _auditReport) public pure returns (bytes32) {
        return keccak256(abi.encode(AUDIT_REPORT_TYPEHASH, _bytecodeHash, keccak256(bytes(_auditReport))));
    }

    /// @notice Returns the key developer for given account.
    /// @dev Returns given account address if it has a key developer role.
    /// @dev Returns a key developer of a given account if the given account is sub developer.
    /// @dev Returns zero address if given account is not a developer.
    /// @param _account Address for which to return a key developer.
    /// @return Address of key developer.
    function getKeyDeveloper(address _account) public view returns (address) {
        return hasRole(KEY_DEVELOPER_ROLE, _account) ? _account : subToKeyDeveloper[_account];
    }

    /// @notice Returns a list of sub developers for given key developer.
    /// @dev Returns empty array if given account is not a key developer.
    /// @param _keyDeveloper Address of key developer.
    /// @return Array containing the list of sub developers for given key developer.
    function getSubDevsForKeyDeveloper(address _keyDeveloper) public view returns (address[] memory) {
        return subDevelopers[_keyDeveloper].values();
    }

    /// @notice Validates if given bytecode version is verified by at least one auditor.
    /// @param _version Version of bytecode to validate.
    /// @return A boolean flag indicating if bytecode is verified. True if verified, false otherwise.
    function isBytecodeVerified(BytecodeVersion calldata _version) public view returns (bool) {
        return bytecodeAuditStatus[computeBytecodeHash(_version.contractType, _version.version)].verified;
    }

    /// @notice Returns the latest version for given bytecode in human-readable format.
    /// @param _contractType A type of contract for which to return latest version.
    /// @return Latest version for given contract type. E.g. "2.3.0".
    function getLatestVersion(bytes32 _contractType) external view returns (string memory) {
        return _versionToStr(VersionWithAlternative(latestVersions[_contractType], ""));
    }

    /// @notice Returns a list of auditors who have approved the specified bytecode.
    /// @param _version Bytecode version for which to return a lits of auditors.
    /// @return Array containing all the auditors of specified bytecode. Empty if none of the auditors have approved the bytecode yet.
    function getAuditorsForBytecodeVersion(BytecodeVersion calldata _version) external view returns (address[] memory) {
        return bytecodeAuditStatus[computeBytecodeHash(_version.contractType, _version.version)].auditors;
    }

    /// @notice Returns the audit report for a certain bytecode version and auditor.
    /// @dev Can also be used to check if a certain auditor verified the bytecode version.
    /// @param _version Struct containing contract type and version for which to get audit report.
    /// @param _auditor Address of auditor whose audit report to get.
    /// @return Audit report of specified auditor for specified contract type and version.
    function getAuditReport(BytecodeVersion calldata _version, address _auditor) external view returns (string memory) {
        return bytecodeAuditStatus[computeBytecodeHash(_version.contractType, _version.version)].auditReports[_auditor];
    }

    /// @notice Validates if a specified bytecode version exists based on struct with contract type and version.
    /// @param _version A bytecode version to check.
    /// @return A boolean flag indicating if the version exists. True if exists, false otherwise.
    function versionExists(BytecodeVersion calldata _version) external view returns (bool) {
        return versionExists(computeBytecodeHash(_version.contractType, _version.version));
    }

    /// @notice Validates if a specified bytecode version exists based on bytecode hash.
    /// @param _bytecodeHash A bytecode hash to check.
    /// @return A boolean flag indicating if the version exists. True if exists, false otherwise.
    function versionExists(bytes32 _bytecodeHash) public view returns (bool) {
        return bytecodes[_bytecodeHash].author != address(0);
    }

    /// @notice Returns a verified bytecode of a specified contract type and version.
    /// @dev Throws and error if bytecode is not verified by at least one auditor.
    /// @param _version A bytecode version for which to return bytecode.
    /// @return A bytecode of specified contract type and version.
    function getVerifiedBytecode(BytecodeVersion calldata _version) external view returns (bytes memory) {
        if (!isBytecodeVerified(_version)) revert BytecodeNotVerified(_version);
        return
            BytecodeStore._readInitCode(
                bytecodes[computeBytecodeHash(_version.contractType, _version.version)].initCodePtrs
            );
    }

    /// @notice Returns all alternative versions for given contract type.
    /// @param _contractType A type of contract for which to return alternative versions.
    /// @return Array containing all the alternative versions of given contract type.
    function getAllAlternativeVersions(bytes32 _contractType) external view returns (VersionWithAlternative[] memory) {
        return alternativeVersions[_contractType];
    }

    /* Internal helpers */

    /// @notice Stores the bytecode of given contract type and version.
    /// @dev Validates if bytecode is not already uploaded for given contract type and version.
    /// @param _bytecodeInput A struct of params containing info about bytecode.
    /// @param _keyDeveloper Address of key developer for given contract type at the time of uploading the bytecode.
    /// @param _version A new version of bytecode for which it is uploaded.
    function _uploadBytecode(
        BytecodeInput calldata _bytecodeInput,
        address _keyDeveloper,
        VersionWithAlternative memory _version
    ) internal {
        address[] memory initCodePointers = BytecodeStore._writeInitCode(_bytecodeInput.initCode);
        Bytecode memory bc = Bytecode({
            contractType: _bytecodeInput.contractType,
            initCodePtrs: initCodePointers,
            sourceURL: _bytecodeInput.sourceURL,
            author: _keyDeveloper
        });

        bytes32 hash = computeBytecodeHash(_bytecodeInput.contractType, _version);
        if (versionExists(hash)) revert VersionAlreadyExists(_bytecodeInput.contractType, _version);
        bytecodes[hash] = bc;

        emit BytecodeUploaded(_bytecodeInput.contractType, _version.version);
    }

    /// @notice Returns given version in human-readable format. E.g. "4.3.0".
    /// @param _version Version of the bytecode.
    /// @return A string containing the version.
    function _versionToStr(VersionWithAlternative memory _version) internal pure returns (string memory) {
        return
            string.concat(
                uint256(_version.version.major).toString(),
                ".",
                uint256(_version.version.minor).toString(),
                ".",
                uint256(_version.version.patch).toString(),
                _version.alternative
            );
    }

    /* Overriden AccessControl functions */

    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role == SUB_DEVELOPER_ROLE) {
            _checkRole(KEY_DEVELOPER_ROLE, msg.sender);
            EnumerableSet.AddressSet storage subDevelopersSet = subDevelopers[msg.sender];
            if (!subDevelopersSet.add(account)) revert SubDeveloperAlreadyInSet(msg.sender, account);
            if (subDevelopersSet.length() > SUB_DEVELOPERS_LIMIT) revert TooManySubDevelopers(msg.sender);
            subToKeyDeveloper[account] = msg.sender;
        }
        return super._grantRole(role, account);
    }

    function _revokeRole(bytes32 role, address account) internal override returns (bool) {
        if (role == SUB_DEVELOPER_ROLE) {
            address keyDeveloper = subToKeyDeveloper[account];
            EnumerableSet.AddressSet storage subDevelopersSet = subDevelopers[keyDeveloper];
            if (!subDevelopersSet.remove(account)) revert SubDeveloperNotInSet(keyDeveloper, account);
            delete subToKeyDeveloper[account];
        } else if (role == KEY_DEVELOPER_ROLE) {
            // Remove sub developers for specified key developer.
            EnumerableSet.AddressSet storage subDevelopersSet = subDevelopers[account];
            // Should not consume too much gas since number of sub devs is capped by `SUB_DEVELOPERS_LIMIT`.
            address[] memory subDeveloperValues = subDevelopersSet.values();
            for (uint256 i = 0; i < subDeveloperValues.length; ++i) {
                super._revokeRole(SUB_DEVELOPER_ROLE, subDeveloperValues[i]);
                delete subToKeyDeveloper[subDeveloperValues[i]];
            }
            subDevelopersSet.clear();
        }
        return super._revokeRole(role, account);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
