import { ethers, upgrades } from "hardhat";
import { DeploymentManager, waitForConfirmations, logDeploymentStep, resolveDeploymentDir } from "./utils/deployment";

/**
 * Lightweight Deployment Script for BytecodeRepository System (TEST DEPLOYMENTS)
 *
 * This script deploys a slimmed-down stack intended for test deployments:
 * - LightVersionController (upgradeable UUPS proxy) — stores versioned bytecode, assigns developers and
 *   serves bytecode to the deploy manager. No sub developers, no contract type registration, no
 *   cooldowns, no auditor verification.
 * - L1DeployManager (upgradeable UUPS proxy) — deploys bytecode from the LightVersionController via
 *   CREATE2 and distributes it cross-chain via Chainlink CCIP. Uses the LightVersionController for its
 *   governor/developer role checks.
 *
 * Configuration:
 * - adminAddress: receives DEFAULT_ADMIN_ROLE on LightVersionController (assigns developers, upgrades,
 *   and acts as the L1DeployManager governor). Defaults to the deployer.
 * - CCIP_ROUTER_ADDRESS (env): Chainlink CCIP Router for the target network. Defaults to the Ethereum
 *   mainnet router; MUST be overridden when deploying to any other network.
 *   See https://docs.chain.link/ccip/directory for per-network router addresses.
 *
 * Usage:
 * ```bash
 * npx hardhat run scripts/deployLight.ts --network <network>
 * ```
 */

// Chainlink CCIP Router.
const CCIP_ROUTER_ADDRESS = "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D";

async function main() {
    console.log("Starting Light BytecodeRepository deployment...\n");

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    // Isolate this TEST deployment's artifacts in a dedicated directory so they never overwrite the
    // production records in deployments/<network>/. Defaults to the "light" label (deployments/
    // <network>-light/); override with DEPLOYMENT_LABEL. Upload/config scripts read the same directory
    // when run with the matching DEPLOYMENT_LABEL.
    const deploymentDir = resolveDeploymentDir(network.name, "light");
    const deploymentManager = new DeploymentManager(deploymentDir, Number(network.chainId));

    // Admin assigns developers on LightVersionController. Defaults to the deployer for test deployments.
    const adminAddress = deployer.address;

    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
    console.log("Network:", network.name, "| Chain ID:", network.chainId.toString());
    console.log("Configuration:");
    console.log("Admin:", adminAddress);
    console.log("CCIP Router:", CCIP_ROUTER_ADDRESS);
    console.log("Artifacts dir:", `deployments/${deploymentDir}/`);
    console.log("");

    const deployedContracts: Record<string, string> = {};

    try {
        // 1. Deploy LightVersionController (upgradeable UUPS proxy)
        logDeploymentStep(1, 2, "Deploying LightVersionController (upgradeable)...");
        const LightVersionController = await ethers.getContractFactory("LightVersionController");

        const initializerArgs = [adminAddress];

        console.log("Deploying proxy and implementation...");
        const lightVersionController = await upgrades.deployProxy(LightVersionController, initializerArgs, {
            initializer: "initialize",
            kind: "uups"
        });

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
            initializerArgs,
            true // isUpgradeable
        );

        const lightVersionControllerImplAddress =
            await upgrades.erc1967.getImplementationAddress(lightVersionControllerAddress);
        console.log("LightVersionController Proxy:", lightVersionControllerAddress);
        console.log("LightVersionController Implementation:", lightVersionControllerImplAddress);
        console.log("");

        // 2. Deploy L1DeployManager (upgradeable UUPS proxy) wired to the LightVersionController
        logDeploymentStep(2, 2, "Deploying L1DeployManager (upgradeable)...");
        const L1DeployManager = await ethers.getContractFactory("L1DeployManager");

        // versionController + CCIP router are immutables set via constructorArgs; initialize() takes none.
        const l1ConstructorArgs = [lightVersionControllerAddress, CCIP_ROUTER_ADDRESS];

        console.log("Deploying proxy and implementation...");
        const l1DeployManager = await upgrades.deployProxy(L1DeployManager, [], {
            initializer: "initialize",
            kind: "uups",
            constructorArgs: l1ConstructorArgs
        });

        await l1DeployManager.waitForDeployment();
        const l1DeployManagerTx = l1DeployManager.deploymentTransaction();
        if (l1DeployManagerTx) {
            await waitForConfirmations(l1DeployManagerTx, 1, "L1DeployManager");
        }

        const l1DeployManagerAddress = await l1DeployManager.getAddress();
        deployedContracts.L1DeployManager = l1DeployManagerAddress;

        await deploymentManager.saveDeployment(
            "L1DeployManager",
            l1DeployManager,
            l1DeployManagerTx,
            l1ConstructorArgs,
            true // isUpgradeable
        );

        const l1DeployManagerImplAddress = await upgrades.erc1967.getImplementationAddress(l1DeployManagerAddress);
        console.log("L1DeployManager Proxy:", l1DeployManagerAddress);
        console.log("L1DeployManager Implementation:", l1DeployManagerImplAddress);
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
