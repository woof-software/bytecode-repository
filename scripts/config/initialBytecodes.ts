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
 * Source URLs are commit-pinned (`/commit/<hash>/`) instead of branch-pinned
 * (`/blob/<branch>/`) so links keep resolving to the exact source even after new
 * commits land on the branch. The commit hash is read at load time from the
 * `.commit` file inside each `bytecodes/<group>` subfolder — it is never
 * duplicated here. When bytecode is refreshed, update only the `.commit` file.
 *
 * To add a new entry, append to the INITIAL_BYTECODES array below.
 */

import fs from "fs";
import path from "path";

const REPO_BASE_URL = "https://github.com/woof-software/bytecode-repository/blob/main";

// External source repositories. The commit each bytecode was built from lives in
// the `.commit` file of the matching bytecodes/<group> subfolder (read below).
const COMET_REPO = "https://github.com/woof-software/comet";
const GOVERNANCE_REPO = "https://github.com/woof-software/compound-governance";
const STREAMER_REPO = "https://github.com/woof-software/streamer";
const CAPO_REPO = "https://github.com/woof-software/compound-capo";
const PRICEFEEDS_REPO = "https://github.com/woof-software/compound-pricefeeds";

/** Reads and validates the commit hash recorded in `<dir>/.commit`. */
function readCommit(dir: string): string {
    const commitPath = path.resolve(process.cwd(), dir, ".commit");
    const commit = fs.readFileSync(commitPath, "utf8").trim();
    if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
        throw new Error(`Invalid or missing commit hash in ${commitPath}: ${JSON.stringify(commit)}`);
    }
    return commit;
}

/**
 * Binds a source repo to a bytecode group folder, reading that folder's `.commit`
 * once. Returns a builder that produces a commit-pinned GitHub URL for a file
 * path within the source repo.
 */
function sourceGroup(repoBase: string, commitDir: string): (sourcePath: string) => string {
    const commit = readCommit(commitDir);
    return (sourcePath: string): string => `${repoBase}/blob/${commit}/${sourcePath}`;
}

