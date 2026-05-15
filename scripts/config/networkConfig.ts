/**
 * Network-specific configuration for L2 deployments
 *
 * This file contains all network-specific addresses needed for L2 contract deployments.
 * Each network configuration includes:
 * - CCIP Router address for cross-chain messaging
 * - Source Chain Selector: Ethereum Mainnet CCIP selector (5009297550715157269) - used in L2DeployManager
 * - Destination Chain Selector: This L2's CCIP selector - used in L1DeployManager setChainConfig
 * - Timelock address for governance (CometFactoryV2)
 * - CometProxyAdmin address for proxy management (MarketFactory)
 * - AssetListFactory address for asset list functionality (MarketFactory)
 * - L1DeployManager address from the source chain
 */

export interface NetworkConfig {
    name: string;
    chainId: number;
    ccipRouter: string;
    sourceChainSelector: string; // Ethereum Mainnet CCIP selector (5009297550715157269) - used in L2DeployManager
    destinationChainSelector: string; // This L2's CCIP selector - used in L1DeployManager setChainConfig
    timelock: string;
    cometProxyAdmin: string;
    assetListFactory: string;
    l1DeployManager: string;
}

export const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
    // Ethereum L2s - Production Mainnet
    arbitrum: {
        name: "arbitrum",
        chainId: 42161,
        ccipRouter: "0x141fa059441E0ca23ce184B6A78bafD2A517DdE8",
        sourceChainSelector: "5009297550715157269", // Ethereum Mainnet CCIP selector
        destinationChainSelector: "4949039107694359620", // Arbitrum One CCIP selector
        timelock: "0x3fB4d38ea7EC20D91917c09591490Eeda38Cf88A", // Arbitrum Timelock
        cometProxyAdmin: "0xD10b40fF1D92e2267D099Da3509253D9Da4D715e",
        assetListFactory: "0x17867848406f185CEc6ba91142b15086F7399D85",
        l1DeployManager: "0xC74CFD6BC85b6de0E8B42fac58c52ad3A478f62F" // Will be set from L1 deployment
    },

    optimism: {
        name: "optimism",
        chainId: 10,
        ccipRouter: "0x3206695CaE29952f4b0c22a169725a865bc8Ce0f",
        sourceChainSelector: "5009297550715157269", // Ethereum Mainnet CCIP selector
        destinationChainSelector: "3734403246176062136", // OP Mainnet CCIP selector
        timelock: "0xd98Be00b5D27fc98112BdE293e487f8D4cA57d07", // Optimism Timelock
        cometProxyAdmin: "0x24D86Da09C4Dd64e50dB7501b0f695d030f397aF",
        assetListFactory: "0x2f7439252Da796Ab9A93f7E478E70DED43Db5B89",
        l1DeployManager: "0xC74CFD6BC85b6de0E8B42fac58c52ad3A478f62F" // Will be set from L1 deployment
    },

    polygon: {
        name: "polygon",
        chainId: 137,
        ccipRouter: "0x849c5ED5a80F5B408Dd4969b78c2C8fdf0565Bfe",
        sourceChainSelector: "5009297550715157269", // Ethereum Mainnet CCIP selector
        destinationChainSelector: "4051577828743386545", // Polygon CCIP selector
        timelock: "0xCC3E7c85Bb0EE4f09380e041fee95a0caeDD4a02", // Polygon Timelock
        cometProxyAdmin: "0xd712ACe4ca490D4F3E92992Ecf3DE12251b975F9",
        assetListFactory: "0x62623C1374D12F946a9CA8597a137BbfBE015665",
        l1DeployManager: "0xC74CFD6BC85b6de0E8B42fac58c52ad3A478f62F" // Will be set from L1 deployment
    },

    base: {
        name: "base",
        chainId: 8453,
        ccipRouter: "0x881e3A65B4d4a04dD529061dd0071cf975F58bCD",
        sourceChainSelector: "5009297550715157269", // Ethereum Mainnet CCIP selector
        destinationChainSelector: "15971525489660198786", // Base CCIP selector
        timelock: "0xCC3E7c85Bb0EE4f09380e041fee95a0caeDD4a02", // Base Timelock
        cometProxyAdmin: "0xbdE8F31D2DdDA895264e27DD990faB3DC87b372d",
        assetListFactory: "0x995E394b8B2437aC8Ce61Ee0bC610D617962B214",
        l1DeployManager: "0xC74CFD6BC85b6de0E8B42fac58c52ad3A478f62F" // Will be set from L1 deployment
    },

    linea: {
        name: "linea",
        chainId: 59144,
        ccipRouter: "0x549FEB73F2348F6cD99b9fc8c69252034897f06C",
        sourceChainSelector: "5009297550715157269", // Ethereum Mainnet CCIP selector
        destinationChainSelector: "4627098889531055414", // Linea CCIP selector
        timelock: "0x4A900f81dEdA753bbBab12453b3775D5f26df6F3",
        cometProxyAdmin: "0x4b5DeE60531a72C1264319Ec6A22678a4D0C8118",
        assetListFactory: "0x2F4eAF29dfeeF4654bD091F7112926E108eF4Ed0",
        l1DeployManager: "0xC74CFD6BC85b6de0E8B42fac58c52ad3A478f62F" // Will be set from L1 deployment
    },

    unichain: {
        name: "unichain",
        chainId: 130,
        ccipRouter: "0x68891f5F96695ECd7dEdBE2289D1b73426ae7864",
        sourceChainSelector: "5009297550715157269", // Ethereum Mainnet CCIP selector
        destinationChainSelector: "1923510103922296319", // TUnichain CCIP selector
        timelock: "0x2F4eAF29dfeeF4654bD091F7112926E108eF4Ed0",
        cometProxyAdmin: "0xaeB318360f27748Acb200CE616E389A6C9409a07",
        assetListFactory: "0x4cfCE7795bF75dC3795369A953d9A9b8C2679AE4",
        l1DeployManager: "0xC74CFD6BC85b6de0E8B42fac58c52ad3A478f62F" // Will be set from L1 deployment
    },

    mantle: {
        name: "mantle",
        chainId: 5000,
        ccipRouter: "0x670052635a9850bb45882Cb2eCcF66bCff0F41B7",
        sourceChainSelector: "5009297550715157269", // Ethereum Mainnet CCIP selector
        destinationChainSelector: "1556008542357238666", // Mantle CCIP selector
        timelock: "0x16C7B5C1b10489F4B111af11de2Bd607c9728107", // Mantle Timelock
        cometProxyAdmin: "0xe268B436E75648aa0639e2088fa803feA517a0c7",
        assetListFactory: "0xB88e4078AAc88F10C0Ca71086ddCF512Ec54498a",
        l1DeployManager: "0xC74CFD6BC85b6de0E8B42fac58c52ad3A478f62F" // Will be set from L1 deployment
    },

    scroll: {
        name: "scroll",
        chainId: 534352,
        ccipRouter: "0x9a55E8Cab6564eb7bbd7124238932963B8Af71DC",
        sourceChainSelector: "5009297550715157269", // Ethereum Mainnet CCIP selector
        destinationChainSelector: "13204309965629103672", // Scroll CCIP selector
        timelock: "0xF6013e80E9e6AC211Cc031ad1CE98B3Aa20b73E4",
        cometProxyAdmin: "0x87A27b91f4130a25E9634d23A5B8E05e342bac50",
        assetListFactory: "0x5404872d8f2e24b230EC9B9eC64E3855F637FB93",
        l1DeployManager: "0xC74CFD6BC85b6de0E8B42fac58c52ad3A478f62F" // Will be set from L1 deployment
    }
};

