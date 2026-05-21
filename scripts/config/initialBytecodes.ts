/**
 * Initial Bytecodes Configuration
 *
 * Defines the bytecodes to upload to VersionController as initial releases (v1.0.0)
 * after the first deployment of the BytecodeRepository system.
 *
 * Each entry specifies a contract type and how to load its bytecode:
 * - `artifactName`: loads from Hardhat compilation output (for contracts in this repo)
 * - `bytecodeFile`: loads from an external file (Hardhat/Foundry artifact JSON, custom JSON, or raw hex)
 * - `jsonKey`: optional key to extract from a JSON file (used with `bytecodeFile`)
 *
 * Source URLs are commit-pinned (`/blob/<commit-hash>/`) instead of branch-pinned
 * (`/blob/<branch>/`) so links keep resolving to the exact source even after new
 * commits land on the branch. The commit hash for each external bytecode is read
 * at load time from a companion `.commit` file placed next to the bytecode JSON
 * (e.g., `bytecodes/Comet/AssetList.json` → `bytecodes/Comet/AssetList.commit`).
 * It is never duplicated here. When a bytecode is refreshed, update only its
 * matching `.commit` file.
 *
 * To add a new entry, append to the INITIAL_BYTECODES array below.
 */

import fs from "fs";
import path from "path";

const REPO_BASE_URL = "https://github.com/woof-software/bytecode-repository/blob/main";

// External source repositories. The exact commit each bytecode was built from
// lives in a `.commit` file next to that bytecode's JSON artifact.
const COMET_REPO = "https://github.com/woof-software/comet";
const GOVERNANCE_REPO = "https://github.com/woof-software/compound-governance";
const STREAMER_REPO = "https://github.com/woof-software/streamer";
const CAPO_REPO = "https://github.com/woof-software/compound-capo";
const PRICEFEEDS_REPO = "https://github.com/woof-software/compound-pricefeeds";

/** Reads and validates the commit hash recorded in a `.commit` file. */
function readCommit(commitFile: string): string {
    const commitPath = path.resolve(process.cwd(), commitFile);
    const commit = fs.readFileSync(commitPath, "utf8").trim();
    if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
        throw new Error(`Invalid or missing commit hash in ${commitPath}: ${JSON.stringify(commit)}`);
    }
    return commit;
}

/**
 * Builds a commit-pinned GitHub source URL for an external bytecode. The commit
 * hash is read from the `.commit` file paired with the bytecode JSON
 * (`Foo.json` → `Foo.commit`).
 */
function pinnedSourceURL(repoBase: string, bytecodeFile: string, sourcePath: string): string {
    const commit = readCommit(bytecodeFile.replace(/\.json$/, ".commit"));
    return `${repoBase}/blob/${commit}/${sourcePath}`;
}

export interface InitialBytecodeEntry {
    /** Human-readable contract type name (max 31 chars, encoded to bytes32 on-chain) */
    contractType: string;
    /** Hardhat artifact name — bytecode is loaded via hre.artifacts.readArtifact(). Mutually exclusive with bytecodeFile. */
    artifactName?: string;
    /** Path to a bytecode file (Hardhat/Foundry artifact JSON, custom JSON, or raw .hex/.bin). Mutually exclusive with artifactName. */
    bytecodeFile?: string;
    /** Key to extract bytecode from a JSON file. Only used with bytecodeFile. */
    jsonKey?: string;
    /** URL to the source code repository / file that produced this bytecode */
    sourceURL: string;
}

/**
 * Initial bytecodes to upload after deployment.
 *
 * Core contracts use `artifactName` to load bytecode from this repo's compiled artifacts.
 * External contracts use `bytecodeFile` to load from a file path (relative to project root).
 */
