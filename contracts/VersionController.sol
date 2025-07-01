pragma solidity 0.8.30;

import {
    AccessControlEnumerableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { SSTORE2 } from "solady/src/utils/SSTORE2.sol";
import { IVersionController } from "./interfaces/IVersionController.sol";

contract VersionController is AccessControlEnumerableUpgradeable, UUPSUpgradeable, IVersionController {
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes32 public constant KEY_DEVELOPER_ROLE = keccak256("KEY_DEVELOPER_ROLE");
    bytes32 public constant SUB_DEVELOPER_ROLE = keccak256("SUB_DEVELOPER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    uint256 public constant SUB_DEVELOPERS_LIMIT = 3;

    mapping(bytes32 => address) private contractTypeKeyDeveloper;
    mapping(address => EnumerableSet.AddressSet) private subDevelopers;
    mapping(address => address) public subToKeyDeveloper;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _governor) external initializer {
        __AccessControlEnumerable_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _governor);
    }

    /* Governor functions */

    /// @notice Assigns a new key developer for a certain contract type.
    /// @dev Governor can use this function to initializes contract type and forcibly assign new key developer.
    /// @dev Key developer can use this functions to transfer developer rights over contracy type to another key developer.
    function assignDeveloperForContractType(bytes32 _contractType, address _keyDeveloper) external {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && contractTypeKeyDeveloper[_contractType] != msg.sender)
            revert NotAuthorized(msg.sender);
        _checkRole(KEY_DEVELOPER_ROLE, _keyDeveloper);
        if (contractTypeKeyDeveloper[_contractType] == _keyDeveloper) revert SameKeyDeveloper(_keyDeveloper);
        contractTypeKeyDeveloper[_contractType] = _keyDeveloper;

        emit KeyDeveloperAssigned(_contractType, _keyDeveloper);
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

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

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
}
