import hre from "hardhat";
import { ethers, upgrades } from "hardhat";
import { DeploymentManager, waitForConfirmations, logDeploymentStep } from "./utils/deployment";

/**
 * L1 Deployment Script for BytecodeRepository System (PRODUCTION ONLY)
 *
 * This script deploys the core L1 smart contracts on Ethereum Mainnet:
 * - VersionController (upgradeable UUPS proxy)
 * - L1DeployManager (upgradeable UUPS proxy)
 * - MarketFactory (non-upgradeable)
 * - CometFactoryV2 (non-upgradeable)
 *
 * Production Configuration:
 * - Governor: 0x6d903f6003cca6255D85CcA4D3B5E5146dC33925 (Ethereum Mainnet Timelock)
 * - Guardian: 0x7d903f6003cca6255D85CcA4D3B5E5146dC33926 (Guardian for cooldown resets)
 * - CCIP Router: 0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D (Ethereum Mainnet CCIP Router)
 *
 * Usage:
 * ```bash
 * npx hardhat run scripts/deployL1.ts --network mainnet
 * ```
 *
 * NOTE: This script is designed for PRODUCTION deployment on Ethereum Mainnet only.
 */

// Configuration
const GOVERNOR_ADDRESS = "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925"; // Address of timelock on Ethereum
const GUARDIAN_ADDRESS = "0xbbf3f1421D886E9b2c5D716B5192aC998af2012c"; // Guardian address for resetCooldown functionality
const CCIP_ROUTER_ADDRESS = "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D";

const COMET_PROXY_ADMIN = "0x1EC63B5883C3481134FD50D5DAebc83Ecd2E8779";
const ASSET_LIST_FACTORY = "0x3fF744cF6078714bB9d3c4fE5Ab37fA6d05dEC4E";

// Initial version for CometFactoryV2
const INITIAL_VERSION = {
    version: {
        major: 1n,
        minor: 0n,
        patch: 0n
    },
    alternative: ""
};

