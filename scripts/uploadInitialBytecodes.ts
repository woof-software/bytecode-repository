/**
 * Initial Bytecode Upload Script
 *
 * Uploads initial bytecodes (v1.0.0) to the VersionController for all contract types
 * defined in `scripts/config/initialBytecodes.ts`.
 *
 * This script is intended to run ONCE after the BytecodeRepository system is deployed
 * and configured (i.e., after deployL1.ts, deployL2.ts, and setConfigsL1.ts).
 *
 * Prerequisites:
 *   1. VersionController is deployed (deployment artifact exists)
 *   2. Signer has KEY_DEVELOPER_ROLE and is assigned to all contract types in the config
 *   3. Project is compiled (`pnpm compile`)
 *
 * For each entry in the config, the script:
 *   1. Resolves bytecode from Hardhat artifact (artifactName) or external file (bytecodeFile)
 *   2. Checks whether the contract type already has an initial release (skips if so)
 *   3. Calls releaseBytecode() via the uploadBytecode utility
 *
 * Usage:
 *   Note: Hardhat's `run` command does not pass CLI flags through to the script.
 *   Run the script directly with ts-node and set HARDHAT_NETWORK to select the network.
 *
 *   # Upload initial bytecodes on Ethereum Mainnet
 *   HARDHAT_NETWORK=mainnet npx ts-node scripts/uploadInitialBytecodes.ts
 *
 *   # Preview without sending transactions
 *   HARDHAT_NETWORK=mainnet npx ts-node scripts/uploadInitialBytecodes.ts --dry-run
 *
 *   # Override VersionController address
 *   HARDHAT_NETWORK=mainnet npx ts-node scripts/uploadInitialBytecodes.ts \
 *     --version-controller 0x1234...abcd
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access,
    @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any,
    @typescript-eslint/restrict-template-expressions, @typescript-eslint/use-unknown-in-catch-callback-variable */

import hre from "hardhat";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { uploadBytecode, loadBytecodeFromFile, validateDeveloperAccess } from "./utils/uploadBytecode";
import { INITIAL_BYTECODES, InitialBytecodeEntry } from "./config/initialBytecodes";

const HELP_TEXT = `
Initial Bytecode Upload Script — uploads v1.0.0 bytecodes for all configured contract types

Reads entries from scripts/config/initialBytecodes.ts and uploads each as an initial release
to the VersionController contract.

Optional flags:
  --version-controller <addr>   VersionController address (default: from deployments/)
  --dry-run                     Preview uploads without sending transactions
  --skip-existing               Skip contract types that already have bytecode (default: true)
  --help                        Show this help message

Usage:
  HARDHAT_NETWORK=mainnet npx ts-node scripts/uploadInitialBytecodes.ts
  HARDHAT_NETWORK=mainnet npx ts-node scripts/uploadInitialBytecodes.ts --dry-run
`;

interface CliArgs {
    versionController?: string;
    dryRun: boolean;
    skipExisting: boolean;
    help: boolean;
}

function parseCliArgs(): CliArgs {
    const args = process.argv.slice(2);
    const result: CliArgs = { dryRun: false, skipExisting: true, help: false };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];

        switch (arg) {
            case "--help":
            case "-h":
                result.help = true;
                break;
            case "--version-controller":
                result.versionController = next;
                i++;
                break;
            case "--dry-run":
                result.dryRun = true;
                break;
            case "--no-skip-existing":
                result.skipExisting = false;
                break;
        }
    }

    return result;
}

/**
 * Resolve VersionController address from deployment artifacts or CLI override.
 */
function loadVersionControllerAddress(networkName: string, override?: string): string {
    if (override) return override;

    const deploymentFile = path.join(process.cwd(), "deployments", networkName, "VersionController.json");
    if (fs.existsSync(deploymentFile)) {
        const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
        return deployment.address as string;
    }

    throw new Error(
        `VersionController address not found for network "${networkName}".\n` +
            `Either deploy first or provide --version-controller <address>`
    );
}

/**
 * Load bytecode for a config entry.
 * Uses Hardhat artifacts for `artifactName` entries, or file loading for `bytecodeFile` entries.
 */
async function resolveBytecode(entry: InitialBytecodeEntry): Promise<string> {
    if (entry.artifactName) {
        const artifact = await hre.artifacts.readArtifact(entry.artifactName);
        if (!artifact.bytecode || artifact.bytecode === "0x") {
            throw new Error(
                `Artifact "${entry.artifactName}" has no bytecode. ` +
                    `Is the contract abstract or an interface? Run \`pnpm compile\` first.`
            );
        }
        return artifact.bytecode;
    }

    if (entry.bytecodeFile) {
        return loadBytecodeFromFile(entry.bytecodeFile, entry.jsonKey);
    }

    throw new Error(`Entry for "${entry.contractType}" must specify either artifactName or bytecodeFile`);
}

/**
 * Check if a contract type already has an initial release (major > 0).
 */
async function hasExistingRelease(versionController: any, contractType: string): Promise<boolean> {
    const contractTypeBytes32 = ethers.encodeBytes32String(contractType);
    const latestVersion = await versionController.latestVersions(contractTypeBytes32);
    return latestVersion.major > 0n;
}

