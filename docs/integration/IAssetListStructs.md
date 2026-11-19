# Solidity API

## IAssetListStructs

### ImmutableAssetConfig

_The part of an asset config passed to the AssetList constructor. The asset decimals are read from the token._

```solidity
struct ImmutableAssetConfig {
  address asset;
  address priceFeed;
}
```

