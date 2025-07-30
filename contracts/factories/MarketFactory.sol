pragma solidity 0.8.30;

import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { IVersionController } from "../interfaces/IVersionController.sol";
import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";
import { Configuration, ExtConfiguration } from "../integration/CometConfiguration.sol";
import { BaseFactory } from "./BaseFactory.sol";

contract MarketFactory is BaseFactory {
    bytes32 public constant COMET_EXT_CT = "CometExt";
    bytes32 public constant COMET_CT = "Comet";
    bytes32 public constant COMET_EXT_ASSET_LIST_CT = "CometExtWithAssetList";
    bytes32 public constant COMET_ASSET_LIST_CT = "CometWithAssetList";
    address public immutable cometProxyAdmin;
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

    function deployComet(
        IVersionController.VersionWithAlternative calldata _cometExtVersion,
        IVersionController.VersionWithAlternative calldata _cometVersion,
        ExtConfiguration calldata _extParams,
        Configuration memory _params,
        bytes32 _salt,
        bool withAssetList
    ) external returns (address, address, address) {
        // Deploy CometExt
        address cometExt = _deployContractType(
            IVersionController.BytecodeVersion(
                withAssetList ? COMET_EXT_ASSET_LIST_CT : COMET_EXT_CT,
                _cometExtVersion
            ),
            withAssetList ? abi.encode(_extParams, assetListFactory) : abi.encode(_extParams),
            _salt
        );
        _params.extensionDelegate = cometExt;
        // Deploy Comet
        address comet = _deployContractType(
            IVersionController.BytecodeVersion(withAssetList ? COMET_ASSET_LIST_CT : COMET_CT, _cometVersion),
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

    function computeCometAddresses(
        IVersionController.VersionWithAlternative calldata _cometExtVersion,
        IVersionController.VersionWithAlternative calldata _cometVersion,
        ExtConfiguration calldata _extParams,
        Configuration memory _params,
        bytes32 _salt,
        address _deployer,
        bool withAssetList
    ) external view returns (address, address, address) {
        // Compute CometExt address
        address cometExt = _computeContractTypeAddress(
            IVersionController.BytecodeVersion(
                withAssetList ? COMET_EXT_ASSET_LIST_CT : COMET_EXT_CT,
                _cometExtVersion
            ),
            withAssetList ? abi.encode(_extParams, assetListFactory) : abi.encode(_extParams),
            _salt,
            _deployer
        );
        _params.extensionDelegate = cometExt;
        // Compute Comet address
        address comet = _computeContractTypeAddress(
            IVersionController.BytecodeVersion(withAssetList ? COMET_ASSET_LIST_CT : COMET_CT, _cometVersion),
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
