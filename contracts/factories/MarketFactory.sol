// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { Types } from "../interfaces/Types.sol";
import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";
import { Configuration, ExtConfiguration } from "../integration/CometConfiguration.sol";
import { BaseFactory } from "./BaseFactory.sol";

/**
 * @title MarketFactory
 * @author WOOF! Software
 * @custom:security-contact dmitriy@woof.software
 * @notice This factory contract orchestrates complex multi-contract Comet market deployments with automatic dependency resolution and proxy pattern integration.
 * - The contract deploys complete Comet markets consisting of CometExt (extension), Comet (implementation), and TransparentUpgradeableProxy in a single transaction.
 * - Automatic dependency injection sets extension delegate addresses and manages inter-contract relationships during deployment for fully configured markets.
 * - Deploys extended asset list variants (CometExtWithAssetList/CometWithAssetList) for enhanced collateral capacity and asset management.
 * - Integration with OpenZeppelin's TransparentUpgradeableProxy pattern provides upgradeable market implementations while maintaining security and governance controls.
 * - Address pre-computation enables predictable market addresses before deployment for integration planning and cross-chain coordination.
 * - The contract utilizes immutable dependencies for CometProxyAdmin and AssetListFactory, ensuring consistent upgrade authority and asset list management across deployments.
 * - Anyone is able to:
 *   1. Deploy complete Comet markets with CometExt, Comet implementation, and upgradeable proxy in a coordinated three-contract deployment.
 *   2. Deploy markets with extended asset list support for enhanced collateral management and scalability.
 *   3. Compute all three contract addresses before deployment for integration planning and verification purposes.
 *   4. Deploy markets with custom configurations including interest rate models, governance parameters, and collateral asset specifications.
 * - The contract automatically handles:
 *   1. Sequential deployment of CometExt with appropriate constructor parameters and asset list factory integration when required.
 *   2. Dependency injection by setting the deployed CometExt address as extensionDelegate in the Comet configuration before deployment.
 *   3. Comet implementation deployment with updated configuration containing correct extension delegate and protocol parameters.
 *   4. TransparentUpgradeableProxy deployment pointing to the Comet implementation with configured proxy admin for upgrade authority.
 *   5. Salt derivation using address-based salts for deterministic yet unique deployment addresses across related contracts.
 * - Extended asset list support is built-in, automatically deploying CometExtWithAssetList and CometWithAssetList contract variants for all markets.
 * - Asset list factory integration provides enhanced collateral management for markets requiring support for numerous or dynamic asset lists.
 * - The factory maintains full compatibility with Compound V3 governance patterns while adding BytecodeRepository audit verification and multi-chain deployment capabilities.
 * - Proxy admin integration ensures proper upgrade authority while maintaining security boundaries between market implementations and governance controls.
 */
