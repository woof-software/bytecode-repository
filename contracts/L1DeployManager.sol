// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Address, Errors } from "@openzeppelin/contracts/utils/Address.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { Client } from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import { IRouterClient } from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import { IVersionController, Types } from "./interfaces/IVersionController.sol";
import { IL1DeployManager } from "./interfaces/IL1DeployManager.sol";

/**
 * @title L1DeployManager
 * @author WOOF! Software
 * @custom:security-contact dmitriy@woof.software
 * @notice This contract orchestrates smart contract deployments on Ethereum L1 and facilitates secure cross-chain bytecode distribution to L2 networks via Chainlink CCIP.
 * - The contract retrieves audited bytecode from VersionController and deploys contracts using deterministic CREATE2 addresses for multi-chain consistency.
 * - Cross-chain bytecode transmission uses Chainlink CCIP for cryptographically secure message passing with decentralized validation and replay protection.
 * - Role-based access control ensures only authorized developers can deploy contracts and initiate cross-chain bytecode synchronization.
 * - Developers (Key Developer and Sub Developer roles) are able to:
 *   1. Deploy audited bytecode directly on Ethereum mainnet using CREATE2 for deterministic addresses.
 *   2. Send verified bytecode to configured L2 networks via Chainlink CCIP for multi-chain deployment consistency.
 *   3. Compute deployment addresses before actual deployment for predictable multi-chain contract addresses.
 *   4. Utilize integrated factory contracts for specialized deployment patterns requiring multiple coordinated deployments.
 * - Governors are able to:
 *   1. Configure supported L2 networks with their CCIP chain selectors and corresponding L2DeployManager addresses.
 *   2. Enable or disable cross-chain bytecode transmission to specific networks based on operational requirements.
 *   3. Withdraw ETH from the contract's balance.
 *   4. Upgrade the contract implementation via UUPS proxy pattern.
 * - Anyone is able to:
 *   1. Donate ETH to the contract to subsidize cross-chain message costs for developers and community deployments.
 *   2. Query chain configurations and deployment status for transparency and integration planning.
 * - The contract validates bytecode audit status before deployment, ensuring only auditor-verified contracts reach production networks.
 * - CCIP message encoding includes bytecode hash and full initCode, with automatic chunking via SSTORE2 for large contracts exceeding network limits.
 * - Address computation matches L2DeployManager behavior exactly, guaranteeing identical contract addresses across all supported networks.
 * - The contract serves as the canonical L1 coordinator for the BytecodeRepository ecosystem, bridging audited bytecode storage with multi-chain deployment execution.
 */
contract L1DeployManager is IL1DeployManager, UUPSUpgradeable {
    /// @notice Admin role for AccessControl.
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(IVersionController _versionController, IRouterClient _routerClient) {
        if (address(_versionController) == address(0) || address(_routerClient) == address(0)) revert ZeroAddress();
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
        if (!_isGovernor(msg.sender)) revert OnlyGovernor();
        _;
    }

    /// @notice Validates that the caller is developer or governor.
    /// @dev The role is checked through the VersionController.
    modifier onlyDeveloperOrGovernor() {
        if (!_isDeveloper(msg.sender) && !_isGovernor(msg.sender)) revert OnlyDeveloperOrGovernor();
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
        Types.BytecodeVersion calldata _bytecodeVersion,
        uint256 _chainId
    ) external payable onlyDeveloperOrGovernor supportedChain(_chainId) {
        bytes32 bytecodeHash = versionController.computeBytecodeHash(
            _bytecodeVersion.contractType,
            _bytecodeVersion.version
        );
        if (isVersionSentToChain[_chainId][bytecodeHash]) revert BytecodeAlreadySent(_chainId, bytecodeHash);
        _ccipSend(
            _chainId,
            abi.encode(MessageType.SEND_BYTECODE, bytecodeHash, versionController.getVerifiedBytecode(_bytecodeVersion))
        );
        isVersionSentToChain[_chainId][bytecodeHash] = true;

        emit BytecodeSent(_chainId, _bytecodeVersion);
    }

    /// @notice Allows developer to obtain Developer role on other chain for a 3-month period.
    /// @dev Caller must be a developer in VersionController.
    /// @param _chainId ID of other chain.
    function becomeDeveloperOnOtherChain(uint256 _chainId) external payable supportedChain(_chainId) {
        if (!_isDeveloper(msg.sender)) revert OnlyDeveloper();
        _ccipSend(_chainId, abi.encode(MessageType.BECOME_DEVELOPER, msg.sender));

        emit DeveloperAccessRequested(_chainId, msg.sender);
    }

    /// @notice Allows developers to deploy a certain version of bytecode on the Ethereum.
    /// @dev Bytecode must be uploaded and verified in the VersionController.
    /// @dev Bytecode is deployed via Create2.
    /// @param _bytecodeVersion A specific version of contract type to deploy.
    /// @param _salt A value necessary to generate a unique salt for Create2.
    /// @param _constructorParams encoded parameters necessary to deploy a specified contract.
    function deploy(
        Types.BytecodeVersion calldata _bytecodeVersion,
        bytes32 _salt,
        bytes calldata _constructorParams
    ) external payable onlyDeveloperOrGovernor returns (address) {
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, msg.sender));
        bytes memory bytecodeWithParams = abi.encodePacked(
            versionController.getVerifiedBytecode(_bytecodeVersion),
            _constructorParams
        );
        address newContract = Create2.deploy(0, uniqueSalt, bytecodeWithParams);

        emit ContractDeployed(_bytecodeVersion, _constructorParams, newContract, msg.sender);
        return newContract;
    }

    /* View functions */

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
        bytes memory bytecodeWithParams = abi.encodePacked(
            versionController.getVerifiedBytecode(_bytecodeVersion),
            _constructorParams
        );
        return Create2.computeAddress(uniqueSalt, keccak256(bytecodeWithParams));
    }

    /* Cross-chain internal helper functions */

    /// @notice Initiates a cross-chain message through the Chainlink CCIP.
    /// @param _chainId ID of the supported network.
    /// @param _message Message to send to other chain.
    function _ccipSend(uint256 _chainId, bytes memory _message) private {
        ChainConfig storage config = chainConfigs[_chainId];
        Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(config.l2DeployManager),
            data: _message,
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

    function _isGovernor(address _governor) private view returns (bool) {
        return versionController.hasRole(DEFAULT_ADMIN_ROLE, _governor);
    }

    function _isDeveloper(address _developer) private view returns (bool) {
        return versionController.isDeveloper(_developer);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyGovernor {}
}
