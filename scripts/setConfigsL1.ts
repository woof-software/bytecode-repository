/**
 * L1 Chain Configuration Script
 *
 * This script performs comprehensive L1 configuration after L2 deployments are complete:
 * - Configures L2 chain settings in L1DeployManager
 * - Assigns key developers to contract types
 * - Grants auditor roles
 * - Transfers admin role to permanent governor
 *
 * IMPORTANT: This script requires the deployer to have DEFAULT_ADMIN_ROLE in VersionController.
 * The deployer receives this role during initial deployment (deployL1.ts).
 *
 * Flow:
 * 1. Validate developer and auditor addresses (warn about placeholders)
 * 2. Read deployed L2DeployManager addresses from deployment artifacts
 * 3. Configure each L2 chain in L1DeployManager using setChainConfig()
 * 4. Validate all configurations
 * 5. GRANT DEFAULT_ADMIN_ROLE to permanent governor (CRITICAL STEP)
 * 6. Validate permanent governor has the role
 * 7. Assign key developer to all 12 contract types
 * 8. Grant AUDITOR_ROLE to configured auditors
 * 9. Display role assignment summary
 * 10. Renounce DEFAULT_ADMIN_ROLE from deployer (permanent governor retains role)
 *
 * Role Management:
 * - Deployer starts with DEFAULT_ADMIN_ROLE (granted in deployL1.ts)
 * - This script grants DEFAULT_ADMIN_ROLE to permanent governor
 * - One key developer is assigned to all contract types and receives KEY_DEVELOPER_ROLE
 * - Auditors receive AUDITOR_ROLE for bytecode verification
 * - Deployer renounces their DEFAULT_ADMIN_ROLE (unless deployer IS the governor)
 * - Final state: Only permanent governor has DEFAULT_ADMIN_ROLE
 *
 * Contract Types (all assigned to single key developer):
 * - CometWithAssetList, CometExtWithAssetList
 * - CompoundGovernor
 * - VersionController, L1DeployManager, L2DeployManager
 * - MarketFactory, CometFactoryV2
 * - Streamer, StreamerFactory
 * - CometMultiplier, CometCollateralSwap
 *
 * BEFORE RUNNING:
 * 1. Update KEY_DEVELOPER address (replace placeholder 0x1234567890123456789012345678901234567890)
 * 2. Update auditor addresses (AUDITOR_1, AUDITOR_2)
 * 3. Ensure L2 contracts are already deployed
 * 4. Verify deployer has sufficient gas
 *
 * Usage:
 * ```bash
 * # Configure L2 chains on Ethereum mainnet (PRODUCTION ONLY)
 * npx hardhat run scripts/setConfigsL1.ts --network mainnet
 * ```
 *
 * NOTE: This script is designed for PRODUCTION deployment on Ethereum Mainnet only.
 * It does not support testnet deployments.
 */

import hre from "hardhat";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { getNetworkConfig, NETWORK_CONFIGS } from "./config/networkConfig";

// L1 configuration
const L1_GOVERNOR_ADDRESS = "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925"; // Permanent governor

// Developer address for all contract type assignments
// TODO: Replace with actual developer address before deployment
const KEY_DEVELOPER = "0x1234567890123456789012345678901234567890"; // Main key developer for all contract types

// Auditor addresses
// TODO: Replace with actual auditor addresses before deployment
const AUDITOR_1 = "0x7234567890123456789012345678901234567890"; // Primary auditor

// All contract types to be assigned to the key developer
const CONTRACT_TYPES = [
    // Comet contracts
    "CometWithAssetList",
    "CometExtWithAssetList",

    // Governance
    "CompoundGovernor",

    // Core system
    "VersionController",
    "L1DeployManager",
    "L2DeployManager",

    // Factories
    "MarketFactory",
    "CometFactoryV2",

    // Streaming
    "Streamer",
    "StreamerFactory",

    // Utilities
    "CometMultiplier",
    "CometCollateralSwap"
];

// Auditors to grant roles
const AUDITORS = [{ address: AUDITOR_1, name: "Certora Auditor" }];

// ChainConfig struct matches IL1DeployManager.sol:41-44
interface ChainConfig {
    l2DeployManager: string;
    destinationChainSelector: string; // uint64 as string
}

interface L2DeploymentInfo {
    chainId: number;
    networkName: string;
    l2DeployManagerAddress: string;
    destinationChainSelector: string;
}

/**
 * Read L2DeployManager address from deployment artifacts
 */
