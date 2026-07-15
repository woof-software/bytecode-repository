import { ethers } from "hardhat";
import { DeploymentManager, waitForConfirmations, logDeploymentStep } from "./utils/deployment";

/**
 * Lightweight Deployment Script for BytecodeRepository System (TEST DEPLOYMENTS)
 *
 * This script deploys a slimmed-down stack intended for test deployments:
 * - LightVersionController (non-upgradeable) — stores versioned bytecode, assigns developers and
 *   deploys via CREATE2. No sub developers, no contract type registration, no cooldowns, no auditor
 *   verification.
 * - CometFactoryV2 (non-upgradeable) — wired to use the LightVersionController as its IBytecodeProvider.
 *
 * Configuration (env overrides, otherwise the deployer is used):
 * - LIGHT_ADMIN_ADDRESS: receives DEFAULT_ADMIN_ROLE on LightVersionController (assigns developers).
 * - LIGHT_TIMELOCK_ADDRESS: the timelock that can call CometFactoryV2.setVersion().
 *
 * Usage:
 * ```bash
 * npx hardhat run scripts/deployLight.ts --network <network>
 * ```
 */

async function main() {
    console.log("Starting Light BytecodeRepository deployment...\n");

    // Initialize deployment manager
    const deploymentManager = await DeploymentManager.create();

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    // Admin assigns developers on LightVersionController; timelock controls CometFactoryV2 version.
    // Both default to the deployer for convenient test deployments.
    const adminAddress = deployer.address;
    const timelockAddress = deployer.address;

    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
    console.log("Network:", network.name, "| Chain ID:", network.chainId.toString());
    console.log("Configuration:");
    console.log("Admin:", adminAddress);
    console.log("Timelock:", timelockAddress);
    console.log("");

    const deployedContracts: Record<string, string> = {};

    try {
        // 1. Deploy LightVersionController (non-upgradeable)
        logDeploymentStep(1, 2, "Deploying LightVersionController...");
        const LightVersionController = await ethers.getContractFactory("LightVersionController");

        const lightVersionControllerArgs = [adminAddress];

        console.log("Deploying contract...");
        const lightVersionController = await LightVersionController.deploy(...lightVersionControllerArgs);

        await lightVersionController.waitForDeployment();
        const lightVersionControllerTx = lightVersionController.deploymentTransaction();
        if (lightVersionControllerTx) {
            await waitForConfirmations(lightVersionControllerTx, 1, "LightVersionController");
        }

        const lightVersionControllerAddress = await lightVersionController.getAddress();
        deployedContracts.LightVersionController = lightVersionControllerAddress;

        await deploymentManager.saveDeployment(
            "LightVersionController",
            lightVersionController,
            lightVersionControllerTx,
            lightVersionControllerArgs,
            false // isUpgradeable
        );

        console.log("LightVersionController:", lightVersionControllerAddress);
        console.log("");

        // 3. Save network summary and generate report
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
    void main();
}

export default main;
