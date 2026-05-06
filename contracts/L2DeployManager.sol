// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Client } from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import { CCIPReceiver } from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import { BytecodeStore } from "./libraries/BytecodeStore.sol";
import { Types } from "./interfaces/Types.sol";
import { IBytecodeProvider } from "./interfaces/IBytecodeProvider.sol";
import { IL2DeployManager } from "./interfaces/IL2DeployManager.sol";

/**
 * @title L2DeployManager
 * @author WOOF! Software
 * @custom:security-contact dmitriy@woof.software
 * @notice This contract receives audited bytecode from L1 via Chainlink CCIP and enables secure, deterministic contract deployment on Layer 2 networks.
 * - The contract acts as a CCIP receiver, validating and storing bytecode transmitted from the trusted L1DeployManager with cryptographic integrity guarantees.
 * - Bytecode is stored using SSTORE2 optimization for gas-efficient persistence on L2 networks, supporting contracts larger than 24KB through intelligent chunking.
 * - Deployment functionality mirrors L1DeployManager exactly, ensuring identical CREATE2 addresses across all networks for seamless multi-chain UX.
 * - Integration as a BytecodeProvider enables specialized factories to retrieve stored bytecode for complex multi-contract deployment patterns.
 * - CCIP message validation ensures only bytecode from authorized L1DeployManager can be stored, preventing unauthorized bytecode injection.
 * - Anyone is able to:
 *   1. Deploy stored bytecode using CREATE2 with deterministic addresses matching L1 deployments for consistent multi-chain contract addresses.
 *   2. Compute deployment addresses before actual deployment for predictable contract planning and integration.
 *   3. Query stored bytecode availability to verify cross-chain synchronization status and plan deployments.
 *   4. Retrieve bytecode for custom deployment logic or verification purposes through the BytecodeProvider interface.
 * - The contract automatically handles:
 *   1. CCIP message reception and validation from trusted L1DeployManager to ensure init code hash authenticity and prevent malicious injections.
 *   2. Bytecode storage using SSTORE2 with automatic chunking for large contracts exceeding network gas limits or size constraints.
 *   3. Address computation using identical salt generation as L1DeployManager, guaranteeing cross-chain address consistency.
 *   4. Integration with factory contracts via BytecodeProvider interface for specialized deployment patterns and protocol-specific logic.
 * - All bytecodes are sent through VersionController, ensuring deployed contracts match exactly with L1-approved versions.
 * - The contract serves as the canonical L2 endpoint for BytecodeRepository ecosystem, enabling trustless multi-chain deployment with audit verification.
 * - Factory contracts and custom deployment tools can retrieve bytecode through the IBytecodeProvider interface for specialized deployment patterns.
 * - The system maintains a complete audit trail of received bytecode with CCIP message IDs for transparency and debugging purposes.
 */
