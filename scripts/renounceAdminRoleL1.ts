/**
 * L1 Admin Role Renunciation Script
 *
 * Final step of the L1 deployment lifecycle. Renounces the deployer's DEFAULT_ADMIN_ROLE
 * on VersionController so that only the permanent governor retains admin authority.
 *
 * Run AFTER:
 *   1. deployL1.ts      - deploys VersionController + L1DeployManager + factories
 *   2. deployL2.ts      - deploys L2DeployManager on each L2 (per-chain)
 *   3. setConfigsL1.ts  - configures L2 chains, grants DEFAULT_ADMIN_ROLE to governor,
 *                         assigns key developer, grants auditor roles
 *
 * Pre-flight checks (abort if any fail):
 *   - Network is Ethereum Mainnet (chain ID 1)
 *   - Permanent governor currently holds DEFAULT_ADMIN_ROLE on VersionController
 *     (CRITICAL: without this check, renouncing could leave the system with no admin)
 *   - DEFAULT_ADMIN_ROLE has at least 2 holders (deployer + governor at minimum)
 *
 * Idempotency:
 *   - If the deployer no longer has DEFAULT_ADMIN_ROLE, the script exits successfully
 *     without sending a transaction.
 *
 * Post-state verification:
 *   - Deployer no longer holds DEFAULT_ADMIN_ROLE
 *   - Governor still holds DEFAULT_ADMIN_ROLE
 *
 * IMPORTANT: This action is IRREVERSIBLE. After execution, only the governor (a smart
 * contract / timelock) can grant DEFAULT_ADMIN_ROLE going forward.
 *
 * Usage:
 * ```bash
 * npx hardhat run scripts/renounceAdminRoleL1.ts --network mainnet
 * ```
 *
 * NOTE: PRODUCTION ONLY (Ethereum Mainnet, chain ID 1).
 */

import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

// Must match the value used in setConfigsL1.ts
const L1_GOVERNOR_ADDRESS = "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925"; // Permanent governor

