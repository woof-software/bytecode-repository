/**
 * Update L1 Addresses Utility Script
 *
 * This script automatically updates all L2 network configurations with the correct
 * L1DeployManager address after L1 deployment is completed.
 *
 * Usage:
 * ```bash
 * # Update from mainnet L1 deployment
 * npx hardhat run scripts/utils/updateL1Addresses.ts -- --l1-network ethereum
 *
 * # Update from testnet L1 deployment
 * npx hardhat run scripts/utils/updateL1Addresses.ts -- --l1-network sepolia
 *
 * # Interactive mode
 * npx hardhat run scripts/utils/updateL1Addresses.ts
 * ```
 */

import {
    updateL1DeployManagerAddresses,
    validateAllNetworkConfigs,
    getL1DeploymentSummary,
    listAvailableNetworks,
    displayNetworkConfig
} from "./configManager";

/**
 * Parse CLI arguments
 */
function parseCliArgs(): { l1Network?: string } {
    const args = process.argv.slice(2);
    const result: { l1Network?: string } = {};

    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        const value = args[i + 1];

        if (key === "--l1-network") {
            result.l1Network = value;
        }
    }

    return result;
}

/**
 * Interactive L1 network selection
 */
async function selectL1Network(): Promise<string> {
    console.log("🌐 Available L1 Networks:");
    console.log("─".repeat(30));
    console.log("For mainnet L2s: ethereum");
    console.log("For testnet L2s: sepolia");
    console.log("");

    // In a real implementation, you might use a library like 'inquirer' for better UX
    // For now, we'll just prompt the user to run with the --l1-network flag
    throw new Error(`
Please specify the L1 network using the --l1-network flag:

Examples:
  npx hardhat run scripts/utils/updateL1Addresses.ts -- --l1-network ethereum
  npx hardhat run scripts/utils/updateL1Addresses.ts -- --l1-network sepolia
`);
}

/**
 * Main execution function
 */
async function main() {
    console.log("🔄 L1 ADDRESSES UPDATE UTILITY");
    console.log("═".repeat(50));

    try {
        // Parse CLI arguments
        const { l1Network } = parseCliArgs();

        let selectedL1Network: string;

        if (l1Network) {
            selectedL1Network = l1Network;
            console.log(`🎯 Using L1 network: ${selectedL1Network}`);
        } else {
            selectedL1Network = await selectL1Network();
        }

        // Check if L1 deployment exists
        console.log(`\\n🔍 Checking L1 deployment on ${selectedL1Network}...`);
        const l1Summary = getL1DeploymentSummary(selectedL1Network);

        if (!l1Summary) {
            throw new Error(
                `No L1 deployment found for network: ${selectedL1Network}. Please deploy L1 contracts first.`
            );
        }

        console.log("   ✅ L1 deployment found");
        console.log(`   📡 L1DeployManager: ${l1Summary.L1DeployManager}`);
        console.log(`   📋 VersionController: ${l1Summary.VersionController}`);
        console.log(`   🏭 MarketFactory: ${l1Summary.MarketFactory}`);
        console.log(`   🚀 CometFactoryV2: ${l1Summary.CometFactoryV2}`);

        if (!l1Summary.L1DeployManager) {
            throw new Error("L1DeployManager address not found in L1 deployment summary");
        }

        // Update all L2 network configs
        await updateL1DeployManagerAddresses(selectedL1Network);

        // Validate all configurations
        console.log("\\n🔍 Validating updated configurations...");
        const allValid = validateAllNetworkConfigs();

        if (allValid) {
            console.log("\\n🎉 ALL CONFIGURATIONS UPDATED SUCCESSFULLY!");
            console.log("═".repeat(50));
            console.log("\\n✅ Next Steps:");
            console.log("1. Review the updated configuration file:");
            console.log("   scripts/config/networkConfig.ts");
            console.log("2. Deploy L2 contracts to your target networks:");
            console.log("   npx hardhat run scripts/deployL2.ts --network <l2-network>");
            console.log("3. Configure cross-chain messaging between L1 and L2");
        } else {
            console.log("\\n⚠️  CONFIGURATION UPDATE COMPLETED WITH WARNINGS");
            console.log("═".repeat(50));
            console.log("\\n🔧 Action Required:");
            console.log("1. Review and update placeholder addresses in:");
            console.log("   scripts/config/networkConfig.ts");
            console.log("2. Ensure all required addresses are properly configured");
            console.log("3. Re-run this script to validate configurations");
        }
    } catch (error) {
        console.error("\\n❌ Update failed:", error);

        console.log("\\n💡 Troubleshooting:");
        console.log("1. Ensure L1 contracts are deployed first:");
        console.log("   npx hardhat run scripts/deployL1.ts --network <l1-network>");
        console.log("2. Check that deployment artifacts exist in deployments/ directory");
        console.log("3. Verify network name matches your Hardhat configuration");

        process.exit(1);
    }
}

// Execute the script
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

export default main;