function getL2DeploymentInfo(networkName: string): L2DeploymentInfo | null {
    try {
        const deploymentPath = path.join(__dirname, "..", "deployments", networkName, "L2DeployManager.json");

        if (!fs.existsSync(deploymentPath)) {
            console.log(`⚠️  No deployment found for ${networkName}`);
            return null;
        }

        const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
        const networkConfig = NETWORK_CONFIGS[networkName];

        return {
            chainId: networkConfig.chainId,
            networkName: networkConfig.name,
            l2DeployManagerAddress: deployment.address,
            destinationChainSelector: networkConfig.sourceChainSelector // CCIP selector for L2 chain
        };
    } catch (error) {
        console.error(`Error reading deployment for ${networkName}:`, error);
        return null;
    }
}

/**
 * Get all L2 networks to configure for Ethereum Mainnet
 */
function getL2NetworksForL1(l1ChainId: bigint): string[] {
    // Ethereum Mainnet (1) -> L2 production networks
    if (l1ChainId === 1n) {
        return ["arbitrum", "optimism", "polygon", "base", "linea", "ronin", "unichain", "mantle", "scroll"];
    } else {
        throw new Error(
            `Unsupported L1 network with chain ID: ${l1ChainId}. ` +
                `This script is designed for production deployment on Ethereum Mainnet only (chain ID 1).`
        );
    }
}

/**
 * Validate deployer has DEFAULT_ADMIN_ROLE
 */
async function validateDeployerRole(versionController: any, deployerAddress: string): Promise<void> {
    const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const hasRole = await versionController.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress);

    if (!hasRole) {
        throw new Error(
            `Deployer ${deployerAddress} does NOT have DEFAULT_ADMIN_ROLE.\n` +
                `Governor must grant this role before running this script:\n` +
                `versionController.grantRole(DEFAULT_ADMIN_ROLE, "${deployerAddress}")`
        );
    }

    console.log("✓ Deployer has DEFAULT_ADMIN_ROLE");
}

/**
 * Validate governor retains DEFAULT_ADMIN_ROLE after renunciation
 */
async function validateGovernorRole(versionController: any, governorAddress: string): Promise<void> {
    const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const hasRole = await versionController.hasRole(DEFAULT_ADMIN_ROLE, governorAddress);

    if (!hasRole) {
        throw new Error(`CRITICAL: Governor ${governorAddress} does NOT have DEFAULT_ADMIN_ROLE!`);
    }

    console.log("✓ Governor retains DEFAULT_ADMIN_ROLE:", governorAddress);
}

/**
 * Validate developer address is not a placeholder address
 */
function validateDeveloperAddress(): void {
    const placeholderPattern = /^0x[0-9]+$/;

    if (placeholderPattern.test(KEY_DEVELOPER)) {
        console.warn("⚠️  WARNING: KEY_DEVELOPER uses a placeholder address:");
        console.warn(`   - KEY_DEVELOPER: ${KEY_DEVELOPER}`);
        console.warn("   Please update this address before production deployment!");
        console.warn("");
    }
}

/**
 * Validate auditor addresses are not placeholder addresses
 */
function validateAuditorAddresses(): void {
    const placeholderPattern = /^0x[0-9]+$/;
    const invalidAuditors = AUDITORS.filter((auditor) => placeholderPattern.test(auditor.address));

    if (invalidAuditors.length > 0) {
        console.warn("⚠️  WARNING: The following auditors use placeholder addresses:");
        invalidAuditors.forEach((auditor) => console.warn(`   - ${auditor.name}: ${auditor.address}`));
        console.warn("   Please update these addresses before production deployment!");
        console.warn("");
    }
}

/**
 * Assign key developer for all contract types
 */
