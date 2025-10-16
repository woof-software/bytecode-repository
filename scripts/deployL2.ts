/**
 * BytecodeRepository L2 Deployment Script (PRODUCTION ONLY)
 *
 * Deploys the complete L2 BytecodeRepository system with network-specific configurations
 * on production L2 networks.
 *
 * Architecture:
 * 1. L2DeployManager - CCIP receiver and bytecode storage on L2
 * 2. MarketFactory - Factory for deploying Comet markets with proxy pattern
 * 3. CometFactoryV2 - Factory for deploying Compound V3 Comet implementations
 *
 * Network Configuration:
 * - Automatically detects network and loads appropriate configuration
 * - Supports custom address override via CLI arguments
 * - Validates all required addresses before deployment
 *
 * Supported Production Networks:
 * - Arbitrum One, Optimism, Polygon, Base
 * - Linea, Ronin, Unichain, Mantle, Scroll
 *
 * Usage:
 * ```bash
 * # Deploy with network-specific config
 * npx hardhat run scripts/deployL2.ts --network arbitrum
 * npx hardhat run scripts/deployL2.ts --network optimism
 * npx hardhat run scripts/deployL2.ts --network polygon
 *
 * # Deploy with custom addresses
 * npx hardhat run scripts/deployL2.ts --network arbitrum -- --timelock 0x123... --ccip-router 0x456...
 * ```
 *
 * NOTE: This script is designed for PRODUCTION deployment on L2 mainnets only.
 */

import hre from "hardhat";
import { ethers } from "hardhat";
import { DeploymentManager, logDeploymentStep, waitForConfirmations } from "./utils/deployment";
import { getNetworkConfig, validateNetworkConfig, NetworkConfig } from "./config/networkConfig";

// Contract deployment configuration
interface L2DeploymentConfig {
    // Network-specific addresses (from networkConfig.ts)
    ccipRouter: string;
    sourceChainSelector: string; // CCIP chain selector for L1 source chain
    timelock: string;
    cometProxyAdmin: string;
    assetListFactory: string;
    l1DeployManager: string;

    // Contract configuration
    initialVersion: {
        version: {
            major: bigint;
            minor: bigint;
            patch: bigint;
        };
        alternative: string;
    };
    withAssetList: boolean;
}

/**
 * Parse CLI arguments for custom address overrides
 */
function parseCliArgs(): Partial<NetworkConfig> {
    const args = process.argv.slice(2);
    const overrides: Partial<NetworkConfig> = {};

    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        const value = args[i + 1];

        switch (key) {
            case "--timelock":
                overrides.timelock = value;
                break;
            case "--ccip-router":
                overrides.ccipRouter = value;
                break;
            case "--comet-proxy-admin":
                overrides.cometProxyAdmin = value;
                break;
            case "--asset-list-factory":
                overrides.assetListFactory = value;
                break;
            case "--l1-deploy-manager":
                overrides.l1DeployManager = value;
                break;
        }
    }

    return overrides;
}

/**
 * Load and validate deployment configuration
 */
