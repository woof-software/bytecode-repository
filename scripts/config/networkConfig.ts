/**
 * Network-specific configuration for L2 deployments
 *
 * This file contains all network-specific addresses needed for L2 contract deployments.
 * Each network configuration includes:
 * - CCIP Router address for cross-chain messaging
 * - Timelock address for governance (CometFactoryV2)
 * - CometProxyAdmin address for proxy management (MarketFactory)
 * - AssetListFactory address for asset list functionality (MarketFactory)
 * - L1DeployManager address from the source chain
 */

export interface NetworkConfig {
    name: string;
    chainId: number;
    ccipRouter: string;
    timelock: string;
    cometProxyAdmin: string;
    assetListFactory: string;
    l1DeployManager: string;
    isTestnet?: boolean;
}

export const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
    // Ethereum L2s
    arbitrum: {
        name: "arbitrum",
        chainId: 42161,
        ccipRouter: "0x141fa059441e0ca23ce184b6a78ba4b7c0a30fb0",
        timelock: "0x4Abae72C27A82C1462fa58Ab9c34fe690e10fe72", // Arbitrum Timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Placeholder - replace with actual
        assetListFactory: "0x1234567890123456789012345678901234567890", // Placeholder - replace with actual
        l1DeployManager: "0x1234567890123456789012345678901234567890", // Will be set from L1 deployment
        isTestnet: false
    },

    optimism: {
        name: "optimism",
        chainId: 10,
        ccipRouter: "0x3c3d92629a02a8d95d5cb9650fe49c3544f69b43",
        timelock: "0x4Abae72C27A82C1462fa58Ab9c34fe690e10fe72", // Optimism Timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Placeholder - replace with actual
        assetListFactory: "0x1234567890123456789012345678901234567890", // Placeholder - replace with actual
        l1DeployManager: "0x1234567890123456789012345678901234567890", // Will be set from L1 deployment
        isTestnet: false
    },

    polygon: {
        name: "polygon",
        chainId: 137,
        ccipRouter: "0x849c5ed5a80f5b408dd4caa5fe8c2b852aff67a9",
        timelock: "0x4Abae72C27A82C1462fa58Ab9c34fe690e10fe72", // Polygon Timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Placeholder - replace with actual
        assetListFactory: "0x1234567890123456789012345678901234567890", // Placeholder - replace with actual
        l1DeployManager: "0x1234567890123456789012345678901234567890", // Will be set from L1 deployment
        isTestnet: false
    },

    base: {
        name: "base",
        chainId: 8453,
        ccipRouter: "0x881e3a65b4d4a04dd529061dd0071cf975f58bcd",
        timelock: "0x4Abae72C27A82C1462fa58Ab9c34fe690e10fe72", // Base Timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Placeholder - replace with actual
        assetListFactory: "0x1234567890123456789012345678901234567890", // Placeholder - replace with actual
        l1DeployManager: "0x1234567890123456789012345678901234567890", // Will be set from L1 deployment
        isTestnet: false
    },

    // Testnets
    arbitrumSepolia: {
        name: "arbitrumSepolia",
        chainId: 421614,
        ccipRouter: "0x2a9c5aff799e3ae15fa8306a4c14c0fe4a67ed99",
        timelock: "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925", // Test timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Test proxy admin
        assetListFactory: "0x1234567890123456789012345678901234567890", // Test asset list factory
        l1DeployManager: "0x1234567890123456789012345678901234567890", // Will be set from L1 deployment
        isTestnet: true
    },

    optimismSepolia: {
        name: "optimismSepolia",
        chainId: 11155420,
        ccipRouter: "0x114a20a10b43d4115e5aeef7345a1a71d2a60c57",
        timelock: "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925", // Test timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Test proxy admin
        assetListFactory: "0x1234567890123456789012345678901234567890", // Test asset list factory
        l1DeployManager: "0x1234567890123456789012345678901234567890", // Will be set from L1 deployment
        isTestnet: true
    },

    polygonAmoy: {
        name: "polygonAmoy",
        chainId: 80002,
        ccipRouter: "0x9c32fcc5de2ce8d30ac582f89b5bd35e8a4b4bc5",
        timelock: "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925", // Test timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Test proxy admin
        assetListFactory: "0x1234567890123456789012345678901234567890", // Test asset list factory
        l1DeployManager: "0x1234567890123456789012345678901234567890", // Will be set from L1 deployment
        isTestnet: true
    },

    baseSepolia: {
        name: "baseSepolia",
        chainId: 84532,
        ccipRouter: "0xd0daae2231e9cb96b94c8512223533293c3693bf",
        timelock: "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925", // Test timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Test proxy admin
        assetListFactory: "0x1234567890123456789012345678901234567890", // Test asset list factory
        l1DeployManager: "0x1234567890123456789012345678901234567890", // Will be set from L1 deployment
        isTestnet: true
    },

    avalancheFuji: {
        name: "avalancheFuji",
        chainId: 43113,
        ccipRouter: "0xf694e193200268f9a4868e4aa017a0118c9a8177",
        timelock: "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925", // Test timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Test proxy admin
        assetListFactory: "0x1234567890123456789012345678901234567890", // Test asset list factory
        l1DeployManager: "0x1234567890123456789012345678901234567890", // Will be set from L1 deployment
        isTestnet: true
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
 * Get all available networks
 */
export function getAvailableNetworks(): string[] {
    return Object.keys(NETWORK_CONFIGS);
}

/**
 * Get testnet networks only
 */
export function getTestnetNetworks(): string[] {
    return Object.keys(NETWORK_CONFIGS).filter((name) => NETWORK_CONFIGS[name].isTestnet);
}

/**
 * Get mainnet networks only
 */
export function getMainnetNetworks(): string[] {
    return Object.keys(NETWORK_CONFIGS).filter((name) => !NETWORK_CONFIGS[name].isTestnet);
}