async function assignKeyDeveloper(versionController: any): Promise<void> {
    console.log("Step 7: Assigning key developer for contract types...");
    console.log("");

    const KEY_DEVELOPER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("KEY_DEVELOPER_ROLE"));

    console.log(`  Developer: ${KEY_DEVELOPER}`);
    console.log(`  Contract Types (${CONTRACT_TYPES.length}):`);
    CONTRACT_TYPES.forEach((ct, idx) => {
        console.log(`    ${idx + 1}. ${ct}`);
    });
    console.log("");

    // Convert contract type strings to bytes32
    const contractTypesBytes32 = CONTRACT_TYPES.map((ct: string) => ethers.encodeBytes32String(ct));

    try {
        // Check if developer already has KEY_DEVELOPER_ROLE
        const hasRole = await versionController.hasRole(KEY_DEVELOPER_ROLE, KEY_DEVELOPER);
        console.log(
            `  Developer has KEY_DEVELOPER_ROLE: ${hasRole ? "Yes (already assigned)" : "No (will be granted)"}`
        );
        console.log("");

        // Assign developer for contract types (this will grant KEY_DEVELOPER_ROLE if needed)
        console.log("  Executing assignment transaction...");
        const tx = await versionController.assignDeveloperForContractTypes(contractTypesBytes32, KEY_DEVELOPER);
        console.log(`  Transaction hash: ${tx.hash}`);

        const receipt = await tx.wait(1);
        console.log(`  ✓ Confirmed in block ${receipt?.blockNumber}`);
        console.log("");

        // Verify assignments
        console.log("  Verifying assignments...");
        let verifiedCount = 0;
        for (let i = 0; i < contractTypesBytes32.length; i++) {
            const assignedDev = await versionController.contractTypeKeyDeveloper(contractTypesBytes32[i]);
            if (assignedDev.toLowerCase() !== KEY_DEVELOPER.toLowerCase()) {
                throw new Error(
                    `Assignment verification failed for ${CONTRACT_TYPES[i]}: expected ${KEY_DEVELOPER}, got ${assignedDev}`
                );
            }
            verifiedCount++;
        }
        console.log(`  ✓ All ${verifiedCount} contract type(s) assigned and verified`);

        // Verify developer has KEY_DEVELOPER_ROLE
        const hasRoleAfter = await versionController.hasRole(KEY_DEVELOPER_ROLE, KEY_DEVELOPER);
        if (!hasRoleAfter) {
            throw new Error(`Developer ${KEY_DEVELOPER} does not have KEY_DEVELOPER_ROLE after assignment`);
        }
        console.log(`  ✓ Developer has KEY_DEVELOPER_ROLE`);
    } catch (error: any) {
        // Check if error is due to same key developer already assigned
        if (error.message && error.message.includes("SameKeyDeveloper")) {
            console.log(`  ℹ️  Contract types already assigned to this developer`);
        } else {
            throw error;
        }
    }

    console.log("");
    console.log("✓ Key developer assignment completed successfully");
    console.log("");
}

/**
 * Grant auditor roles
 */
async function grantAuditorRoles(versionController: any): Promise<void> {
    console.log("Step 8: Granting auditor roles...");
    console.log("");

    const AUDITOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AUDITOR_ROLE"));

    for (const auditor of AUDITORS) {
        console.log(`  Granting AUDITOR_ROLE to ${auditor.name}:`);
        console.log(`    Address: ${auditor.address}`);

        try {
            // Check if auditor already has the role
            const hasRole = await versionController.hasRole(AUDITOR_ROLE, auditor.address);

            if (!hasRole) {
                const tx = await versionController.grantRole(AUDITOR_ROLE, auditor.address);
                console.log(`    Transaction hash: ${tx.hash}`);

                const receipt = await tx.wait(1);
                console.log(`    ✓ Confirmed in block ${receipt?.blockNumber}`);

                // Verify role was granted
                const hasRoleAfter = await versionController.hasRole(AUDITOR_ROLE, auditor.address);
                if (!hasRoleAfter) {
                    throw new Error(`Failed to grant AUDITOR_ROLE to ${auditor.address}`);
                }
                console.log(`    ✓ AUDITOR_ROLE granted and verified`);
            } else {
                console.log(`    ℹ️  Already has AUDITOR_ROLE`);
            }
        } catch (error) {
            console.error(`    ❌ Failed to grant role to ${auditor.name}:`, error);
            throw error;
        }

        console.log("");
    }

    console.log("✓ All auditor roles granted successfully");
    console.log("");
}

/**
 * Display role assignment summary
 */
async function displayRolesSummary(versionController: any): Promise<void> {
    console.log("Role Assignment Summary:");
    console.log("─".repeat(60));

    const KEY_DEVELOPER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("KEY_DEVELOPER_ROLE"));
    const AUDITOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AUDITOR_ROLE"));

    // Display key developer
    console.log("\nKey Developer:");
    const hasDevRole = await versionController.hasRole(KEY_DEVELOPER_ROLE, KEY_DEVELOPER);
    console.log(`  ${KEY_DEVELOPER}:`);
    console.log(`    Has KEY_DEVELOPER_ROLE: ${hasDevRole ? "✓" : "✗"}`);
    console.log(`    Assigned Contract Types: ${CONTRACT_TYPES.length}`);
    CONTRACT_TYPES.forEach((ct) => {
        console.log(`      - ${ct}`);
    });

    // Display auditors
    console.log("\nAuditors:");
    for (const auditor of AUDITORS) {
        const hasRole = await versionController.hasRole(AUDITOR_ROLE, auditor.address);
        console.log(`  ${auditor.name} (${auditor.address}):`);
        console.log(`    Has AUDITOR_ROLE: ${hasRole ? "✓" : "✗"}`);
    }

    console.log("");
}

