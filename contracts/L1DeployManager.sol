pragma solidity 0.8.30;

import { Address, Errors } from "@openzeppelin/contracts/utils/Address.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { Client } from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import { IRouterClient } from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import { IVersionController } from "./interfaces/IVersionController.sol";
import { IFactory } from "./interfaces/IFactory.sol";
import { IL1DeployManager } from "./interfaces/IL1DeployManager.sol";

contract L1DeployManager is IL1DeployManager, UUPSUpgradeable {
    /// @notice Admin role for AccessControl.
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
    /// @notice Key Developer role for AccessControl.
    bytes32 public constant KEY_DEVELOPER_ROLE = keccak256("KEY_DEVELOPER_ROLE");
    /// @notice Sub Developer role for AccessControl.
    bytes32 public constant SUB_DEVELOPER_ROLE = keccak256("SUB_DEVELOPER_ROLE");
    /// @notice Auditor role for AccessControl.
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    /// @notice Address of the VersionControlles SC.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IVersionController public immutable versionController;
    /// @notice Address of Chainlink CCIP Router.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IRouterClient public immutable routerClient;
    /// @notice Stores chain config per each supported chain.
    mapping(uint256 => ChainConfig) public chainConfigs;
    /// @notice Inidicates whether a specific version of contract type was sent to a certain chain.
    mapping(uint256 => mapping(bytes32 => bool)) public isVersionSentToChain;
    /// @notice Stores a factory per each supported contract type on Ethereum.
    mapping(bytes32 => IFactory) public contractTypeFactory;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(IVersionController _versionController, IRouterClient _routerClient) {
        versionController = _versionController;
        routerClient = _routerClient;
        _disableInitializers();
    }

    /// @notice Allows anyone to donate ETH which can later be used by devs to pay for cross-chain messages.
    receive() external payable {}

    function initialize() external initializer {
        __UUPSUpgradeable_init();
    }

    /// @notice Validates that the caller is the Governor.
    /// @dev The role is checked through the VersionController.
    modifier onlyGovernor() {
        if (!versionController.hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert OnlyGovernor();
        _;
    }

    /// @notice Validates that the caller is developer.
    /// @dev The role is checked through the VersionController.
    modifier onlyDeveloper() {
        if (
            !versionController.hasRole(SUB_DEVELOPER_ROLE, msg.sender) &&
            !versionController.hasRole(KEY_DEVELOPER_ROLE, msg.sender)
        ) revert OnlyDeveloper();
        _;
    }

    /// @notice Validates that the network with provided chain id is supported.
    modifier supportedChain(uint256 _chainId) {
        if (chainConfigs[_chainId].l2DeployManager == address(0)) revert UnsupportedChain(_chainId);
        _;
    }

    /* Governor functions */

    /// @notice Sets the chain config necessary for cross-chain messaging.
    /// @param _chainId ID of a network for which to set the config.
    /// @param _config parameters necessary for cross-chain messaging with specified network.
    function setChainConfig(uint256 _chainId, ChainConfig calldata _config) external onlyGovernor {
        chainConfigs[_chainId] = _config;

        emit ChainConfigSet(_chainId, _config);
    }

    /// @notice Sets a factory for specific contract type for deploying smart contract on Ethereum.
    /// @param _contractType A type of contract for which to set the factory.
    /// @param _factory Address of the factory on Ethereum.
    function setContractTypeFactory(bytes32 _contractType, IFactory _factory) external onlyGovernor {
        contractTypeFactory[_contractType] = _factory;

        emit FactorySet(_contractType, address(_factory));
    }

    /// @notice Allows the Governor to withdraw all the ETH stored on the smart contract's balance.
    function withdrawETH() external onlyGovernor {
        Address.sendValue(payable(msg.sender), address(this).balance);
    }

    /* Developer functions */

    /// @notice Allows any developer to initiate sending of specific bytecode version to another network.
    /// @dev Bytecode can be sent only once to a certain network.
    /// @dev Bytecode must be uploaded and verified in the VersionController.
    /// @dev Developers should provide ETH along with calling this function to pay for cross-chain message
    /// unless the ETH is already donated through the receive() function.
    /// @param _bytecodeVersion A specific version of contract type.
    /// @param _chainId ID of the network to which to send bytecode. Chain ID must be registered by the Governor.
    function sendBytecodeToOtherChain(
        IVersionController.BytecodeVersion calldata _bytecodeVersion,
        uint256 _chainId
    ) external payable onlyDeveloper supportedChain(_chainId) {
        bytes32 bytecodeHash = versionController.computeBytecodeHash(
            _bytecodeVersion.contractType,
            _bytecodeVersion.version
        );
        if (isVersionSentToChain[_chainId][bytecodeHash]) revert BytecodeAlreadySent(_chainId, bytecodeHash);
        _ccipSend(_chainId, bytecodeHash, versionController.getVerifiedBytecode(_bytecodeVersion));
        isVersionSentToChain[_chainId][bytecodeHash] = true;

        emit BytecodeSent(_chainId, _bytecodeVersion);
    }

    /// @notice Allows anyone to deploy a certain version of bytecode on the Ethereum.
    /// @dev Bytecode must be uploaded and verified in the VersionController.
    /// @dev Bytecode will be deployed through the appropriate Factory if it is set. Otherwise, L1DeployManager will try to deploy it via Create2.
    /// @param _bytecodeVersion A specific version of contract type to deploy.
    /// @param _salt A value necessary to generate a unique salt for Create2.
    /// @param _constructorParams parameters necessary to deploy a specified contract.
    function deploy(
        IVersionController.BytecodeVersion calldata _bytecodeVersion,
        bytes32 _salt,
        bytes calldata _constructorParams
    ) external {
        // TODO Add deployment of contract in case factory is not set.
        contractTypeFactory[_bytecodeVersion.contractType].deploy(
            _bytecodeVersion.contractType,
            _salt,
            versionController.getVerifiedBytecode(_bytecodeVersion),
            _constructorParams
        );
    }

    /* Cross-chain internal helper functions */

    /// @notice Initiates a cross-chain message through the Chainlink CCIP.
    /// @param _chainId ID of the supported network.
    /// @param _bytecodeHash A hash of bytecode to send.
    /// @param _initCode Bytecode to send.
    function _ccipSend(uint256 _chainId, bytes32 _bytecodeHash, bytes memory _initCode) private {
        ChainConfig storage config = chainConfigs[_chainId];
        Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(config.l2DeployManager),
            data: abi.encode(_bytecodeHash, _initCode),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({ gasLimit: config.gasLimit, allowOutOfOrderExecution: true })
            ),
            feeToken: address(0)
        });
        uint256 feeValue = routerClient.getFee(config.destinationChainSelector, evm2AnyMessage);
        if (feeValue > address(this).balance) revert Errors.InsufficientBalance(address(this).balance, feeValue);
        routerClient.ccipSend{ value: feeValue }(config.destinationChainSelector, evm2AnyMessage);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyGovernor {}
}
