pragma solidity 0.8.30;

import {
    AccessControlEnumerableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { SSTORE2 } from "solady/src/utils/SSTORE2.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { IVersionController } from "./interfaces/IVersionController.sol";

contract VersionController is
    AccessControlEnumerableUpgradeable,
    UUPSUpgradeable,
    IVersionController,
    EIP712Upgradeable
{
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using Strings for uint256;

    bytes32 public constant BYTECODE_VERSION_TYPEHASH =
        keccak256("BytecodeVersion(bytes32 contractType,uint64 major,uint64 minor,uint64 patch,string alternative)");
    bytes32 public constant AUDIT_REPORT_TYPEHASH = keccak256("AuditReport(bytes32 bytecodeHash,string auditReport)");
    bytes32 public constant KEY_DEVELOPER_ROLE = keccak256("KEY_DEVELOPER_ROLE");
    bytes32 public constant SUB_DEVELOPER_ROLE = keccak256("SUB_DEVELOPER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    uint256 public constant SUB_DEVELOPERS_LIMIT = 3;
    /// @notice small buffer to account for `SSTORE2` overhead
    uint256 public constant CHUNK_SIZE = 24500;

    mapping(bytes32 => address) public contractTypeKeyDeveloper;
    mapping(address => EnumerableSet.AddressSet) private subDevelopers;
    mapping(address => address) public subToKeyDeveloper;

    mapping(bytes32 => Version) public latestVersions;
    mapping(bytes32 => mapping(uint64 => uint64)) public latestMinor;
    mapping(bytes32 => mapping(uint64 => mapping(uint64 => uint64))) public latestPatch;

    mapping(bytes32 => VersionWithAlternative[]) private alternativeVersions;
    mapping(bytes32 => mapping(string => bool)) public alternativeVersionExists;

    mapping(bytes32 => Bytecode) public bytecodes;
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

    modifier checkDeveloper(bytes32 _contractType, address _developer) {
        address contractTypeKeyDev = contractTypeKeyDeveloper[_contractType];
        if (!hasRole(KEY_DEVELOPER_ROLE, _developer) && !hasRole(SUB_DEVELOPER_ROLE, _developer))
            revert NotDeveloper(_developer);
        if (contractTypeKeyDev != _developer && subToKeyDeveloper[_developer] != contractTypeKeyDev)
            revert WrongDeveloper(_contractType, _developer);
        _;
    }

    modifier bytecodeReleased(bytes32 _contractType) {
        if (latestVersions[_contractType].major == 0) revert BytecodeNotReleased(_contractType);
        _;
    }

    /* Governor functions */

    /// @notice Assigns a new key developer for a certain contract type.
    /// @dev Governor can use this function to initializes contract type and forcibly assign new key developer.
    /// @dev Key developer can use this functions to transfer developer rights over contracy type to another key developer.
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

    function releaseMinorVersion(
        BytecodeInput calldata _bytecodeInput,
        uint64 _major
    ) external bytecodeReleased(_bytecodeInput.contractType) checkDeveloper(_bytecodeInput.contractType, msg.sender) {
        Version storage latestVersion = latestVersions[_bytecodeInput.contractType];
        if (_major > latestVersion.major) revert NonExistingMajorVersion(_bytecodeInput.contractType, _major);
        VersionWithAlternative memory version = VersionWithAlternative(
            Version(_major, latestMinor[_bytecodeInput.contractType][_major]++, 0),
            ""
        );
        address keyDeveloper = getKeyDeveloper(msg.sender);
        _uploadBytecode(_bytecodeInput, keyDeveloper, version);

        if (_major == latestVersion.major) {
            latestVersion.minor = version.version.minor;
            latestVersion.patch = 0;
        }
    }

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
            Version(_major, _minor, latestPatch[_bytecodeInput.contractType][_major][_minor]++),
            ""
        );
        address keyDeveloper = getKeyDeveloper(msg.sender);
        _uploadBytecode(_bytecodeInput, keyDeveloper, version);

        if (_major == latestVersion.major && _minor == latestVersion.minor) latestVersion.patch = version.version.patch;
    }

    function releaseAlternativeVersion(
        BytecodeInput calldata _bytecodeInput,
        VersionWithAlternative calldata _version
    ) external checkDeveloper(_bytecodeInput.contractType, msg.sender) {
        if (_version.version.major > latestVersions[_bytecodeInput.contractType].major)
            revert NonExistingMajorVersion(_bytecodeInput.contractType, _version.version.major);
        if (_version.version.minor > latestMinor[_bytecodeInput.contractType][_version.version.major])
            revert NonExistingMinorVersion(_bytecodeInput.contractType, _version.version.major, _version.version.minor);
        if (
            _version.version.patch >
            latestPatch[_bytecodeInput.contractType][_version.version.major][_version.version.minor]
        ) revert NonExistingPatch(_bytecodeInput.contractType, _version.version);
        address keyDeveloper = getKeyDeveloper(msg.sender);
        _uploadBytecode(_bytecodeInput, keyDeveloper, _version);

        alternativeVersions[_bytecodeInput.contractType].push(_version);
        alternativeVersionExists[_bytecodeInput.contractType][_versionToStr(_version)] = true;
    }

    /* Auditor functions */

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
    function removeSubDeveloper(address _subDeveloper) external {
        bool result = _revokeRole(SUB_DEVELOPER_ROLE, _subDeveloper);
        // _revokeRole() returns false if account already doesn't have a specified role
        if (!result) revert NotSubDeveloper(_subDeveloper);
    }

    /* View functions */

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

    function computeAuditReportHash(bytes32 _bytecodeHash, string calldata _auditReport) public pure returns (bytes32) {
        return keccak256(abi.encode(AUDIT_REPORT_TYPEHASH, _bytecodeHash, bytes(_auditReport)));
    }

    function getKeyDeveloper(address _account) public view returns (address) {
        return hasRole(KEY_DEVELOPER_ROLE, _account) ? _account : subToKeyDeveloper[_account];
    }

    function isBytecodeVerified(BytecodeVersion calldata _version) public view returns (bool) {
        return bytecodeAuditStatus[computeBytecodeHash(_version.contractType, _version.version)].verified;
    }

    function getLatestVersion(bytes32 _contractType) external view returns (string memory) {
        return _versionToStr(VersionWithAlternative(latestVersions[_contractType], ""));
    }

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

    function versionExists(BytecodeVersion calldata _version) external view returns (bool) {
        return
            _version.version.version.major <= latestVersions[_version.contractType].major &&
                _version.version.version.minor <= latestMinor[_version.contractType][_version.version.version.major] &&
                latestPatch[_version.contractType][_version.version.version.major][_version.version.version.minor] <=
                _version.version.version.patch
                ? true
                : false;
    }

    /// @dev Throws and error if bytecode is not verified by at least one auditor.
    function getVerifiedBytecode(BytecodeVersion calldata _version) external view returns (bytes memory) {
        if (!isBytecodeVerified(_version)) revert BytecodeNotVerified(_version);
        return _readInitCode(bytecodes[computeBytecodeHash(_version.contractType, _version.version)].initCodePtrs);
    }

    function getAllAlternativeVersions(bytes32 _contractType) external view returns (VersionWithAlternative[] memory) {
        return alternativeVersions[_contractType];
    }

    /* Internal helpers */

    function _uploadBytecode(
        BytecodeInput calldata _bytecodeInput,
        address _keyDeveloper,
        VersionWithAlternative memory _version
    ) internal {
        address[] memory initCodePointers = _writeInitCode(_bytecodeInput.initCode);
        Bytecode memory bc = Bytecode({
            contractType: _bytecodeInput.contractType,
            initCodePtrs: initCodePointers,
            sourceURL: _bytecodeInput.sourceURL,
            author: _keyDeveloper
        });

        bytes32 hash = computeBytecodeHash(_bytecodeInput.contractType, _version);
        bytecodes[hash] = bc;

        emit BytecodeUploaded(_bytecodeInput.contractType, _version.version);
    }

    function _writeInitCode(bytes calldata _initCode) internal returns (address[] memory) {
        if (_initCode.length == 0) revert InitCodeIsEmpty();
        uint256 len = (_initCode.length - 1) / CHUNK_SIZE + 1;
        address[] memory initCodePointers = new address[](len);
        for (uint256 i; i < len; ++i) {
            uint256 start = i * CHUNK_SIZE;
            uint256 end = start + CHUNK_SIZE;
            if (end > _initCode.length) end = _initCode.length;
            initCodePointers[i] = SSTORE2.write(_initCode[start:end]);
        }
        return initCodePointers;
    }

    function _readInitCode(address[] memory _initCodePtrs) internal view returns (bytes memory) {
        bytes memory initCode;
        for (uint256 i; i < _initCodePtrs.length; ++i) {
            initCode = bytes.concat(initCode, SSTORE2.read(_initCodePtrs[i]));
        }
        return initCode;
    }

    function _versionToStr(VersionWithAlternative memory _version) internal pure returns (string memory) {
        return
            string.concat(
                uint256(_version.version.major).toString(),
                uint256(_version.version.minor).toString(),
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
            for (uint256 i = 0; i < subDeveloperValues.length; i++) {
                super._revokeRole(SUB_DEVELOPER_ROLE, subDeveloperValues[i]);
                delete subToKeyDeveloper[subDeveloperValues[i]];
            }
            subDevelopersSet.clear();
        }
        return super._revokeRole(role, account);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