contract MarketFactory is BaseFactory {
    /// @notice CometExt With AssetList contract type.
    bytes32 public constant COMET_EXT_ASSET_LIST_CT = "CometExtWithAssetList";
    /// @notice CometWithExtendedAssetList contract type.
    bytes32 public constant COMET_ASSET_LIST_CT = "CometWithAssetList";
    /// @notice Address of the CometProxyAdmin to use during deployment of all Comets.
    address public immutable cometProxyAdmin;
    /// @notice Address of the AssetListFactory to use during deployment of CometWithExtendedAssetList.
    address public immutable assetListFactory;
    /// @notice The address of local timelock.
    address public immutable localTimelock;

    event MarketDeployed(
        Types.VersionWithAlternative _cometExtVersion,
        Types.VersionWithAlternative _cometVersion,
        address _comet,
        address _cometExt,
        address _cometProxy,
        address _deployer
    );

    error OnlyDeveloperOrGovernor();

    constructor(
        IBytecodeProvider _bytecodeProvider,
        address _cometProxyAdmin,
        address _assetListFactory,
        address _localTimelock
    ) BaseFactory(_bytecodeProvider) {
        cometProxyAdmin = _cometProxyAdmin;
        assetListFactory = _assetListFactory;
        localTimelock = _localTimelock;
    }

    /// @notice Validates that the caller is developer or governor.
    /// @dev The role is checked through the VersionController.
    modifier onlyDeveloperOrGovernor() {
        if (!bytecodeProvider.isDeveloper(msg.sender) && msg.sender != localTimelock) revert OnlyDeveloperOrGovernor();
        _;
    }

    /* Deploy functions */

    /// @notice Deploys CometExtWithAssetList, CometWithAssetList and Comet Proxy with specified version and parameters.
    /// @dev Uses stored Comet Proxy Admin and Asset List Factory addresses. Always deploys extended asset list variants.
    /// @param _cometExtVersion Version of CometExtWithAssetList to deploy.
    /// @param _cometVersion Version of CometWithAssetList to deploy.
    /// @param _extParams CometExtWithAssetList constructor arguments.
    /// @param _params CometWithAssetList constructor arguments.
    /// @param _salt Parameter necessary for deployment via Create2.
    /// @return Addresses of deployed CometExtWithAssetList, CometWithAssetList and Comet Proxy.
    function deployComet(
        Types.VersionWithAlternative calldata _cometExtVersion,
        Types.VersionWithAlternative calldata _cometVersion,
        ExtConfiguration calldata _extParams,
        Configuration memory _params,
        bytes32 _salt
    ) external onlyDeveloperOrGovernor returns (address, address, address) {
        // Deploy CometExtWithAssetList
        address cometExt = _deployContractType(
            Types.BytecodeVersion(COMET_EXT_ASSET_LIST_CT, _cometExtVersion),
            abi.encode(_extParams, assetListFactory),
            _salt
        );
        _params.extensionDelegate = cometExt;
        // Deploy CometWithAssetList
        address comet = _deployContractType(
            Types.BytecodeVersion(COMET_ASSET_LIST_CT, _cometVersion),
            abi.encode(_params),
            addressToBytes32(cometExt)
        );
        // Deploy Proxy
        address cometProxy = _deployContract(
            abi.encodePacked(type(TransparentUpgradeableProxy).creationCode, abi.encode(comet, cometProxyAdmin, "")),
            addressToBytes32(comet)
        );

        emit MarketDeployed(_cometExtVersion, _cometVersion, comet, cometExt, cometProxy, msg.sender);
        return (cometExt, comet, cometProxy);
    }

    /* View functions */

    /// @notice Computes a pre-deployed addresses of CometExtWithAssetList, CometWithAssetList and Comet Proxy.
    /// @param _cometExtVersion Version of CometExtWithAssetList to deploy.
    /// @param _cometVersion Version of CometWithAssetList to deploy.
    /// @param _extParams CometExtWithAssetList constructor arguments.
    /// @param _params CometWithAssetList constructor arguments.
    /// @param _salt Parameter necessary for deployment via Create2.
    /// @param _deployer Address of deployer. Necessary for unique salt generation.
    /// @return Computed addresses of pre-deployed CometExtWithAssetList, CometWithAssetList and Comet Proxy.
    function computeCometAddresses(
        Types.VersionWithAlternative calldata _cometExtVersion,
        Types.VersionWithAlternative calldata _cometVersion,
        ExtConfiguration calldata _extParams,
        Configuration memory _params,
        bytes32 _salt,
        address _deployer
    ) external view returns (address, address, address) {
        // Compute CometExtWithAssetList address
        address cometExt = _computeContractTypeAddress(
            Types.BytecodeVersion(COMET_EXT_ASSET_LIST_CT, _cometExtVersion),
            abi.encode(_extParams, assetListFactory),
            _salt,
            _deployer
        );
        _params.extensionDelegate = cometExt;
        // Compute CometWithAssetList address
        address comet = _computeContractTypeAddress(
            Types.BytecodeVersion(COMET_ASSET_LIST_CT, _cometVersion),
            abi.encode(_params),
            addressToBytes32(cometExt),
            _deployer
        );
        // Compute Proxy address
        address cometProxy = _computeContractAddress(
            abi.encodePacked(type(TransparentUpgradeableProxy).creationCode, abi.encode(comet, cometProxyAdmin, "")),
            addressToBytes32(comet),
            _deployer
        );

        return (cometExt, comet, cometProxy);
    }
}