/**
 * Get network configuration for deployment
 * @param networkName Name of the network (from hardhat network config)
 * @returns Network configuration object
 */
export function getNetworkConfig(networkName: string): NetworkConfig {
    const config = NETWORK_CONFIGS[networkName];
    if (!config) {
        throw new Error(
            `Network configuration not found for: ${networkName}. Available networks: ${Object.keys(NETWORK_CONFIGS).join(", ")}`
        );
    }
    return config;
}

/**
 * Validate that all required addresses are properly configured
 * @param config Network configuration to validate
 */
export function validateNetworkConfig(config: NetworkConfig): void {
    const requiredFields = ["ccipRouter", "timelock", "cometProxyAdmin", "assetListFactory"];
    const invalidFields = requiredFields.filter((field) => {
        const value = (config as any)[field];
        return !value || value === "0x1234567890123456789012345678901234567890";
    });

    if (invalidFields.length > 0) {
        throw new Error(
            `Invalid configuration for ${config.name}. Please update these placeholder addresses: ${invalidFields.join(", ")}`
        );
    }
}

/**
 * Set L1DeployManager address after L1 deployment
 * @param networkName Network to update
 * @param l1DeployManagerAddress Address from L1 deployment
 */
export function setL1DeployManagerAddress(networkName: string, l1DeployManagerAddress: string): void {
    if (!NETWORK_CONFIGS[networkName]) {
        throw new Error(`Network not found: ${networkName}`);
    }
    NETWORK_CONFIGS[networkName].l1DeployManager = l1DeployManagerAddress;
}

/**
 * Get all available production networks
 */
export function getAvailableNetworks(): string[] {
    return Object.keys(NETWORK_CONFIGS);
}
