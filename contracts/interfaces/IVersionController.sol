// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { Types } from "./Types.sol";
import { IBytecodeProvider } from "./IBytecodeProvider.sol";

interface IVersionController is IAccessControl, Types, IBytecodeProvider {
    event PrimaryAuditorSet(address _primaryAuditor);
    event KeyDeveloperAssigned(bytes32 _contractType, address _keyDeveloper);
    event BytecodeUploaded(bytes32 _contractType, Version _version);
    event AuditReportSubmitted(address _author, string _auditReport, bytes32 _bytecodeHash, bytes _signature);
    event CooldownReset(bytes32 _contractType, VersionType _version, uint64 _major);

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
    error BytecodeAlreadyUploaded(bytes32 _bytecodeHash);
    error EmptyURL();
    error CantReleaseYet();
    error ZeroAddress();
    error AdminCantAddSubDevs();

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
        bytes32 _bytecodeVersionHash,
        bytes32 _bytecodeHash,
        string calldata _auditReport
    ) external pure returns (bytes32);

    function getKeyDeveloper(address _account) external view returns (address);

    function getSubDevsForKeyDeveloper(address _keyDeveloper) external view returns (address[] memory);

    function isBytecodeVerified(BytecodeVersion calldata _version) external view returns (bool);

    function getLatestVersion(bytes32 _contractType) external view returns (string memory);

    function getAuditorsForBytecodeVersion(BytecodeVersion calldata _version) external view returns (address[] memory);

    function getAuditReport(BytecodeVersion calldata _version, address _auditor) external view returns (string memory);

    function versionExists(bytes32 _bytecodeHash) external view returns (bool);

    function getAllAlternativeVersions(bytes32 _contractType) external view returns (VersionWithAlternative[] memory);
}