async function main() {
    const cliArgs = parseCliArgs();

    if (cliArgs.help) {
        console.log(HELP_TEXT);
        return;
    }

    if (INITIAL_BYTECODES.length === 0) {
        console.log("No entries in initialBytecodes config. Nothing to upload.");
        return;
    }

    console.log("INITIAL BYTECODE UPLOAD");
    console.log("═".repeat(60));

    if (cliArgs.dryRun) {
        console.log("** DRY RUN — no transactions will be sent **");
        console.log("");
    }

    // Network and signer info
    const network = await ethers.provider.getNetwork();
    const [signer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(signer.address);

    console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
    console.log(`Signer:  ${signer.address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        throw new Error("Signer account has no ETH balance");
    }

    // Resolve VersionController address
    const vcAddress = loadVersionControllerAddress(network.name, cliArgs.versionController);
    console.log(`VersionController: ${vcAddress}`);
    console.log("");

    // Get contract instance
    const versionController = await ethers.getContractAt("VersionController", vcAddress);

    // Resolve all bytecodes first (fail fast if any entry is invalid)
    console.log(`Resolving bytecodes for ${INITIAL_BYTECODES.length} entries...`);
    console.log("─".repeat(60));

    const resolvedEntries: { entry: InitialBytecodeEntry; initCode: string }[] = [];

    for (const entry of INITIAL_BYTECODES) {
        if (!entry.contractType) {
            throw new Error("Entry has empty contractType");
        }

        const initCode = await resolveBytecode(entry);
        const bytecodeSize = (initCode.length - 2) / 2;

        const source = entry.artifactName ? `artifact: ${entry.artifactName}` : `file: ${entry.bytecodeFile}`;

        console.log(`  ${entry.contractType}`);
        console.log(`    Source:   ${source}`);
        console.log(`    Size:     ${bytecodeSize.toLocaleString()} bytes`);
        console.log(`    Hash:     ${ethers.keccak256(initCode)}`);

        resolvedEntries.push({ entry, initCode });
    }

    console.log("");
    console.log(`All ${resolvedEntries.length} bytecodes resolved successfully.`);
    console.log("");

    // Upload each bytecode
    console.log("Uploading bytecodes...");
    console.log("═".repeat(60));

    let uploaded = 0;
    let skipped = 0;
    let failed = 0;
    const results: { contractType: string; status: string; txHash?: string; error?: string }[] = [];

    for (let i = 0; i < resolvedEntries.length; i++) {
        const { entry, initCode } = resolvedEntries[i];
        const step = `[${i + 1}/${resolvedEntries.length}]`;

        console.log("");
        console.log(`${step} ${entry.contractType}`);
        console.log("─".repeat(40));

        // Check for existing release
        if (cliArgs.skipExisting) {
            const exists = await hasExistingRelease(versionController, entry.contractType);
            if (exists) {
                console.log(`  Skipped: contract type already has a release`);
                skipped++;
                results.push({ contractType: entry.contractType, status: "skipped (exists)" });
                continue;
            }
        }

        if (cliArgs.dryRun) {
            console.log(`  [DRY RUN] Would upload ${entry.contractType} v1.0.0`);
            console.log(`    Source URL: ${entry.sourceURL}`);
            results.push({ contractType: entry.contractType, status: "dry-run" });
            uploaded++;
            continue;
        }

        try {
            // Validate developer access
            console.log(`  Validating developer access...`);
            await validateDeveloperAccess(versionController, entry.contractType, signer.address);
            console.log(`  Developer access validated`);

            // Upload
            console.log(`  Uploading...`);
            const result = await uploadBytecode(
                versionController,
                {
                    contractType: entry.contractType,
                    releaseType: "initial",
                    initCode,
                    sourceURL: entry.sourceURL
                },
                signer.address
            );

            console.log(`  Uploaded successfully`);
            console.log(`    Tx:       ${result.txHash}`);
            console.log(`    Block:    ${result.blockNumber}`);
            console.log(`    Gas Used: ${result.gasUsed.toString()}`);

            uploaded++;
            results.push({ contractType: entry.contractType, status: "uploaded", txHash: result.txHash });
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`  Failed: ${errorMsg}`);
            failed++;
            results.push({ contractType: entry.contractType, status: "failed", error: errorMsg });
        }
    }

    // Summary
    console.log("");
    console.log("═".repeat(60));
    console.log("UPLOAD SUMMARY");
    console.log("═".repeat(60));
    console.log(`  Total:    ${resolvedEntries.length}`);
    console.log(`  Uploaded: ${uploaded}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Failed:   ${failed}`);
    console.log("");

    for (const r of results) {
        const icon =
            r.status === "uploaded" || r.status === "dry-run" ? "+" : r.status.startsWith("skipped") ? "-" : "!";
        const detail = r.txHash ? ` (${r.txHash})` : r.error ? ` (${r.error})` : "";
        console.log(`  [${icon}] ${r.contractType}: ${r.status}${detail}`);
    }

    console.log("");

    if (failed > 0) {
        console.log(`WARNING: ${failed} upload(s) failed. Review errors above.`);
        process.exit(1);
    }

    console.log("Done.");
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("\nUpload failed:", error);
            process.exit(1);
        });
}

export default main;