/**
 * Main configuration function
 */
async function main() {
    console.log("L1 CHAIN CONFIGURATION SCRIPT");
    console.log("═".repeat(60));

    // Get network info
    const network = await ethers.provider.getNetwork();
    const [deployer] = await ethers.getSigners();

    console.log(`\nNetwork: ${network.name} (Chain ID: ${network.chainId})`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Permanent Governor: ${L1_GOVERNOR_ADDRESS}`);
    console.log("");

    // Validate addresses
    console.log("Validating Configuration...");
    validateDeveloperAddress();
    validateAuditorAddresses();
    console.log("");

    try {
        // Load deployed contracts
        const deploymentPath = path.join(__dirname, "..", "deployments", network.name, "deployments.json");
        if (!fs.existsSync(deploymentPath)) {
            throw new Error(`No deployments found for network: ${network.name}`);
        }

        const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
        const versionControllerAddress = deployments.VersionController;
        const l1DeployManagerAddress = deployments.L1DeployManager;

        if (!versionControllerAddress || !l1DeployManagerAddress) {
            throw new Error("VersionController or L1DeployManager not found in deployments");
        }

        console.log("Loaded Contract Addresses:");
        console.log(`  VersionController: ${versionControllerAddress}`);
        console.log(`  L1DeployManager: ${l1DeployManagerAddress}`);
        console.log("");

        // Get contract instances
        const versionController = await ethers.getContractAt("VersionController", versionControllerAddress);
        const l1DeployManager = await ethers.getContractAt("L1DeployManager", l1DeployManagerAddress);

        // Validate deployer has admin role
        console.log("Step 1: Validating deployer permissions...");
        await validateDeployerRole(versionController, deployer.address);
        console.log("");

        // Get L2 networks to configure
        const l2Networks = getL2NetworksForL1(network.chainId);
        console.log(`Step 2: Loading L2 deployment information for ${l2Networks.length} networks...`);

        const l2Deployments: L2DeploymentInfo[] = [];
        for (const networkName of l2Networks) {
            const info = getL2DeploymentInfo(networkName);
            if (info) {
                l2Deployments.push(info);
                console.log(`  ✓ ${info.networkName} (Chain ID: ${info.chainId})`);
                console.log(`    L2DeployManager: ${info.l2DeployManagerAddress}`);
                console.log(`    CCIP Selector: ${info.destinationChainSelector}`);
            }
        }

        if (l2Deployments.length === 0) {
            throw new Error("No L2 deployments found. Deploy L2 contracts first using deployL2.ts");
        }

        console.log(`\n  Found ${l2Deployments.length} L2 deployment(s)`);
        console.log("");

        // Configure each L2 chain
        console.log("Step 3: Configuring L2 chains in L1DeployManager...");

        for (const l2Info of l2Deployments) {
            console.log(`\n  Configuring ${l2Info.networkName} (Chain ID: ${l2Info.chainId})...`);

            const chainConfig: ChainConfig = {
                l2DeployManager: l2Info.l2DeployManagerAddress,
                destinationChainSelector: l2Info.destinationChainSelector
            };

            // Call setChainConfig
            const tx = await l1DeployManager.setChainConfig(l2Info.chainId, chainConfig);
            console.log(`    Transaction hash: ${tx.hash}`);

            const receipt = await tx.wait(1);
            console.log(`    ✓ Confirmed in block ${receipt?.blockNumber}`);

            // Verify configuration
            const storedConfig = await l1DeployManager.chainConfigs(l2Info.chainId);
            if (
                storedConfig.l2DeployManager.toLowerCase() !== chainConfig.l2DeployManager.toLowerCase() ||
                storedConfig.destinationChainSelector.toString() !== chainConfig.destinationChainSelector
            ) {
                throw new Error(`Configuration verification failed for ${l2Info.networkName}`);
            }
            console.log(`    ✓ Configuration verified on-chain`);
        }

        console.log("\n✓ All L2 chains configured successfully");
        console.log("");

        // Grant DEFAULT_ADMIN_ROLE to permanent governor
        console.log("Step 4: Granting DEFAULT_ADMIN_ROLE to permanent governor...");
        const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

        // Check if governor already has the role
        const governorHasRole = await versionController.hasRole(DEFAULT_ADMIN_ROLE, L1_GOVERNOR_ADDRESS);

        if (!governorHasRole) {
            console.log(`   Granting role to: ${L1_GOVERNOR_ADDRESS}`);
            const grantTx = await versionController.grantRole(DEFAULT_ADMIN_ROLE, L1_GOVERNOR_ADDRESS);
            console.log(`   Transaction hash: ${grantTx.hash}`);

            const grantReceipt = await grantTx.wait(1);
            console.log(`   ✓ Confirmed in block ${grantReceipt?.blockNumber}`);

            // Verify governor now has role
            const verifyRole = await versionController.hasRole(DEFAULT_ADMIN_ROLE, L1_GOVERNOR_ADDRESS);
            if (!verifyRole) {
                throw new Error("Failed to grant DEFAULT_ADMIN_ROLE to governor");
            }
            console.log("   ✓ Governor granted DEFAULT_ADMIN_ROLE");
        } else {
            console.log("   ✓ Governor already has DEFAULT_ADMIN_ROLE");
        }
        console.log("");

        // Validate governor has role before deployer renounces
        console.log("Step 5: Validating permanent governor role...");
        await validateGovernorRole(versionController, L1_GOVERNOR_ADDRESS);
        console.log("");

        // Assign key developer for contract types
        console.log("Step 6: Setting up developer and auditor roles...");
        console.log("═".repeat(60));
        console.log("");
        await assignKeyDeveloper(versionController);
        await grantAuditorRoles(versionController);

        // Display role assignments summary
        await displayRolesSummary(versionController);

        // Renounce deployer's DEFAULT_ADMIN_ROLE
        console.log("Step 9: Renouncing deployer's DEFAULT_ADMIN_ROLE...");
        console.log("⚠️  WARNING: This action is IRREVERSIBLE");

        console.log(`   Deployer: ${deployer.address}`);
        console.log(`   Renouncing role: DEFAULT_ADMIN_ROLE`);

        const renounceTx = await versionController.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
        console.log(`   Transaction hash: ${renounceTx.hash}`);

        const renounceReceipt = await renounceTx.wait(1);
        console.log(`   ✓ Confirmed in block ${renounceReceipt?.blockNumber}`);

        // Verify deployer no longer has role
        const stillHasRole = await versionController.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
        if (stillHasRole) {
            throw new Error("Role renunciation failed - deployer still has DEFAULT_ADMIN_ROLE");
        }
        console.log("   ✓ Deployer no longer has DEFAULT_ADMIN_ROLE");

        // Final validation that governor retains role
        await validateGovernorRole(versionController, L1_GOVERNOR_ADDRESS);

        console.log("");
        console.log("═".repeat(60));
        console.log("🎉 L1 CHAIN CONFIGURATION COMPLETED SUCCESSFULLY!");
        console.log("═".repeat(60));
        console.log("");
        console.log("Summary:");
        console.log(`  - Configured ${l2Deployments.length} L2 chain(s)`);
        console.log(`  - Permanent Governor has DEFAULT_ADMIN_ROLE: ${L1_GOVERNOR_ADDRESS}`);
        console.log(`  - Assigned key developer to ${CONTRACT_TYPES.length} contract type(s)`);
        console.log(`  - Granted AUDITOR_ROLE to ${AUDITORS.length} auditor(s)`);

        if (deployer.address.toLowerCase() !== L1_GOVERNOR_ADDRESS.toLowerCase()) {
            console.log(`  - Deployer role renounced: ${deployer.address}`);
        } else {
            console.log(`  - Deployer IS permanent governor (role retained)`);
        }
        console.log("");
        console.log("Role Management Complete:");
        console.log("  ✓ Permanent governor has DEFAULT_ADMIN_ROLE");
        console.log("  ✓ Deployer admin role properly transferred/renounced");
        console.log("  ✓ Key developer assigned to all contract types");
        console.log("  ✓ Auditor roles granted");
        console.log("");
        console.log("Next Steps:");
        console.log("  1. Verify L2 chain configurations:");
        console.log(`     l1DeployManager.chainConfigs(<chainId>)`);
        console.log("  2. Verify governor role:");
        console.log(`     versionController.hasRole(DEFAULT_ADMIN_ROLE, "${L1_GOVERNOR_ADDRESS}")`);
        console.log("  3. Verify developer assignments:");
        console.log(`     versionController.contractTypeKeyDeveloper(<contractTypeBytes32>)`);
        console.log("  4. Verify auditor roles:");
        console.log(`     versionController.hasRole(AUDITOR_ROLE, <auditorAddress>)`);
        console.log("  5. Developers can now upload bytecode for their assigned contract types");
        console.log("  6. Auditors can verify uploaded bytecode with EIP-712 signatures");
        console.log("  7. Test cross-chain bytecode transmission");
        console.log("");
    } catch (error) {
        console.error("\n❌ Configuration failed:", error);
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
