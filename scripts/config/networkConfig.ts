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
    sourceChainSelector: string; // CCIP chain selector for this L2 chain
    timelock: string;
    cometProxyAdmin: string;
    assetListFactory: string;
    l1DeployManager: string;
}

export const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
    // Ethereum L2s - Mainnet
    arbitrum: {
        name: "arbitrum",
        chainId: 42161,
        ccipRouter: "0x141fa059441e0ca23ce184b6a78ba4b7c0a30fb0",
        sourceChainSelector: "4949039107694359620", // Arbitrum One CCIP chain selector
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
        sourceChainSelector: "3734403246176062136", // OP Mainnet CCIP chain selector
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
        sourceChainSelector: "4051577828743386545", // Polygon CCIP chain selector
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
        sourceChainSelector: "15971525489660198786", // Base CCIP chain selector
        timelock: "0x4Abae72C27A82C1462fa58Ab9c34fe690e10fe72", // Base Timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Placeholder - replace with actual
        assetListFactory: "0x1234567890123456789012345678901234567890", // Placeholder - replace with actual
        l1DeployManager: "0x1234567890123456789012345678901234567890" // Will be set from L1 deployment
    },

    linea: {
        name: "linea",
        chainId: 59144,
        ccipRouter: "0x549F800f7C8a012C5501C011a85d20baBC51d845", // TODO: Verify actual router address
        sourceChainSelector: "4627098889531055414", // Linea CCIP chain selector
        timelock: "0x4Abae72C27A82C1462fa58Ab9c34fe690e10fe72", // Linea Timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Placeholder - replace with actual
        assetListFactory: "0x1234567890123456789012345678901234567890", // Placeholder - replace with actual
        l1DeployManager: "0x1234567890123456789012345678901234567890" // Will be set from L1 deployment
    },

    ronin: {
        name: "ronin",
        chainId: 2020,
        ccipRouter: "0x0000000000000000000000000000000000000000", // TODO: Add actual router address
        sourceChainSelector: "6916147374840168594", // Ronin CCIP chain selector
        timelock: "0x4Abae72C27A82C1462fa58Ab9c34fe690e10fe72", // Ronin Timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Placeholder - replace with actual
        assetListFactory: "0x1234567890123456789012345678901234567890", // Placeholder - replace with actual
        l1DeployManager: "0x1234567890123456789012345678901234567890" // Will be set from L1 deployment
    },

    unichain: {
        name: "unichain",
        chainId: 130,
        ccipRouter: "0x0000000000000000000000000000000000000000", // TODO: Add actual router address when available
        sourceChainSelector: "0", // TODO: Add actual CCIP chain selector when available
        timelock: "0x4Abae72C27A82C1462fa58Ab9c34fe690e10fe72", // Unichain Timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Placeholder - replace with actual
        assetListFactory: "0x1234567890123456789012345678901234567890", // Placeholder - replace with actual
        l1DeployManager: "0x1234567890123456789012345678901234567890" // Will be set from L1 deployment
    },

    mantle: {
        name: "mantle",
        chainId: 5000,
        ccipRouter: "0x0000000000000000000000000000000000000000", // TODO: Verify actual router address
        sourceChainSelector: "1556008542357238666", // Mantle CCIP chain selector
        timelock: "0x4Abae72C27A82C1462fa58Ab9c34fe690e10fe72", // Mantle Timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Placeholder - replace with actual
        assetListFactory: "0x1234567890123456789012345678901234567890", // Placeholder - replace with actual
        l1DeployManager: "0x1234567890123456789012345678901234567890" // Will be set from L1 deployment
    },

    scroll: {
        name: "scroll",
        chainId: 534352,
        ccipRouter: "0x0000000000000000000000000000000000000000", // TODO: Verify actual router address
        sourceChainSelector: "13204309965629103672", // Scroll CCIP chain selector
        timelock: "0x4Abae72C27A82C1462fa58Ab9c34fe690e10fe72", // Scroll Timelock
        cometProxyAdmin: "0x8c41E9f05b8BBcC844cF5E79c8B4A02e73c3D9C7", // Placeholder - replace with actual
        assetListFactory: "0x1234567890123456789012345678901234567890", // Placeholder - replace with actual
        l1DeployManager: "0x1234567890123456789012345678901234567890" // Will be set from L1 deployment
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