async function loadDeploymentConfig(): Promise<L2DeploymentConfig> {
    console.log("Loading deployment configuration...");

    // Get network info
    const network = await ethers.provider.getNetwork();
    const networkName = network.name;

    console.log(`Network: ${networkName} (Chain ID: ${network.chainId})`);

    // Load network config with CLI overrides
    let networkConfig = getNetworkConfig(networkName);
    const cliOverrides = parseCliArgs();

    if (Object.keys(cliOverrides).length > 0) {
        console.log("Applying CLI overrides:");
        Object.entries(cliOverrides).forEach(([key, value]) => {
            if (value) {
                console.log(`      ${key}: ${value}`);
                (networkConfig as any)[key] = value;
            }
        });
    }

    // Validate configuration
    try {
        validateNetworkConfig(networkConfig);
        console.log("Network configuration validated");
    } catch (error) {
        console.error("Configuration validation failed:", error);
        throw error;
    }

    // Create deployment config
    const config: L2DeploymentConfig = {
        ccipRouter: networkConfig.ccipRouter,
        sourceChainSelector: networkConfig.sourceChainSelector,
        timelock: networkConfig.timelock,
        cometProxyAdmin: networkConfig.cometProxyAdmin,
        assetListFactory: networkConfig.assetListFactory,
        l1DeployManager: networkConfig.l1DeployManager,
        initialVersion: {
            version: {
                major: 1n,
                minor: 0n,
                patch: 0n
            },
            alternative: ""
        },
        withAssetList: false // Set to true if extended asset list support is needed
    };

    console.log("      Deployment Configuration:");
    console.log(`      CCIP Router: ${config.ccipRouter}`);
    console.log(`      Source Chain Selector: ${config.sourceChainSelector}`);
    console.log(`      Timelock: ${config.timelock}`);
    console.log(`      Comet Proxy Admin: ${config.cometProxyAdmin}`);
    console.log(`      Asset List Factory: ${config.assetListFactory}`);
    console.log(`      L1 Deploy Manager: ${config.l1DeployManager}`);
    console.log(
        `      Initial Version: v${config.initialVersion.version.major}.${config.initialVersion.version.minor}.${config.initialVersion.version.patch}`
    );
    console.log(`      With Asset List: ${config.withAssetList}`);

    return config;
}

/**
 * Deploy L2DeployManager contract
 */
async function deployL2DeployManager(
    config: L2DeploymentConfig,
    deploymentManager: DeploymentManager
): Promise<string> {
    logDeploymentStep(1, 3, "Deploying L2DeployManager...");

    // Get contract factory
    const L2DeployManager = await ethers.getContractFactory("L2DeployManager");

    // Deploy contract (non-upgradeable)
    const l2DeployManager = await L2DeployManager.deploy(
        config.sourceChainSelector,
        config.l1DeployManager,
        config.ccipRouter,
        config.timelock
    );

    // Wait for deployment
    await l2DeployManager.waitForDeployment();
    const deploymentTx = l2DeployManager.deploymentTransaction();

    if (deploymentTx) {
        await waitForConfirmations(deploymentTx, 1, "L2DeployManager");

        // Save deployment artifact
        await deploymentManager.saveDeployment(
            "L2DeployManager",
            l2DeployManager,
            deploymentTx,
            [config.sourceChainSelector, config.l1DeployManager, config.ccipRouter, config.timelock],
            false // Non-upgradeable
        );
    }

    const address = await l2DeployManager.getAddress();
    console.log(`      L2DeployManager deployed: ${address}`);
    console.log(`      Source Chain Selector: ${config.sourceChainSelector}`);
    console.log(`      L1 Deploy Manager: ${config.l1DeployManager}`);
    console.log(`      CCIP Router: ${config.ccipRouter}`);
    console.log(`      Local Timelock: ${config.timelock}`);

    return address;
}

/**
 * Deploy MarketFactory contract
 */
async function deployMarketFactory(
    l2DeployManagerAddress: string,
    config: L2DeploymentConfig,
    deploymentManager: DeploymentManager
): Promise<string> {
    logDeploymentStep(2, 3, "Deploying MarketFactory...");

    // Get contract factory
    const MarketFactory = await ethers.getContractFactory("MarketFactory");

    // Deploy contract
    const marketFactory = await MarketFactory.deploy(
        l2DeployManagerAddress, // IBytecodeProvider
        config.cometProxyAdmin,
        config.assetListFactory,
        config.timelock
    );

    // Wait for deployment
    await marketFactory.waitForDeployment();
    const deploymentTx = marketFactory.deploymentTransaction();

    if (deploymentTx) {
        await waitForConfirmations(deploymentTx, 1, "MarketFactory");

        // Save deployment artifact
        await deploymentManager.saveDeployment(
            "MarketFactory",
            marketFactory,
            deploymentTx,
            [l2DeployManagerAddress, config.cometProxyAdmin, config.assetListFactory, config.timelock],
            false // Non-upgradeable
        );
    }

    const address = await marketFactory.getAddress();
    console.log(`      MarketFactory deployed: ${address}`);
    console.log(`      Bytecode Provider: ${l2DeployManagerAddress}`);
    console.log(`      Comet Proxy Admin: ${config.cometProxyAdmin}`);
    console.log(`      Asset List Factory: ${config.assetListFactory}`);

    return address;
}