const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function main() {
    console.log("L1 ADMIN ROLE RENUNCIATION SCRIPT");
    console.log("═".repeat(60));

    const network = await ethers.provider.getNetwork();
    const [deployer] = await ethers.getSigners();

    console.log(`\nNetwork: ${network.name} (Chain ID: ${network.chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Permanent Governor: ${L1_GOVERNOR_ADDRESS}`);
    console.log("");

    if (network.chainId !== 1n) {
        throw new Error(
            `Unsupported network with chain ID: ${network.chainId}. ` +
                `This script is designed for production deployment on Ethereum Mainnet only (chain ID 1).`
        );
    }

    try {
        const deploymentPath = path.join(__dirname, "..", "deployments", network.name, "deployments.json");
        if (!fs.existsSync(deploymentPath)) {
            throw new Error(`No deployments found for network: ${network.name}`);
        }

        const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
        const versionControllerAddress = deployments.contracts?.VersionController?.address;
        if (!versionControllerAddress) {
            throw new Error("VersionController not found in deployments");
        }

        console.log(`VersionController: ${versionControllerAddress}`);
        console.log("");

        const versionController = await ethers.getContractAt("VersionController", versionControllerAddress);

        // Idempotency check: if deployer already renounced, exit successfully
        console.log("Step 1: Checking deployer's current role...");
        const deployerHasRole = await versionController.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
        if (!deployerHasRole) {
            console.log("   ℹ️  Deployer does not hold DEFAULT_ADMIN_ROLE — nothing to renounce.");
            console.log("");

            // Still verify governor has the role for operator confidence
            const governorHasRole = await versionController.hasRole(DEFAULT_ADMIN_ROLE, L1_GOVERNOR_ADDRESS);
            if (!governorHasRole) {
                throw new Error(`CRITICAL: Governor ${L1_GOVERNOR_ADDRESS} does NOT have DEFAULT_ADMIN_ROLE!`);
            }
            console.log("   ✓ Governor retains DEFAULT_ADMIN_ROLE — system is in expected state.");
            return;
        }
        console.log("   ✓ Deployer currently holds DEFAULT_ADMIN_ROLE");
        console.log("");

        // CRITICAL pre-flight: governor must hold the role before deployer renounces
        console.log("Step 2: Verifying permanent governor holds DEFAULT_ADMIN_ROLE...");
        const governorHasRole = await versionController.hasRole(DEFAULT_ADMIN_ROLE, L1_GOVERNOR_ADDRESS);
        if (!governorHasRole) {
            throw new Error(
                `CRITICAL: Governor ${L1_GOVERNOR_ADDRESS} does NOT have DEFAULT_ADMIN_ROLE.\n` +
                    `Renouncing now would brick admin access. Run setConfigsL1.ts first to grant the governor admin.`
            );
        }
        console.log(`   ✓ Governor holds DEFAULT_ADMIN_ROLE: ${L1_GOVERNOR_ADDRESS}`);
        console.log("");

        // Enumerate all current admin holders for transparency
        console.log("Step 3: Enumerating current DEFAULT_ADMIN_ROLE holders...");
        const adminCount = await versionController.getRoleMemberCount(DEFAULT_ADMIN_ROLE);
        if (adminCount < 2n) {
            throw new Error(
                `CRITICAL: Only ${adminCount} account(s) hold DEFAULT_ADMIN_ROLE. ` +
                    `Renouncing would leave the system with no admin.`
            );
        }
        const admins: string[] = [];
        for (let i = 0n; i < adminCount; i++) {
            admins.push(await versionController.getRoleMember(DEFAULT_ADMIN_ROLE, i));
        }
        console.log(`   Current admins (${adminCount}):`);
        admins.forEach((addr) => {
            const tag =
                addr.toLowerCase() === L1_GOVERNOR_ADDRESS.toLowerCase()
                    ? " (governor)"
                    : addr.toLowerCase() === deployer.address.toLowerCase()
                      ? " (deployer — to be renounced)"
                      : " (unexpected — review before proceeding)";
            console.log(`     - ${addr}${tag}`);
        });
        console.log("");

        // Renounce
        console.log("Step 4: Renouncing deployer's DEFAULT_ADMIN_ROLE...");
        console.log("⚠️  WARNING: This action is IRREVERSIBLE");
        console.log(`   Deployer: ${deployer.address}`);

        const renounceTx = await versionController.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
        console.log(`   Transaction hash: ${renounceTx.hash}`);
        const receipt = await renounceTx.wait(1);
        console.log(`   ✓ Confirmed in block ${receipt?.blockNumber}`);
        console.log("");

        // Post-state verification
        console.log("Step 5: Verifying post-renunciation state...");
        const stillHasRole = await versionController.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
        if (stillHasRole) {
            throw new Error("Role renunciation failed — deployer still has DEFAULT_ADMIN_ROLE");
        }
        console.log("   ✓ Deployer no longer has DEFAULT_ADMIN_ROLE");

        const governorStillHasRole = await versionController.hasRole(DEFAULT_ADMIN_ROLE, L1_GOVERNOR_ADDRESS);
        if (!governorStillHasRole) {
            throw new Error(`CRITICAL: Governor ${L1_GOVERNOR_ADDRESS} no longer has DEFAULT_ADMIN_ROLE!`);
        }
        console.log(`   ✓ Governor retains DEFAULT_ADMIN_ROLE: ${L1_GOVERNOR_ADDRESS}`);
        console.log("");

        console.log("═".repeat(60));
        console.log("🎉 ADMIN ROLE RENUNCIATION COMPLETED SUCCESSFULLY!");
        console.log("═".repeat(60));
        console.log("");
        console.log(`Deployer ${deployer.address} no longer has admin authority on VersionController.`);
        console.log(`Going forward, only the governor (${L1_GOVERNOR_ADDRESS}) can grant DEFAULT_ADMIN_ROLE.`);
        console.log("");
    } catch (error) {
        console.error("\n❌ Renunciation failed:", error);
        process.exit(1);
    }
}

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});

if (require.main === module) {
    main();
}

export default main;
