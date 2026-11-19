// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IAssetListStructs {
    /// @dev The part of an asset config passed to the AssetList constructor. The asset decimals are read from the token.
    struct ImmutableAssetConfig {
        address asset;
        address priceFeed;
    }
}