/**
 * Deploy CometFactoryV2 contract
 */
async function deployCometFactoryV2(
    l2DeployManagerAddress: string,
    config: L2DeploymentConfig,
    deploymentManager: DeploymentManager
): Promise<string> {
    logDeploymentStep(3, 3, "Deploying CometFactoryV2...");

    // Get contract factory
    const CometFactoryV2 = await ethers.getContractFactory("CometFactoryV2");

    // Deploy contract with BigInt parameters
    const cometFactoryV2 = await CometFactoryV2.deploy(
        config.initialVersion,
        l2DeployManagerAddress, // IBytecodeProvider
        config.timelock,
        config.withAssetList
    );

    // Wait for deployment
    await cometFactoryV2.waitForDeployment();
    const deploymentTx = cometFactoryV2.deploymentTransaction();

    if (deploymentTx) {
        await waitForConfirmations(deploymentTx, 1, "CometFactoryV2");

        // Save deployment artifact (BigInt serialization will be handled automatically)
        await deploymentManager.saveDeployment(
            "CometFactoryV2",
            cometFactoryV2,
            deploymentTx,
            [config.initialVersion, l2DeployManagerAddress, config.timelock, config.withAssetList],
            false // Non-upgradeable
        );
    }

    const address = await cometFactoryV2.getAddress();
    console.log(`      CometFactoryV2 deployed: ${address}`);
    console.log(
        `      Initial Version: v${config.initialVersion.version.major}.${config.initialVersion.version.minor}.${config.initialVersion.version.patch}`
    );
    console.log(`      Bytecode Provider: ${l2DeployManagerAddress}`);
    console.log(`      Timelock: ${config.timelock}`);
    console.log(`      With Asset List: ${config.withAssetList}`);

    return address;
}

/**
 * Main deployment function
 */
async function main() {
    console.log("BYTECODE REPOSITORY L2 DEPLOYMENT");
    console.log("═".repeat(60));

    try {
        // Load configuration
        const config = await loadDeploymentConfig();

        // Initialize deployment manager
        const deploymentManager = await DeploymentManager.create();

        // Get deployer info
        const [deployer] = await ethers.getSigners();
        const balance = await ethers.provider.getBalance(deployer.address);

        console.log(`\\n Deployer: ${deployer.address}`);
        console.log(`    Balance: ${ethers.formatEther(balance)} ETH`);

        if (balance === 0n) {
            throw new Error("Deployer account has no Native Coin balance");
        }

        console.log("\\nSTARTING L2 DEPLOYMENTS");
        console.log("─".repeat(40));

        // Deploy contracts in dependency order
        const l2DeployManagerAddress = await deployL2DeployManager(config, deploymentManager);
        const marketFactoryAddress = await deployMarketFactory(l2DeployManagerAddress, config, deploymentManager);
        const cometFactoryV2Address = await deployCometFactoryV2(l2DeployManagerAddress, config, deploymentManager);

        // Save network summary
        const deployedContracts = {
            L2DeployManager: l2DeployManagerAddress,
            MarketFactory: marketFactoryAddress,
            CometFactoryV2: cometFactoryV2Address
        };

        deploymentManager.saveNetworkSummary(deployedContracts);

        // Generate deployment report
        console.log("\\n");
        deploymentManager.generateReport();

        console.log("\\n L2 DEPLOYMENT COMPLETED SUCCESSFULLY!");
        console.log("═".repeat(60));
        console.log("\\n NEXT STEPS:");
        console.log("1. Verify contracts on block explorer:");
        console.log("   npx hardhat verify --network <network> <CONTRACT_ADDRESS>");
        console.log("2. Configure cross-chain message approval on L1DeployManager");
        console.log("3. Test bytecode reception from L1 to L2");
        console.log("4. Upload and audit bytecode on L1 for cross-chain deployment");
    } catch (error) {
        console.error("\\n Deployment failed:", error);
        process.exit(1);
    }
}

// Execute deployment
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