async function main() {
    console.log("Starting L1 BytecodeRepository deployment...\n");

    // Initialize deployment manager
    const deploymentManager = await DeploymentManager.create();

    const [deployer] = await ethers.getSigners();
    const initialAdmin = deployer.address;
    const network = await ethers.provider.getNetwork();

    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
    console.log("Network:", network.name, "| Chain ID:", network.chainId.toString());
    console.log("Configuration:");
    console.log("Initial Admin: ", initialAdmin);
    console.log("Governor:", GOVERNOR_ADDRESS);
    console.log("Guardian:", GUARDIAN_ADDRESS);
    console.log("CCIP Router:", CCIP_ROUTER_ADDRESS);
    console.log("");

    const deployedContracts: Record<string, string> = {};

    try {
        // 1. Deploy VersionController (upgradeable)
        logDeploymentStep(1, 4, "Deploying VersionController (upgradeable)...");
        const VersionController = await ethers.getContractFactory("VersionController");

        console.log("Deploying proxy and implementation...");
        const versionController = await upgrades.deployProxy(
            VersionController,
            [initialAdmin, GUARDIAN_ADDRESS], // initializer arguments
            {
                initializer: "initialize",
                kind: "uups"
            }
        );

        // Wait for deployment
        await versionController.waitForDeployment();
        const deploymentTx = versionController.deploymentTransaction();
        if (deploymentTx) {
            await waitForConfirmations(deploymentTx, 1, "VersionController");
        }

        const versionControllerAddress = await versionController.getAddress();
        deployedContracts.VersionController = versionControllerAddress;

        // Save deployment artifact
        await deploymentManager.saveDeployment(
            "VersionController",
            versionController,
            deploymentTx,
            [initialAdmin, GUARDIAN_ADDRESS],
            true // isUpgradeable
        );

        const versionControllerImplAddress = await upgrades.erc1967.getImplementationAddress(versionControllerAddress);
        console.log("VersionController Proxy:", versionControllerAddress);
        console.log("VersionController Implementation:", versionControllerImplAddress);

        // 2. Deploy L1DeployManager (upgradeable)
        logDeploymentStep(2, 4, "Deploying L1DeployManager (upgradeable)...");
        const L1DeployManager = await ethers.getContractFactory("L1DeployManager");

        console.log("Deploying proxy and implementation...");
        const l1DeployManager = await upgrades.deployProxy(
            L1DeployManager,
            [], // L1DeployManager.initialize() takes no parameters
            {
                initializer: "initialize",
                kind: "uups",
                constructorArgs: [versionControllerAddress, CCIP_ROUTER_ADDRESS] // Constructor arguments for immutable variables
            }
        );

        // Wait for deployment
        await l1DeployManager.waitForDeployment();
        const l1DeploymentTx = l1DeployManager.deploymentTransaction();
        if (l1DeploymentTx) {
            await waitForConfirmations(l1DeploymentTx, 1, "L1DeployManager");
        }

        const l1DeployManagerAddress = await l1DeployManager.getAddress();
        deployedContracts.L1DeployManager = l1DeployManagerAddress;

        // Save deployment artifact
        await deploymentManager.saveDeployment(
            "L1DeployManager",
            l1DeployManager,
            l1DeploymentTx,
            [versionControllerAddress, CCIP_ROUTER_ADDRESS],
            true // isUpgradeable
        );

        const l1DeployManagerImplAddress = await upgrades.erc1967.getImplementationAddress(l1DeployManagerAddress);
        console.log("L1DeployManager Proxy:", l1DeployManagerAddress);
        console.log("L1DeployManager Implementation:", l1DeployManagerImplAddress);
        console.log("");

        // 3. Deploy MarketFactory (non-upgradeable)
        logDeploymentStep(3, 4, "Deploying MarketFactory...");
        const MarketFactory = await ethers.getContractFactory("MarketFactory");

        const marketFactoryArgs = [
            versionControllerAddress, // bytecodeProvider
            COMET_PROXY_ADMIN, // cometProxyAdmin
            ASSET_LIST_FACTORY, // assetListFactory
            GOVERNOR_ADDRESS // timelock (using governor as timelock)
        ];

        console.log("Deploying contract...");
        const marketFactory = await MarketFactory.deploy(...marketFactoryArgs);

        // Wait for deployment
        await marketFactory.waitForDeployment();
        const marketFactoryTx = marketFactory.deploymentTransaction();
        if (marketFactoryTx) {
            await waitForConfirmations(marketFactoryTx, 1, "MarketFactory");
        }

        const marketFactoryAddress = await marketFactory.getAddress();
        deployedContracts.MarketFactory = marketFactoryAddress;

        // Save deployment artifact
        await deploymentManager.saveDeployment(
            "MarketFactory",
            marketFactory,
            marketFactoryTx,
            marketFactoryArgs,
            false // isUpgradeable
        );

        console.log("MarketFactory:", marketFactoryAddress);
        console.log("");

        // 4. Deploy CometFactoryV2 (non-upgradeable)
        logDeploymentStep(4, 4, "Deploying CometFactoryV2...");
        const CometFactoryV2 = await ethers.getContractFactory("CometFactoryV2");

        const cometFactoryArgs = [
            INITIAL_VERSION, // initialVersion
            versionControllerAddress, // bytecodeProvider
            GOVERNOR_ADDRESS, // timelock (using governor as timelock)
            false // withAssetList
        ];

        console.log("Deploying contract...");
        const cometFactoryV2 = await CometFactoryV2.deploy(...cometFactoryArgs);

        // Wait for deployment
        await cometFactoryV2.waitForDeployment();
        const cometFactoryTx = cometFactoryV2.deploymentTransaction();
        if (cometFactoryTx) {
            await waitForConfirmations(cometFactoryTx, 1, "CometFactoryV2");
        }

        const cometFactoryV2Address = await cometFactoryV2.getAddress();
        deployedContracts.CometFactoryV2 = cometFactoryV2Address;

        // Save deployment artifact
        await deploymentManager.saveDeployment(
            "CometFactoryV2",
            cometFactoryV2,
            cometFactoryTx,
            cometFactoryArgs,
            false // isUpgradeable
        );

        console.log("CometFactoryV2:", cometFactoryV2Address);
        console.log("");

        // 5. Save network summary and generate report
        console.log("Finalizing deployment...");
        deploymentManager.saveNetworkSummary(deployedContracts);
        deploymentManager.generateReport();

        console.log("🎉 Deployment completed successfully!");
        console.log("");
    } catch (error) {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});

if (require.main === module) {
    main();
}

export default main;
