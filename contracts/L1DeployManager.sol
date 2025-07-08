pragma solidity 0.8.30;

import { Client } from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import { IRouterClient } from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import { IVersionController } from "./interfaces/IVersionController.sol";
import { IL1DeployManager } from "./interfaces/IL1DeployManager.sol";

contract L1DeployManager is IL1DeployManager {
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
    /// @notice Key Developer role for AccessControl.
    bytes32 public constant KEY_DEVELOPER_ROLE = keccak256("KEY_DEVELOPER_ROLE");
    /// @notice Sub Developer role for AccessControl.
    bytes32 public constant SUB_DEVELOPER_ROLE = keccak256("SUB_DEVELOPER_ROLE");
    /// @notice Auditor role for AccessControl.
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    IVersionController public immutable versionController;
    IRouterClient public immutable routerClient;
    mapping(uint256 => ChainConfig) public chainConfigs;
    mapping(uint256 => mapping(bytes32 => bool)) public isVersionSentToChain;
    mapping(bytes32 => address) public contractTypeFactory;

    constructor(IVersionController _versionController, IRouterClient _routerClient) {
        versionController = _versionController;
        routerClient = _routerClient;
    }

    modifier onlyGovernor() {
        if (!versionController.hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert OnlyGovernor();
        _;
    }

    modifier onlyDeveloper() {
        if (
            !versionController.hasRole(SUB_DEVELOPER_ROLE, msg.sender) &&
            !versionController.hasRole(KEY_DEVELOPER_ROLE, msg.sender)
        ) revert OnlyDeveloper();
        _;
    }

    modifier supportedChain(uint256 _chainId) {
        if (chainConfigs[_chainId].l2DeployManager == address(0)) revert UnsupportedChain(_chainId);
        _;
    }

    /* Governor functions */

    function setL2DeployManager(uint256 _chainId, ChainConfig calldata _config) external onlyGovernor {
        chainConfigs[_chainId] = _config;

        emit ChainConfigSet(_chainId, _config);
    }

    function setContractTypeFactory(bytes32 _contractType, address _factory) external onlyGovernor {
        contractTypeFactory[_contractType] = _factory;

        emit FactorySet(_contractType, _factory);
    }

    /* Developer functions */

    function sendBytecodeToOtherChain(
        IVersionController.BytecodeVersion calldata _bytecodeVersion,
        uint256 _chainId
    ) external payable onlyDeveloper supportedChain(_chainId) {
        _ccipSend(_chainId, versionController.getVerifiedBytecode(_bytecodeVersion));
        bytes32 bytecodeHash = versionController.computeBytecodeHash(
            _bytecodeVersion.contractType,
            _bytecodeVersion.version
        );
        isVersionSentToChain[_chainId][bytecodeHash] = true;

        emit BytecodeSent(_chainId, _bytecodeVersion);
    }

    /* Cross-chain internal helper functions */

    function _ccipSend(uint256 _chainId, bytes memory _initCode) private {
        ChainConfig storage config = chainConfigs[_chainId];
        Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(config.l2DeployManager),
            data: _initCode,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({ gasLimit: config.gasLimit, allowOutOfOrderExecution: true })
            ),
            feeToken: address(0)
        });
        uint256 feeValue = routerClient.getFee(config.destinationChainSelector, evm2AnyMessage);
        if (feeValue > address(this).balance) revert InsufficientBalance();
        routerClient.ccipSend{ value: feeValue }(config.destinationChainSelector, evm2AnyMessage);
    }
}