export const INITIAL_BYTECODES: InitialBytecodeEntry[] = [
    // ── Core BytecodeRepository contracts (compiled from this repo) ──────────

    {
        contractType: "VersionController",
        artifactName: "VersionController",
        sourceURL: `${REPO_BASE_URL}/contracts/VersionController.sol`
    },
    {
        contractType: "L1DeployManager",
        artifactName: "L1DeployManager",
        sourceURL: `${REPO_BASE_URL}/contracts/L1DeployManager.sol`
    },
    {
        contractType: "L2DeployManager",
        artifactName: "L2DeployManager",
        sourceURL: `${REPO_BASE_URL}/contracts/L2DeployManager.sol`
    },
    {
        contractType: "CometFactoryV2",
        artifactName: "CometFactoryV2",
        sourceURL: `${REPO_BASE_URL}/contracts/factories/CometFactoryV2.sol`
    },
    {
        contractType: "MarketFactory",
        artifactName: "MarketFactory",
        sourceURL: `${REPO_BASE_URL}/contracts/factories/MarketFactory.sol`
    },

    // ── Comet Service Patch (woof-software/comet) ──────────
    {
        contractType: "CometWithAssetList",
        bytecodeFile: "bytecodes/Comet/CometWithExtendedAssetList.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/Comet/CometWithExtendedAssetList.json",
            "contracts/CometWithExtendedAssetList.sol"
        )
    },
    {
        contractType: "CometExtWithAssetList",
        bytecodeFile: "bytecodes/Comet/CometExtAssetList.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/Comet/CometExtAssetList.json",
            "contracts/CometExtAssetList.sol"
        )
    },
    {
        contractType: "AssetList",
        bytecodeFile: "bytecodes/Comet/AssetList.json",
        sourceURL: pinnedSourceURL(COMET_REPO, "bytecodes/Comet/AssetList.json", "contracts/AssetList.sol")
    },
    {
        contractType: "AssetListFactory",
        bytecodeFile: "bytecodes/Comet/AssetListFactory.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/Comet/AssetListFactory.json",
            "contracts/AssetListFactory.sol"
        )
    },

    // ── Bridge Receivers (woof-software/comet) ──────────
    {
        contractType: "ArbitrumBridgeReceiver",
        bytecodeFile: "bytecodes/BridgeReceivers/ArbitrumBridgeReceiver.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/BridgeReceivers/ArbitrumBridgeReceiver.json",
            "contracts/bridges/arbitrum/ArbitrumBridgeReceiver.sol"
        )
    },
    {
        contractType: "LineaBridgeReceiver",
        bytecodeFile: "bytecodes/BridgeReceivers/LineaBridgeReceiver.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/BridgeReceivers/LineaBridgeReceiver.json",
            "contracts/bridges/linea/LineaBridgeReceiver.sol"
        )
    },
    {
        contractType: "OptimismBridgeReceiver",
        bytecodeFile: "bytecodes/BridgeReceivers/OptimismBridgeReceiver.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/BridgeReceivers/OptimismBridgeReceiver.json",
            "contracts/bridges/optimism/OptimismBridgeReceiver.sol"
        )
    },
    {
        contractType: "PolygonBridgeReceiver",
        bytecodeFile: "bytecodes/BridgeReceivers/PolygonBridgeReceiver.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/BridgeReceivers/PolygonBridgeReceiver.json",
            "contracts/bridges/polygon/PolygonBridgeReceiver.sol"
        )
    },
    {
        contractType: "ScrollBridgeReceiver",
        bytecodeFile: "bytecodes/BridgeReceivers/ScrollBridgeReceiver.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/BridgeReceivers/ScrollBridgeReceiver.json",
            "contracts/bridges/scroll/ScrollBridgeReceiver.sol"
        )
    },

    // ── Comet Infrastructure (woof-software/comet) ──────────
    {
        contractType: "Configurator",
        bytecodeFile: "bytecodes/CometInfrastructure/Configurator.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/CometInfrastructure/Configurator.json",
            "contracts/Configurator.sol"
        )
    },
    {
        contractType: "ConfiguratorProxy",
        bytecodeFile: "bytecodes/CometInfrastructure/ConfiguratorProxy.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/CometInfrastructure/ConfiguratorProxy.json",
            "contracts/ConfiguratorProxy.sol"
        )
    },
    {
        contractType: "CometRewards",
        bytecodeFile: "bytecodes/CometInfrastructure/CometRewards.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/CometInfrastructure/CometRewards.json",
            "contracts/CometRewards.sol"
        )
    },
    {
        contractType: "CometProxyAdmin",
        bytecodeFile: "bytecodes/CometInfrastructure/CometProxyAdmin.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/CometInfrastructure/CometProxyAdmin.json",
            "contracts/CometProxyAdmin.sol"
        )
    },

    // ── Bulkers (woof-software/comet) ──────────
    {
        contractType: "MainnetBulker",
        bytecodeFile: "bytecodes/Bulkers/MainnetBulker.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/Bulkers/MainnetBulker.json",
            "contracts/bulkers/MainnetBulker.sol"
        )
    },
    {
        contractType: "MainnetBulkerWithWstETHSupport",
        bytecodeFile: "bytecodes/Bulkers/MainnetBulkerWithWstETHSupport.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/Bulkers/MainnetBulkerWithWstETHSupport.json",
            "contracts/bulkers/MainnetBulkerWithWstETHSupport.sol"
        )
    },

    // ── Governance (woof-software/compound-governance) ──────────
    {
        contractType: "Timelock",
        bytecodeFile: "bytecodes/Governance/Timelock.json",
        sourceURL: pinnedSourceURL(GOVERNANCE_REPO, "bytecodes/Governance/Timelock.json", "contracts/Timelock.sol")
    },
    {
        contractType: "CompoundGovernor",
        bytecodeFile: "bytecodes/Governance/CompoundGovernor.json",
        sourceURL: pinnedSourceURL(
            GOVERNANCE_REPO,
            "bytecodes/Governance/CompoundGovernor.json",
            "contracts/CompoundGovernor.sol"
        )
    },

    // ── Streamer (woof-software/streamer) ──────────
    {
        contractType: "Streamer",
        bytecodeFile: "bytecodes/Streamer/Streamer.json",
        sourceURL: pinnedSourceURL(STREAMER_REPO, "bytecodes/Streamer/Streamer.json", "contracts/Streamer.sol")
    },
    {
        contractType: "StreamerFactory",
        bytecodeFile: "bytecodes/Streamer/StreamerFactory.json",
        sourceURL: pinnedSourceURL(
            STREAMER_REPO,
            "bytecodes/Streamer/StreamerFactory.json",
            "contracts/StreamerFactory.sol"
        )
    },

    // ── CAPO (woof-software/compound-capo) ──────────
    {
        contractType: "ChainlinkCorrelatedPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/CAPO/ChainlinkCorrelatedAssetsPriceOracle.json",
        sourceURL: pinnedSourceURL(
            CAPO_REPO,
            "bytecodes/PriceFeeds/CAPO/ChainlinkCorrelatedAssetsPriceOracle.json",
            "contracts/ChainlinkCorrelatedAssetsPriceOracle.sol"
        )
    },
    {
        contractType: "ERC4626CorrelatedPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/CAPO/ERC4626CorrelatedAssetsPriceOracle.json",
        sourceURL: pinnedSourceURL(
            CAPO_REPO,
            "bytecodes/PriceFeeds/CAPO/ERC4626CorrelatedAssetsPriceOracle.json",
            "contracts/ERC4626CorrelatedAssetsPriceOracle.sol"
        )
    },
    {
        contractType: "RateBasedCorrelatedPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/CAPO/RateBasedCorrelatedAssetsPriceOracle.json",
        sourceURL: pinnedSourceURL(
            CAPO_REPO,
            "bytecodes/PriceFeeds/CAPO/RateBasedCorrelatedAssetsPriceOracle.json",
            "contracts/RateBasedCorrelatedAssetsPriceOracle.sol"
        )
    },
    {
        contractType: "RsETHCorrelatedPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/CAPO/RsETHCorrelatedAssetsPriceOracle.json",
        sourceURL: pinnedSourceURL(
            CAPO_REPO,
            "bytecodes/PriceFeeds/CAPO/RsETHCorrelatedAssetsPriceOracle.json",
            "contracts/RsETHCorrelatedAssetsPriceOracle.sol"
        )
    },
    {
        contractType: "WstETHCorrelatedPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/CAPO/WstETHCorrelatedAssetsPriceOracle.json",
        sourceURL: pinnedSourceURL(
            CAPO_REPO,
            "bytecodes/PriceFeeds/CAPO/WstETHCorrelatedAssetsPriceOracle.json",
            "contracts/WstETHCorrelatedAssetsPriceOracle.sol"
        )
    },

    // ── RETHCorrelatedAssetsPriceOracle (woof-software/compound-capo) ──────────
    {
        contractType: "RETHCorrelatedAssetsPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/RETHCorrelatedAssetsPriceOracle/RETHCorrelatedAssetsPriceOracle.json",
        sourceURL: pinnedSourceURL(
            CAPO_REPO,
            "bytecodes/PriceFeeds/RETHCorrelatedAssetsPriceOracle/RETHCorrelatedAssetsPriceOracle.json",
            "contracts/RETHCorrelatedAssetsPriceOracle.sol"
        )
    },

    // ── Comet Repo Feeds (woof-software/comet) ──────────
    {
        contractType: "ConstantPriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/ConstantPriceFeed.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/PriceFeeds/CometRepoFeeds/ConstantPriceFeed.json",
            "contracts/pricefeeds/ConstantPriceFeed.sol"
        )
    },
    {
        contractType: "EzETHExchangeRatePriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/EzETHExchangeRatePriceFeed.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/PriceFeeds/CometRepoFeeds/EzETHExchangeRatePriceFeed.json",
            "contracts/pricefeeds/EzETHExchangeRatePriceFeed.sol"
        )
    },
    {
        contractType: "MultiplicativePriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/MultiplicativePriceFeed.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/PriceFeeds/CometRepoFeeds/MultiplicativePriceFeed.json",
            "contracts/pricefeeds/MultiplicativePriceFeed.sol"
        )
    },
    {
        contractType: "PriceFeedWith4626Support",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/PriceFeedWith4626Support.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/PriceFeeds/CometRepoFeeds/PriceFeedWith4626Support.json",
            "contracts/pricefeeds/PriceFeedWith4626Support.sol"
        )
    },
    {
        contractType: "RateBasedScalingPriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/RateBasedScalingPriceFeed.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/PriceFeeds/CometRepoFeeds/RateBasedScalingPriceFeed.json",
            "contracts/pricefeeds/RateBasedScalingPriceFeed.sol"
        )
    },
    {
        contractType: "ReverseMultiplicativePriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/ReverseMultiplicativePriceFeed.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/PriceFeeds/CometRepoFeeds/ReverseMultiplicativePriceFeed.json",
            "contracts/pricefeeds/ReverseMultiplicativePriceFeed.sol"
        )
    },
    {
        contractType: "ScalingPriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/ScalingPriceFeed.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/PriceFeeds/CometRepoFeeds/ScalingPriceFeed.json",
            "contracts/pricefeeds/ScalingPriceFeed.sol"
        )
    },
    {
        contractType: "ScalingPriceFeedCustomDesc",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/ScalingPriceFeedWithCustomDescription.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/PriceFeeds/CometRepoFeeds/ScalingPriceFeedWithCustomDescription.json",
            "contracts/pricefeeds/ScalingPriceFeedWithCustomDescription.sol"
        )
    },
    {
        contractType: "WBTCPriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/WBTCPriceFeed.json",
        sourceURL: pinnedSourceURL(
            COMET_REPO,
            "bytecodes/PriceFeeds/CometRepoFeeds/WBTCPriceFeed.json",
            "contracts/pricefeeds/WBTCPriceFeed.sol"
        )
    },

    // ── MinMaxConstantPriceFeed (woof-software/compound-pricefeeds) ──────────
    {
        contractType: "MinMaxConstantPriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/MinMaxConstantPriceFeed/MinMaxConstantPriceFeed.json",
        sourceURL: pinnedSourceURL(
            PRICEFEEDS_REPO,
            "bytecodes/PriceFeeds/MinMaxConstantPriceFeed/MinMaxConstantPriceFeed.json",
            "contracts/MinMaxConstantPriceFeed.sol"
        )
    }

    // ── External contracts (loaded from bytecode files) ─────────────────────
    //
    // To add an external bytecode, place the artifact or hex file under bytecodes/,
    // record the source commit in a sibling `.commit` file (same basename, e.g.
    // `Foo.json` → `Foo.commit`), and add an entry whose sourceURL is built by
    // pinnedSourceURL(repoBase, bytecodeFile, sourcePath) — the commit is read
    // from the `.commit` file automatically:
    //
    // {
    //     contractType: "Streamer",
    //     bytecodeFile: "bytecodes/MyGroup/Streamer.json",
    //     sourceURL: pinnedSourceURL(
    //         "https://github.com/example/streamer",
    //         "bytecodes/MyGroup/Streamer.json",
    //         "contracts/Streamer.sol"
    //     )
    // },
    //
    // For custom JSON files where bytecode is not in a standard field, also set `jsonKey`.
];
