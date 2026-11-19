# Solidity API

## IAssetListFactoryV2

### AssetListCreated

```solidity
event AssetListCreated(address assetList, struct IAssetListStructs.ImmutableAssetConfig[] assetConfigs)
```

### configurator

```solidity
function configurator() external view returns (address)
```

### createAssetList

```solidity
function createAssetList(struct IAssetListStructs.ImmutableAssetConfig[] assetConfigs) external returns (address assetList)
```

