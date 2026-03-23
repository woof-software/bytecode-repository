/**
 * Bytecode Upload Script
 *
 * Uploads bytecode to the VersionController contract with support for all release types.
 *
 * Bytecode File Formats:
 *   The --bytecode-file flag accepts:
 *   - Hardhat artifact:  artifacts/contracts/Foo.sol/Foo.json  (auto-detects `bytecode` field)
 *   - Foundry artifact:  out/Foo.sol/Foo.json                  (auto-detects `bytecode.object` field)
 *   - Custom JSON:       use --json-key to specify which field  (e.g., --json-key CometInitCode)
 *   - Raw hex file:      .hex or .bin files containing the bytecode as a hex string
 *
 * Usage:
 *   # Initial release (creates version 1.0.0)
 *   npx hardhat run scripts/cli/uploadBytecode.ts --network ethereum -- \
 *     --contract-type Comet \
 *     --release-type initial \
 *     --source-url "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol" \
 *     --bytecode-file artifacts/contracts/Comet.sol/Comet.json
 *
 *   # Major version release
 *   npx hardhat run scripts/cli/uploadBytecode.ts --network ethereum -- \
 *     --contract-type Comet --release-type major \
 *     --source-url "..." --bytecode-file artifacts/contracts/CometV2.sol/CometV2.json
 *
 *   # Minor version release (under major version 1)
 *   npx hardhat run scripts/cli/uploadBytecode.ts --network ethereum -- \
 *     --contract-type Comet --release-type minor --major 1 \
 *     --source-url "..." --bytecode-file path/to/bytecode.json
 *
 *   # Patch version release (under version 1.2.x)
 *   npx hardhat run scripts/cli/uploadBytecode.ts --network ethereum -- \
 *     --contract-type Comet --release-type patch --major 1 --minor 2 \
 *     --source-url "..." --bytecode-file path/to/bytecode.json
 *
 *   # Alternative version (creates 1.0.0-optimized)
 *   npx hardhat run scripts/cli/uploadBytecode.ts --network ethereum -- \
 *     --contract-type Comet --release-type alternative \
 *     --major 1 --minor 0 --patch 0 --alternative optimized \
 *     --source-url "..." --bytecode-file path/to/bytecode.json
 *
 *   # Using custom JSON with specific key
 *   npx hardhat run scripts/cli/uploadBytecode.ts --network ethereum -- \
 *     --contract-type Comet --release-type initial \
 *     --source-url "..." \
 *     --bytecode-file bytecodes/contracts.json --json-key CometInitCode
 *
 *   # With explicit VersionController address
 *   npx hardhat run scripts/cli/uploadBytecode.ts --network ethereum -- \
 *     --version-controller 0x1234...abcd \
 *     --contract-type Comet --release-type initial \
 *     --source-url "..." --bytecode-file path/to/bytecode.json
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access,
    @typescript-eslint/no-non-null-assertion, @typescript-eslint/restrict-template-expressions,
    @typescript-eslint/use-unknown-in-catch-callback-variable */

import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import {
    uploadBytecode,
    loadBytecodeFromFile,
    formatTargetVersion,
    validateDeveloperAccess,
    VALID_RELEASE_TYPES,
    ReleaseType,
    UploadBytecodeParams
} from "../utils/uploadBytecode";

const HELP_TEXT = `
Bytecode Upload Script — uploads bytecode to VersionController

Required flags:
  --contract-type <name>        Contract type name (e.g., "Comet", "CometExt")
  --release-type <type>         One of: ${VALID_RELEASE_TYPES.join(", ")}
  --source-url <url>            Source code URL
  --bytecode-file <path>        Path to bytecode file (see formats below)

Version flags (depend on release type):
  --major <n>                   Major version (required for: minor, patch, alternative)
  --minor <n>                   Minor version (required for: patch, alternative)
  --patch <n>                   Patch version (required for: alternative)
  --alternative <label>         Alternative label (required for: alternative)

Optional flags:
  --json-key <key>              Key to extract bytecode from JSON file
  --version-controller <addr>   VersionController address (default: from deployments/)
  --help                        Show this help message

Supported bytecode file formats:
  Hardhat artifact (.json)      Auto-detects 'bytecode' field
  Foundry artifact (.json)      Auto-detects 'bytecode.object' field
  Custom JSON (.json)           Use --json-key to specify field name
  Raw hex (.hex, .bin)          Reads entire content as hex string

Examples:
  # Initial release from Hardhat artifact
  npx hardhat run scripts/cli/uploadBytecode.ts --network ethereum -- \\
    --contract-type Comet --release-type initial \\
    --source-url "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol" \\
    --bytecode-file artifacts/contracts/Comet.sol/Comet.json

  # Patch release
  npx hardhat run scripts/cli/uploadBytecode.ts --network ethereum -- \\
    --contract-type Comet --release-type patch --major 1 --minor 0 \\
    --source-url "https://github.com/..." --bytecode-file path/to/bytecode.json
`;

