/**
 * Configuration Manager Utility
 *
 * Provides utilities for managing network configurations, especially for updating
 * L1DeployManager addresses after L1 deployment and validating configurations.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ethers } from "hardhat";
import { getNetworkConfig, getAvailableNetworks, NETWORK_CONFIGS } from "../config/networkConfig";
import { resolveDeploymentDir } from "./deployment";

interface L1DeploymentSummary {
    L1DeployManager: string;
    VersionController: string;
    MarketFactory: string;
    CometFactoryV2: string;
}

/**
 * Update L1DeployManager addresses in all L2 network configs from L1 deployment
 */
export async function updateL1DeployManagerAddresses(l1NetworkName: string): Promise<void> {
    console.log(`🔄 Updating L1DeployManager addresses from ${l1NetworkName} deployment...`);

    try {
        // Load L1 deployment summary
        const l1DeploymentPath = join(
            process.cwd(),
            "deployments",
            resolveDeploymentDir(l1NetworkName),
            "deployments.json"
        );
        const l1DeploymentData = JSON.parse(readFileSync(l1DeploymentPath, "utf8"));

        const l1DeployManagerAddress = l1DeploymentData.contracts?.L1DeployManager?.address;
        if (!l1DeployManagerAddress) {
            throw new Error(`L1DeployManager address not found in ${l1NetworkName} deployment`);
        }

        console.log(`   📡 L1DeployManager address: ${l1DeployManagerAddress}`);

        // Update all network configs
        const configPath = join(process.cwd(), "scripts", "config", "networkConfig.ts");
        let configContent = readFileSync(configPath, "utf8");

        // Replace all placeholder L1DeployManager addresses
        const updatedContent = configContent.replace(
            /l1DeployManager: "0x1234567890123456789012345678901234567890"/g,
            `l1DeployManager: "${l1DeployManagerAddress}"`
        );

        writeFileSync(configPath, updatedContent);

        console.log(`   ✅ Updated all network configs with L1DeployManager address`);
        console.log(`   📁 Config file updated: ${configPath}`);
    } catch (error) {
        console.error(`❌ Failed to update L1DeployManager addresses:`, error);
        throw error;
    }
}

/**
 * Validate all network configurations
 */
export function validateAllNetworkConfigs(): boolean {
    console.log("🔍 Validating all network configurations...");

    const networks = getAvailableNetworks();
    let allValid = true;

    for (const networkName of networks) {
        try {
            const config = getNetworkConfig(networkName);

            // Check for placeholder addresses
            const placeholderFields: string[] = [];

            if (config.ccipRouter === "0x1234567890123456789012345678901234567890") {
                placeholderFields.push("ccipRouter");
            }
            if (config.timelock === "0x1234567890123456789012345678901234567890") {
                placeholderFields.push("timelock");
            }
            if (config.cometProxyAdmin === "0x1234567890123456789012345678901234567890") {
                placeholderFields.push("cometProxyAdmin");
            }
            if (config.assetListFactory === "0x1234567890123456789012345678901234567890") {
                placeholderFields.push("assetListFactory");
            }
            if (config.l1DeployManager === "0x1234567890123456789012345678901234567890") {
                placeholderFields.push("l1DeployManager");
            }

            if (placeholderFields.length > 0) {
                console.log(`   ⚠️  ${networkName}: Placeholder addresses found: ${placeholderFields.join(", ")}`);
                allValid = false;
            } else {
                console.log(`   ✅ ${networkName}: Configuration valid`);
            }
        } catch (error) {
            console.log(`   ❌ ${networkName}: Invalid configuration - ${error}`);
            allValid = false;
        }
    }

    if (allValid) {
        console.log("\\n🎉 All network configurations are valid!");
    } else {
        console.log("\\n⚠️  Some network configurations need attention");
    }

    return allValid;
}

/**
 * Display current network configuration
 */
export function displayNetworkConfig(networkName: string): void {
    try {
        const config = getNetworkConfig(networkName);

        console.log(`\\n📋 Network Configuration: ${config.name}`);
        console.log("═".repeat(50));
        console.log(`Chain ID: ${config.chainId}`);
        console.log(`Network Type: ${config.isTestnet ? "Testnet" : "Mainnet"}`);
        console.log("");
        console.log("Contract Addresses:");
        console.log(`  CCIP Router:        ${config.ccipRouter}`);
        console.log(`  Timelock:           ${config.timelock}`);
        console.log(`  Comet Proxy Admin:  ${config.cometProxyAdmin}`);
        console.log(`  Asset List Factory: ${config.assetListFactory}`);
        console.log(`  L1 Deploy Manager:  ${config.l1DeployManager}`);
    } catch (error) {
        console.error(`❌ Error displaying config for ${networkName}:`, error);
    }
}

/**
 * List all available networks with their types
 */
export function listAvailableNetworks(): void {
    console.log("\\n🌐 Available Networks:");
    console.log("═".repeat(40));

    const networks = getAvailableNetworks();
    const mainnets = networks.filter((name) => !NETWORK_CONFIGS[name].isTestnet);
    const testnets = networks.filter((name) => NETWORK_CONFIGS[name].isTestnet);

    console.log("\\n🏭 Mainnets:");
    mainnets.forEach((name) => {
        const config = NETWORK_CONFIGS[name];
        console.log(`  ${name.padEnd(20)} (Chain ID: ${config.chainId})`);
    });

    console.log("\\n🧪 Testnets:");
    testnets.forEach((name) => {
        const config = NETWORK_CONFIGS[name];
        console.log(`  ${name.padEnd(20)} (Chain ID: ${config.chainId})`);
    });
}

/**
 * Interactive configuration checker
 */
export async function interactiveConfigCheck(): Promise<void> {
    console.log("🔧 INTERACTIVE CONFIGURATION CHECKER");
    console.log("═".repeat(50));

    // List available networks
    listAvailableNetworks();

    // Validate all configs
    console.log("\\n");
    const allValid = validateAllNetworkConfigs();

    if (!allValid) {
        console.log("\\n💡 RECOMMENDATIONS:");
        console.log("1. Update placeholder addresses in scripts/config/networkConfig.ts");
        console.log("2. After L1 deployment, run: npx hardhat run scripts/utils/updateL1Addresses.ts");
        console.log("3. Verify CCIP router addresses match the target networks");
        console.log("4. Ensure timelock addresses are correct for governance");
    }
}

/**
 * Check if L1 deployment exists and get summary
 */
export function getL1DeploymentSummary(l1NetworkName: string): L1DeploymentSummary | null {
    try {
        const l1DeploymentPath = join(
            process.cwd(),
            "deployments",
            resolveDeploymentDir(l1NetworkName),
            "deployments.json"
        );
        const l1DeploymentData = JSON.parse(readFileSync(l1DeploymentPath, "utf8"));

        const contracts = l1DeploymentData.contracts;
        if (!contracts) {
            return null;
        }

        return {
            L1DeployManager: contracts.L1DeployManager?.address || "",
            VersionController: contracts.VersionController?.address || "",
            MarketFactory: contracts.MarketFactory?.address || "",
            CometFactoryV2: contracts.CometFactoryV2?.address || ""
        };
    } catch (error) {
        return null;
    }
}

/**
 * Verify L1DeployManager address is valid
 */
export async function verifyL1DeployManagerAddress(address: string): Promise<boolean> {
    try {
        if (!ethers.isAddress(address)) {
            return false;
        }

        // Try to get the contract code
        const code = await ethers.provider.getCode(address);
        return code !== "0x";
    } catch (error) {
        return false;
    }
}
