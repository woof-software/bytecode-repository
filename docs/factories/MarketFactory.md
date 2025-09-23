# Solidity API

## MarketFactory

This factory contract orchestrates complex multi-contract Comet market deployments with automatic dependency resolution and proxy pattern integration.
- The contract deploys complete Comet markets consisting of CometExt (extension), Comet (implementation), and TransparentUpgradeableProxy in a single transaction.
- Automatic dependency injection sets extension delegate addresses and manages inter-contract relationships during deployment for fully configured markets.
- Deploys extended asset list variants (CometExtWithAssetList/CometWithAssetList) for enhanced collateral capacity and asset management.
- Integration with OpenZeppelin's TransparentUpgradeableProxy pattern provides upgradeable market implementations while maintaining security and governance controls.
- Address pre-computation enables predictable market addresses before deployment for integration planning and cross-chain coordination.
- The contract utilizes immutable dependencies for CometProxyAdmin and AssetListFactory, ensuring consistent upgrade authority and asset list management across deployments.
- Anyone is able to:
  1. Deploy complete Comet markets with CometExt, Comet implementation, and upgradeable proxy in a coordinated three-contract deployment.
  2. Deploy markets with extended asset list support for enhanced collateral management and scalability.
  3. Compute all three contract addresses before deployment for integration planning and verification purposes.
  4. Deploy markets with custom configurations including interest rate models, governance parameters, and collateral asset specifications.
- The contract automatically handles:
  1. Sequential deployment of CometExt with appropriate constructor parameters and asset list factory integration when required.
  2. Dependency injection by setting the deployed CometExt address as extensionDelegate in the Comet configuration before deployment.
  3. Comet implementation deployment with updated configuration containing correct extension delegate and protocol parameters.
  4. TransparentUpgradeableProxy deployment pointing to the Comet implementation with configured proxy admin for upgrade authority.
  5. Salt derivation using address-based salts for deterministic yet unique deployment addresses across related contracts.
- Extended asset list support is built-in, automatically deploying CometExtWithAssetList and CometWithAssetList contract variants for all markets.
- Asset list factory integration provides enhanced collateral management for markets requiring support for numerous or dynamic asset lists.
- The factory maintains full compatibility with Compound V3 governance patterns while adding BytecodeRepository audit verification and multi-chain deployment capabilities.
- Proxy admin integration ensures proper upgrade authority while maintaining security boundaries between market implementations and governance controls.

### COMET_EXT_ASSET_LIST_CT

```solidity
bytes32 COMET_EXT_ASSET_LIST_CT
```

CometExt With AssetList contract type.

### COMET_ASSET_LIST_CT

```solidity
bytes32 COMET_ASSET_LIST_CT
```

CometWithExtendedAssetList contract type.

### cometProxyAdmin

```solidity
address cometProxyAdmin
```

Address of the CometProxyAdmin to use during deployment of all Comets.

### assetListFactory

```solidity
address assetListFactory
```

Address of the AssetListFactory to use during deployment of CometWithExtendedAssetList.

### localTimelock

```solidity
address localTimelock
```

The address of local timelock.

### MarketDeployed

```solidity
event MarketDeployed(struct Types.VersionWithAlternative _cometExtVersion, struct Types.VersionWithAlternative _cometVersion, address _comet, address _cometExt, address _cometProxy, address _deployer)
```

### OnlyDeveloperOrGovernor

```solidity
error OnlyDeveloperOrGovernor()
```

### constructor

```solidity
constructor(contract IBytecodeProvider _bytecodeProvider, address _cometProxyAdmin, address _assetListFactory, address _localTimelock) public
```

### onlyDeveloperOrGovernor

```solidity
modifier onlyDeveloperOrGovernor()
```

Validates that the caller is developer or governor.

_The role is checked through the VersionController._

### deployComet

```solidity
function deployComet(struct Types.VersionWithAlternative _cometExtVersion, struct Types.VersionWithAlternative _cometVersion, struct ExtConfiguration _extParams, struct Configuration _params, bytes32 _salt) external returns (address, address, address)
```

Deploys CometExtWithAssetList, CometWithAssetList and Comet Proxy with specified version and parameters.

_Uses stored Comet Proxy Admin and Asset List Factory addresses. Always deploys extended asset list variants._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _cometExtVersion | struct Types.VersionWithAlternative | Version of CometExtWithAssetList to deploy. |
| _cometVersion | struct Types.VersionWithAlternative | Version of CometWithAssetList to deploy. |
| _extParams | struct ExtConfiguration | CometExtWithAssetList constructor arguments. |
| _params | struct Configuration | CometWithAssetList constructor arguments. |
| _salt | bytes32 | Parameter necessary for deployment via Create2. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Addresses of deployed CometExtWithAssetList, CometWithAssetList and Comet Proxy. |
| [1] | address |  |
| [2] | address |  |

### computeCometAddresses

```solidity
function computeCometAddresses(struct Types.VersionWithAlternative _cometExtVersion, struct Types.VersionWithAlternative _cometVersion, struct ExtConfiguration _extParams, struct Configuration _params, bytes32 _salt, address _deployer) external view returns (address, address, address)
```

Computes a pre-deployed addresses of CometExtWithAssetList, CometWithAssetList and Comet Proxy.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _cometExtVersion | struct Types.VersionWithAlternative | Version of CometExtWithAssetList to deploy. |
| _cometVersion | struct Types.VersionWithAlternative | Version of CometWithAssetList to deploy. |
| _extParams | struct ExtConfiguration | CometExtWithAssetList constructor arguments. |
| _params | struct Configuration | CometWithAssetList constructor arguments. |
| _salt | bytes32 | Parameter necessary for deployment via Create2. |
| _deployer | address | Address of deployer. Necessary for unique salt generation. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Computed addresses of pre-deployed CometExtWithAssetList, CometWithAssetList and Comet Proxy. |
| [1] | address |  |
| [2] | address |  |