interface CliArgs {
    contractType?: string;
    releaseType?: string;
    sourceURL?: string;
    bytecodeFile?: string;
    jsonKey?: string;
    major?: string;
    minor?: string;
    patch?: string;
    alternative?: string;
    versionController?: string;
    help?: boolean;
}

/**
 * Parse CLI arguments. Unknown flags are silently ignored (e.g., --network consumed by Hardhat).
 */
function parseCliArgs(): CliArgs {
    const args = process.argv.slice(2);
    const result: CliArgs = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];

        switch (arg) {
            case "--help":
            case "-h":
                result.help = true;
                break;
            case "--contract-type":
                result.contractType = next;
                i++;
                break;
            case "--release-type":
                result.releaseType = next;
                i++;
                break;
            case "--source-url":
                result.sourceURL = next;
                i++;
                break;
            case "--bytecode-file":
                result.bytecodeFile = next;
                i++;
                break;
            case "--json-key":
                result.jsonKey = next;
                i++;
                break;
            case "--major":
                result.major = next;
                i++;
                break;
            case "--minor":
                result.minor = next;
                i++;
                break;
            case "--patch":
                result.patch = next;
                i++;
                break;
            case "--alternative":
                result.alternative = next;
                i++;
                break;
            case "--version-controller":
                result.versionController = next;
                i++;
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

async function main() {
    const cliArgs = parseCliArgs();

    if (cliArgs.help) {
        console.log(HELP_TEXT);
        return;
    }

    // Validate required flags
    const missing: string[] = [];
    if (!cliArgs.contractType) missing.push("--contract-type");
    if (!cliArgs.releaseType) missing.push("--release-type");
    if (!cliArgs.sourceURL) missing.push("--source-url");
    if (!cliArgs.bytecodeFile) missing.push("--bytecode-file");

    if (missing.length > 0) {
        console.error(`Missing required flags: ${missing.join(", ")}`);
        console.error("Run with --help for usage information.");
        process.exit(1);
    }

    console.log("BYTECODE UPLOAD");
    console.log("═".repeat(60));

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

    // Load bytecode from file
    console.log(`Loading bytecode from: ${cliArgs.bytecodeFile}`);
    const initCode = loadBytecodeFromFile(cliArgs.bytecodeFile!, cliArgs.jsonKey);
    const bytecodeSize = (initCode.length - 2) / 2; // subtract "0x", each byte = 2 hex chars
    console.log(`Bytecode size: ${bytecodeSize.toLocaleString()} bytes`);
    console.log("");

    // Build upload params
    const params: UploadBytecodeParams = {
        contractType: cliArgs.contractType!,
        releaseType: cliArgs.releaseType! as ReleaseType,
        initCode,
        sourceURL: cliArgs.sourceURL!,
        major: cliArgs.major !== undefined ? Number(cliArgs.major) : undefined,
        minor: cliArgs.minor !== undefined ? Number(cliArgs.minor) : undefined,
        patch: cliArgs.patch !== undefined ? Number(cliArgs.patch) : undefined,
        alternative: cliArgs.alternative
    };

    // Pre-flight summary
    console.log("Upload Summary:");
    console.log("─".repeat(40));
    console.log(`  Contract Type: ${params.contractType}`);
    console.log(`  Release Type:  ${params.releaseType}`);
    console.log(`  Target:        ${formatTargetVersion(params)}`);
    console.log(`  Source URL:    ${params.sourceURL}`);
    console.log(`  Bytecode Hash: ${ethers.keccak256(initCode)}`);
    console.log("");

    // Get contract instance
    const versionController = await ethers.getContractAt("VersionController", vcAddress);

    // Validate developer access before sending tx
    console.log("Validating developer access...");
    await validateDeveloperAccess(versionController, params.contractType, signer.address);
    console.log("  Developer access validated");
    console.log("");

    // Execute upload
    console.log("Uploading bytecode...");
    const result = await uploadBytecode(versionController, params, signer.address);

    console.log("");
    console.log("Upload successful!");
    console.log("─".repeat(40));
    console.log(`  Transaction:   ${result.txHash}`);
    console.log(`  Block:         ${result.blockNumber}`);
    console.log(`  Gas Used:      ${result.gasUsed.toString()}`);
    console.log(`  Contract Type: ${result.contractType} (${result.contractTypeBytes32})`);
    console.log("");
    console.log("═".repeat(60));
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