// One builder per bytecode group; each reads the commit from its `.commit` file.
const cometServicePatch = sourceGroup(COMET_REPO, "bytecodes/Comet");
const bridgeReceiver = sourceGroup(COMET_REPO, "bytecodes/BridgeReceivers");
const cometInfra = sourceGroup(COMET_REPO, "bytecodes/CometInfrastructure");
const bulker = sourceGroup(COMET_REPO, "bytecodes/Bulkers");
const governance = sourceGroup(GOVERNANCE_REPO, "bytecodes/Governance");
const streamer = sourceGroup(STREAMER_REPO, "bytecodes/Streamer");
const capo = sourceGroup(CAPO_REPO, "bytecodes/PriceFeeds/CAPO");
const capoReth = sourceGroup(CAPO_REPO, "bytecodes/PriceFeeds/RETHCorrelatedAssetsPriceOracle");
const cometRepoFeed = sourceGroup(COMET_REPO, "bytecodes/PriceFeeds/CometRepoFeeds");
const minMaxConstant = sourceGroup(PRICEFEEDS_REPO, "bytecodes/PriceFeeds/MinMaxConstantPriceFeed");

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

    // ── Comet Service Patch (woof-software/comet, bytecodes/Comet/.commit) ──────────
    {
        contractType: "CometWithAssetList",
        bytecodeFile: "bytecodes/Comet/CometWithExtendedAssetList.json",
        sourceURL: cometServicePatch("contracts/CometWithExtendedAssetList.sol")
    },
    {
        contractType: "CometExtWithAssetList",
        bytecodeFile: "bytecodes/Comet/CometExtAssetList.json",
        sourceURL: cometServicePatch("contracts/CometExtAssetList.sol")
    },
    {
        contractType: "AssetList",
        bytecodeFile: "bytecodes/Comet/AssetList.json",
        sourceURL: cometServicePatch("contracts/AssetList.sol")
    },
    {
        contractType: "AssetListFactory",
        bytecodeFile: "bytecodes/Comet/AssetListFactory.json",
        sourceURL: cometServicePatch("contracts/AssetListFactory.sol")
    },
    {
        contractType: "CometFactoryWithAssetList",
        bytecodeFile: "bytecodes/Comet/CometFactoryWithExtendedAssetList.json",
        sourceURL: cometServicePatch("contracts/CometFactoryWithExtendedAssetList.sol")
    },

    // ── Bridge Receivers (woof-software/comet, bytecodes/BridgeReceivers/.commit) ──────────
    {
        contractType: "ArbitrumBridgeReceiver",
        bytecodeFile: "bytecodes/BridgeReceivers/ArbitrumBridgeReceiver.json",
        sourceURL: bridgeReceiver("contracts/bridges/arbitrum/ArbitrumBridgeReceiver.sol")
    },
    {
        contractType: "LineaBridgeReceiver",
        bytecodeFile: "bytecodes/BridgeReceivers/LineaBridgeReceiver.json",
        sourceURL: bridgeReceiver("contracts/bridges/linea/LineaBridgeReceiver.sol")
    },
    {
        contractType: "OptimismBridgeReceiver",
        bytecodeFile: "bytecodes/BridgeReceivers/OptimismBridgeReceiver.json",
        sourceURL: bridgeReceiver("contracts/bridges/optimism/OptimismBridgeReceiver.sol")
    },
    {
        contractType: "PolygonBridgeReceiver",
        bytecodeFile: "bytecodes/BridgeReceivers/PolygonBridgeReceiver.json",
        sourceURL: bridgeReceiver("contracts/bridges/polygon/PolygonBridgeReceiver.sol")
    },
    {
        contractType: "ScrollBridgeReceiver",
        bytecodeFile: "bytecodes/BridgeReceivers/ScrollBridgeReceiver.json",
        sourceURL: bridgeReceiver("contracts/bridges/scroll/ScrollBridgeReceiver.sol")
    },

    // ── Comet Infrastructure (woof-software/comet, bytecodes/CometInfrastructure/.commit) ──────────
    {
        contractType: "Configurator",
        bytecodeFile: "bytecodes/CometInfrastructure/Configurator.json",
        sourceURL: cometInfra("contracts/Configurator.sol")
    },
    {
        contractType: "ConfiguratorProxy",
        bytecodeFile: "bytecodes/CometInfrastructure/ConfiguratorProxy.json",
        sourceURL: cometInfra("contracts/ConfiguratorProxy.sol")
    },
    {
        contractType: "CometRewards",
        bytecodeFile: "bytecodes/CometInfrastructure/CometRewards.json",
        sourceURL: cometInfra("contracts/CometRewards.sol")
    },
    {
        contractType: "CometProxyAdmin",
        bytecodeFile: "bytecodes/CometInfrastructure/CometProxyAdmin.json",
        sourceURL: cometInfra("contracts/CometProxyAdmin.sol")
    },

    // ── Bulkers (woof-software/comet, bytecodes/Bulkers/.commit) ──────────
    {
        contractType: "MainnetBulker",
        bytecodeFile: "bytecodes/Bulkers/MainnetBulker.json",
        sourceURL: bulker("contracts/bulkers/MainnetBulker.sol")
    },
    {
        contractType: "MainnetBulkerWithWstETHSupport",
        bytecodeFile: "bytecodes/Bulkers/MainnetBulkerWithWstETHSupport.json",
        sourceURL: bulker("contracts/bulkers/MainnetBulkerWithWstETHSupport.sol")
    },

    // ── Governance (woof-software/compound-governance, bytecodes/Governance/.commit) ──────────
    {
        contractType: "Timelock",
        bytecodeFile: "bytecodes/Governance/Timelock.json",
        sourceURL: governance("contracts/Timelock.sol")
    },
    {
        contractType: "CompoundGovernor",
        bytecodeFile: "bytecodes/Governance/CompoundGovernor.json",
        sourceURL: governance("contracts/CompoundGovernor.sol")
    },

    // ── Streamer (woof-software/streamer, bytecodes/Streamer/.commit) ──────────
    {
        contractType: "Streamer",
        bytecodeFile: "bytecodes/Streamer/Streamer.json",
        sourceURL: streamer("contracts/Streamer.sol")
    },
    {
        contractType: "StreamerFactory",
        bytecodeFile: "bytecodes/Streamer/StreamerFactory.json",
        sourceURL: streamer("contracts/StreamerFactory.sol")
    },

    // ── CAPO (woof-software/compound-capo, bytecodes/PriceFeeds/CAPO/.commit) ──────────
    {
        contractType: "ChainlinkCorrelatedPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/CAPO/ChainlinkCorrelatedAssetsPriceOracle.json",
        sourceURL: capo("contracts/ChainlinkCorrelatedAssetsPriceOracle.sol")
    },
    {
        contractType: "ERC4626CorrelatedPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/CAPO/ERC4626CorrelatedAssetsPriceOracle.json",
        sourceURL: capo("contracts/ERC4626CorrelatedAssetsPriceOracle.sol")
    },
    {
        contractType: "RateBasedCorrelatedPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/CAPO/RateBasedCorrelatedAssetsPriceOracle.json",
        sourceURL: capo("contracts/RateBasedCorrelatedAssetsPriceOracle.sol")
    },
    {
        contractType: "RsETHCorrelatedPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/CAPO/RsETHCorrelatedAssetsPriceOracle.json",
        sourceURL: capo("contracts/RsETHCorrelatedAssetsPriceOracle.sol")
    },
    {
        contractType: "WstETHCorrelatedPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/CAPO/WstETHCorrelatedAssetsPriceOracle.json",
        sourceURL: capo("contracts/WstETHCorrelatedAssetsPriceOracle.sol")
    },

    // ── RETHCorrelatedAssetsPriceOracle (woof-software/compound-capo, bytecodes/PriceFeeds/RETHCorrelatedAssetsPriceOracle/.commit) ──────────
    {
        contractType: "RETHCorrelatedAssetsPriceOracle",
        bytecodeFile: "bytecodes/PriceFeeds/RETHCorrelatedAssetsPriceOracle/RETHCorrelatedAssetsPriceOracle.json",
        sourceURL: capoReth("contracts/RETHCorrelatedAssetsPriceOracle.sol")
    },

    // ── Comet Repo Feeds (woof-software/comet, bytecodes/PriceFeeds/CometRepoFeeds/.commit) ──────────
    {
        contractType: "ConstantPriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/ConstantPriceFeed.json",
        sourceURL: cometRepoFeed("contracts/pricefeeds/ConstantPriceFeed.sol")
    },
    {
        contractType: "EzETHExchangeRatePriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/EzETHExchangeRatePriceFeed.json",
        sourceURL: cometRepoFeed("contracts/pricefeeds/EzETHExchangeRatePriceFeed.sol")
    },
    {
        contractType: "MultiplicativePriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/MultiplicativePriceFeed.json",
        sourceURL: cometRepoFeed("contracts/pricefeeds/MultiplicativePriceFeed.sol")
    },
    {
        contractType: "PriceFeedWith4626Support",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/PriceFeedWith4626Support.json",
        sourceURL: cometRepoFeed("contracts/pricefeeds/PriceFeedWith4626Support.sol")
    },
    {
        contractType: "RateBasedScalingPriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/RateBasedScalingPriceFeed.json",
        sourceURL: cometRepoFeed("contracts/pricefeeds/RateBasedScalingPriceFeed.sol")
    },
    {
        contractType: "ReverseMultiplicativePriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/ReverseMultiplicativePriceFeed.json",
        sourceURL: cometRepoFeed("contracts/pricefeeds/ReverseMultiplicativePriceFeed.sol")
    },
    {
        contractType: "ScalingPriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/ScalingPriceFeed.json",
        sourceURL: cometRepoFeed("contracts/pricefeeds/ScalingPriceFeed.sol")
    },
    {
        contractType: "ScalingPriceFeedCustomDesc",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/ScalingPriceFeedWithCustomDescription.json",
        sourceURL: cometRepoFeed("contracts/pricefeeds/ScalingPriceFeedWithCustomDescription.sol")
    },
    {
        contractType: "WBTCPriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/CometRepoFeeds/WBTCPriceFeed.json",
        sourceURL: cometRepoFeed("contracts/pricefeeds/WBTCPriceFeed.sol")
    },

    // ── MinMaxConstantPriceFeed (woof-software/compound-pricefeeds, bytecodes/PriceFeeds/MinMaxConstantPriceFeed/.commit) ──────────
    {
        contractType: "MinMaxConstantPriceFeed",
        bytecodeFile: "bytecodes/PriceFeeds/MinMaxConstantPriceFeed/MinMaxConstantPriceFeed.json",
        sourceURL: minMaxConstant("contracts/MinMaxConstantPriceFeed.sol")
    }

    // ── External contracts (loaded from bytecode files) ─────────────────────
    //
    // To add an external bytecode, place the artifact or hex file under bytecodes/,
    // record the source commit in that group's bytecodes/<group>/.commit file, and
    // add an entry whose sourceURL is built by a sourceGroup() builder (declared
    // above) so the commit is read from .commit automatically:
    //
    // const myGroup = sourceGroup("https://github.com/example/streamer", "bytecodes/MyGroup");
    // {
    //     contractType: "Streamer",
    //     bytecodeFile: "bytecodes/MyGroup/Streamer.json",
    //     sourceURL: myGroup("contracts/Streamer.sol")
    // },
    //
    // For custom JSON files where bytecode is not in a standard field, also set `jsonKey`.
];
