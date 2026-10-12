// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IAssetListStructs {
    struct ImmutableAssetConfig {
        address asset;
        uint8 decimals;
        address priceFeed;
    }
}
