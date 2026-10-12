// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ICometFactoryV2 } from "./ICometFactoryV2.sol";
import { IAssetListStructs } from "../integration/IAssetListStructs.sol";

interface IAssetListFactoryV2 is ICometFactoryV2 {
    event AssetListCreated(address indexed assetList, IAssetListStructs.ImmutableAssetConfig[] assetConfigs);

    function createAssetList(
        IAssetListStructs.ImmutableAssetConfig[] calldata assetConfigs
    ) external returns (address assetList);
}
