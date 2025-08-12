pragma solidity 0.8.30;

import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { Types } from "../interfaces/Types.sol";
import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";
import { Configuration, ExtConfiguration } from "../integration/CometConfiguration.sol";
import { BaseFactory } from "./BaseFactory.sol";

contract MarketFactory is BaseFactory {
    /// @notice CometExt contract type.
    bytes32 public constant COMET_EXT_CT = "CometExt";
    /// @notice Comet contract type.
    bytes32 public constant COMET_CT = "Comet";
    /// @notice CometExt With AssetList contract type.
    bytes32 public constant COMET_EXT_ASSET_LIST_CT = "CometExtWithAssetList";
    /// @notice CometWithExtendedAssetList contract type.
    bytes32 public constant COMET_ASSET_LIST_CT = "CometWithAssetList";
    /// @notice Address of the CometProxyAdmin to use during deployment of all Comets.
    address public immutable cometProxyAdmin;
    /// @notice Address of the AssetListFactory to use during deployment of CometWithExtendedAssetList.
    address public immutable assetListFactory;

    constructor(
        IBytecodeProvider _bytecodeProvider,
        address _cometProxyAdmin,
        address _assetListFactory
    ) BaseFactory(_bytecodeProvider) {
        cometProxyAdmin = _cometProxyAdmin;
        assetListFactory = _assetListFactory;
    }

    /* Deploy functions */

    /// @notice Deploys CometExt, Comet and Comet Proxy with specified version and parameters.
    /// @dev Uses stored Comet Proxy Admin and Asset List Factory addresses.
    /// @param _cometExtVersion Version of CometExt to deploy.
    /// @param _cometVersion Version of Comet to deploy.
    /// @param _extParams CometExt constructor arguments.
    /// @param _params Comet constructor arguments.
    /// @param _salt Parameter necessary for deployment via Create2.
    /// @param _withAssetList Flag which indicates if implementations with Extended Asset List should be used.
    /// @return Addresses of deployed CometExt, Comet and Comet Proxy.
    function deployComet(
        Types.VersionWithAlternative calldata _cometExtVersion,
        Types.VersionWithAlternative calldata _cometVersion,
        ExtConfiguration calldata _extParams,
        Configuration memory _params,
        bytes32 _salt,
        bool _withAssetList
    ) external returns (address, address, address) {
        // Deploy CometExt
        address cometExt = _deployContractType(
            Types.BytecodeVersion(_withAssetList ? COMET_EXT_ASSET_LIST_CT : COMET_EXT_CT, _cometExtVersion),
            _withAssetList ? abi.encode(_extParams, assetListFactory) : abi.encode(_extParams),
            _salt
        );
        _params.extensionDelegate = cometExt;
        // Deploy Comet
        address comet = _deployContractType(
            Types.BytecodeVersion(_withAssetList ? COMET_ASSET_LIST_CT : COMET_CT, _cometVersion),
            abi.encode(_params),
            addressToBytes32(cometExt)
        );
        // Deploy Proxy
        address cometProxy = _deployContract(
            abi.encodePacked(type(TransparentUpgradeableProxy).creationCode, abi.encode(comet, cometProxyAdmin, "")),
            addressToBytes32(comet)
        );

        return (cometExt, comet, cometProxy);
    }

    /* View functions */

    /// @notice Computes a pre-deployed addresses of CometExt, Comet and Comet Proxy.
    /// @param _cometExtVersion Version of CometExt to deploy.
    /// @param _cometVersion Version of Comet to deploy.
    /// @param _extParams CometExt constructor arguments.
    /// @param _params Comet constructor arguments.
    /// @param _salt Parameter necessary for deployment via Create2.
    /// @param _deployer Address of deployer. Necessary for unique salt generation.
    /// @param _withAssetList Flag which indicates if implementations with Extended Asset List should be used.
    /// @return Computed addresses of pre-deployed CometExt, Comet and Comet Proxy.
    function computeCometAddresses(
        Types.VersionWithAlternative calldata _cometExtVersion,
        Types.VersionWithAlternative calldata _cometVersion,
        ExtConfiguration calldata _extParams,
        Configuration memory _params,
        bytes32 _salt,
        address _deployer,
        bool _withAssetList
    ) external view returns (address, address, address) {
        // Compute CometExt address
        address cometExt = _computeContractTypeAddress(
            Types.BytecodeVersion(_withAssetList ? COMET_EXT_ASSET_LIST_CT : COMET_EXT_CT, _cometExtVersion),
            _withAssetList ? abi.encode(_extParams, assetListFactory) : abi.encode(_extParams),
            _salt,
            _deployer
        );
        _params.extensionDelegate = cometExt;
        // Compute Comet address
        address comet = _computeContractTypeAddress(
            Types.BytecodeVersion(_withAssetList ? COMET_ASSET_LIST_CT : COMET_CT, _cometVersion),
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
