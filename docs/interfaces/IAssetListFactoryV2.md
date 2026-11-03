# Solidity API

## IAssetListFactoryV2

### AssetListCreated

```solidity
event AssetListCreated(address assetList, struct IAssetListStructs.ImmutableAssetConfig[] assetConfigs)
```

### createAssetList

```solidity
function createAssetList(struct IAssetListStructs.ImmutableAssetConfig[] assetConfigs, address configurator) external returns (address assetList)
```