contract L2DeployManager is IL2DeployManager, IBytecodeProvider, CCIPReceiver {
    /// @notice a period of time for which developer role is granted on current chain.
    uint256 public constant DEVELOPER_ACCESS_DURATION = 90 days;
    /// @notice Source chain selector for Chainlink CCIP.
    uint64 public immutable sourceChainSelector;
    /// @notice The address of L1DeployManager in Ethereum.
    address public immutable l1DeployManager;
    /// @notice The address of local timelock.
    address public immutable localTimelock;
    /// @notice Hash of bytecode, which should be uploaded. If non-empty, an init code which generates the exact hash must be uploaded.
    mapping(bytes32 => bytes32) public bytecodeRequested;
    /// @notice Address pointers at which parts of bytecode are stored. Contract types => pointers.
    mapping(bytes32 => address[]) private storedBytecodePtrs;
    /// @notice A timestamp until which the account has a developer role on current chain.
    mapping(address => uint256) public developerUntil;

    constructor(
        uint64 _sourceChainSelector,
        address _l1DeployManager,
        address _router,
        address _localTimelock
    ) CCIPReceiver(_router) {
        if (_l1DeployManager == address(0) || _localTimelock == address(0)) revert ZeroAddress();
        sourceChainSelector = _sourceChainSelector;
        l1DeployManager = _l1DeployManager;
        localTimelock = _localTimelock;
    }

    /// @notice Validates that the caller is developer or governor.
    modifier onlyDeveloperOrGovernor() {
        if (!isDeveloper(msg.sender) && msg.sender != localTimelock) revert OnlyDeveloperOrGovernor();
        _;
    }

    /* Developer functions */

    /// @notice Allows anyone to deploy a certain version of bytecode on the current network.
    /// @dev Bytecode must be sent from the L1DeployManager.
    /// @dev Bytecode will be deployed through the appropriate Factory if it is set. Otherwise, L2DeployManager will try to deploy it via Create2.
    /// @param _bytecodeVersion A specific version of contract type to deploy.
    /// @param _salt A value necessary to generate a unique salt for Create2.
    /// @param _constructorParams parameters necessary to deploy a specified contract.
    function deploy(
        Types.BytecodeVersion calldata _bytecodeVersion,
        bytes32 _salt,
        bytes calldata _constructorParams
    ) external payable onlyDeveloperOrGovernor returns (address) {
        bytes memory initCode = getVerifiedBytecode(_bytecodeVersion);
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, msg.sender));
        bytes memory bytecodeWithParams = abi.encodePacked(initCode, _constructorParams);
        address newContract = Create2.deploy(0, uniqueSalt, bytecodeWithParams);

        emit ContractDeployed(_bytecodeVersion, _constructorParams, newContract, msg.sender);
        return newContract;
    }

    /// @notice Uploads init code for a requested bytecode version.
    /// @dev Uploading must first be requested via L1 through CCIP.
    /// @dev The hash of init code must match the hash stored in _ccipReceive.
    /// @dev Anyone can upload bytecode as long as valid init code is provided.
    /// @param _bytecodeVersion Version of bytecode for which to upload.
    /// @param _initCode Valid init code matching stored init code hash to upload.
    function uploadBytecode(Types.BytecodeVersion calldata _bytecodeVersion, bytes calldata _initCode) external {
        bytes32 bytecodeHash = BytecodeStore._computeBytecodeHash(
            _bytecodeVersion.contractType,
            _bytecodeVersion.version
        );
        bytes32 initCodeHash = keccak256(_initCode);
        if (bytecodeRequested[bytecodeHash] == bytes32(0)) revert BytecodeNotRequested(bytecodeHash);
        if (bytecodeRequested[bytecodeHash] != initCodeHash) revert InvalidBytecode(bytecodeHash, initCodeHash);
        storedBytecodePtrs[bytecodeHash] = BytecodeStore._writeInitCode(_initCode);
        delete bytecodeRequested[bytecodeHash];
        emit BytecodeUploaded(bytecodeHash);
    }

    /* View functions */

    /// @notice Returns a bytecode of the specified version.
    /// @dev Can be used to validate if bytecode was sent to the current network.
    /// @dev All bytecodes sent to L2 are already verified as only verified bytecodes can be sent.
    /// @param _version A version of bytecode for which to return bytecode.
    /// @return Bytecode of the specified contract type and its version.
    function getVerifiedBytecode(Types.BytecodeVersion calldata _version) public view returns (bytes memory) {
        bytes memory initCode = BytecodeStore._readInitCode(
            storedBytecodePtrs[BytecodeStore._computeBytecodeHash(_version.contractType, _version.version)]
        );
        if (initCode.length == 0) revert BytecodeIsEmpty();
        return initCode;
    }

    function versionExists(Types.BytecodeVersion calldata _version) external view returns (bool) {
        return
            storedBytecodePtrs[BytecodeStore._computeBytecodeHash(_version.contractType, _version.version)].length != 0;
    }

    /// @notice Computes a pre-deployed addresses of specified contract type and version.
    /// @param _salt A value necessary to generate a unique salt for Create2.
    /// @param _constructorParams encoded parameters necessary to deploy a specified contract.
    /// @param _deployer Address of deployer. Necessary for unique salt generation.
    /// @return Address of computed pre-deployed smart contract.
    function computeAddress(
        Types.BytecodeVersion calldata _bytecodeVersion,
        bytes32 _salt,
        bytes calldata _constructorParams,
        address _deployer
    ) external view returns (address) {
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, _deployer));
        bytes memory bytecodeWithParams = abi.encodePacked(getVerifiedBytecode(_bytecodeVersion), _constructorParams);
        return Create2.computeAddress(uniqueSalt, keccak256(bytecodeWithParams));
    }

    /// @notice Validates if given account is developer.
    /// @param _account Address to check.
    /// @return true if account is developer, false otherwise.
    function isDeveloper(address _account) public view returns (bool) {
        return developerUntil[_account] >= block.timestamp;
    }

    /* Internal helpers */

    /// @notice Helper function for receiving messages from L1DeployManager.
    /// @dev The sender of the message from Ethereum must be L1DeployManager.
    /// @param any2EvmMessage params necessary for the cross-chain message. Data contains bytecode hash and its init code hash for SEND_BYTECODE.
    /// and address of developer for BECOME_DEVELOPER or REVOKE_DEVELOPER.
    function _ccipReceive(Client.Any2EVMMessage memory any2EvmMessage) internal override {
        if (
            abi.decode(any2EvmMessage.sender, (address)) != l1DeployManager ||
            any2EvmMessage.sourceChainSelector != sourceChainSelector
        ) revert InvalidSender();
        MessageType mt = abi.decode(any2EvmMessage.data, (MessageType));
        if (mt == MessageType.SEND_BYTECODE) {
            (, bytes32 bytecodeHash, bytes32 initCodeHash) = abi.decode(
                any2EvmMessage.data,
                (MessageType, bytes32, bytes32)
            );
            if (storedBytecodePtrs[bytecodeHash].length != 0) revert BytecodeAlreadyUploaded(bytecodeHash);
            bytecodeRequested[bytecodeHash] = initCodeHash;

            emit BytecodeRequested(any2EvmMessage.messageId, bytecodeHash, initCodeHash);
        } else if (mt == MessageType.BECOME_DEVELOPER) {
            (, address developer) = abi.decode(any2EvmMessage.data, (MessageType, address));
            developerUntil[developer] = block.timestamp + DEVELOPER_ACCESS_DURATION;

            emit DeveloperAccessGranted(developer);
        } else {
            (, address account) = abi.decode(any2EvmMessage.data, (MessageType, address));
            delete developerUntil[account];

            emit DeveloperRevoked(account);
        }
    }
}
