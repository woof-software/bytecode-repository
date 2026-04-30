/**
 * Audit Report Submission Script
 *
 * Submits an auditor-signed audit report on-chain via `verifyBytecode()` on the
 * VersionController contract. The developer provides the auditor's EIP-712 signature
 * (generated via signAuditReport.ts) along with the bytecode version and report URL.
 *
 * Pre-transaction validations:
 *   - Signer is a developer assigned to the contract type
 *   - Auditor address recovered from signature has AUDITOR_ROLE
 *   - Bytecode version exists on-chain
 *
 * Usage:
 *   Note: Hardhat's `run` command does not pass CLI flags through to the script.
 *   Run the script directly with ts-node and set HARDHAT_NETWORK to select the network.
 *
 *   # Submit audit report for Comet v1.0.0
 *   HARDHAT_NETWORK=ethereum npx ts-node scripts/cli/submitAuditReport.ts \
 *     --contract-type Comet \
 *     --major 1 --minor 0 --patch 0 \
 *     --audit-report-url "https://audits.firm.com/comet-v1.0.0-report.pdf" \
 *     --signature 0xabc123...
 *
 *   # Submit for an alternative version
 *   HARDHAT_NETWORK=ethereum npx ts-node scripts/cli/submitAuditReport.ts \
 *     --contract-type Comet \
 *     --major 1 --minor 0 --patch 0 --alternative gas-optimized \
 *     --audit-report-url "https://audits.firm.com/comet-gas-optimized-report.pdf" \
 *     --signature 0xabc123...
 *
 *   # With explicit VersionController address
 *   HARDHAT_NETWORK=ethereum npx ts-node scripts/cli/submitAuditReport.ts \
 *     --version-controller 0x1234...abcd \
 *     --contract-type Comet \
 *     --major 1 --minor 0 --patch 0 \
 *     --audit-report-url "https://audits.firm.com/report.pdf" \
 *     --signature 0xabc123...
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access,
    @typescript-eslint/no-non-null-assertion, @typescript-eslint/restrict-template-expressions,
    @typescript-eslint/use-unknown-in-catch-callback-variable */

import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import {
    submitAuditReport,
    recoverAuditorAddress,
    formatVersion,
    SubmitAuditReportParams
} from "../utils/submitAuditReport";

const HELP_TEXT = `
Audit Report Submission Script — submits auditor signature on-chain via verifyBytecode()

A developer calls this after receiving an EIP-712 signature from an auditor
(generated via scripts/cli/signAuditReport.ts).

Required flags:
  --contract-type <name>        Contract type name (e.g., "Comet", "CometExt")
  --major <n>                   Major version number
  --minor <n>                   Minor version number
  --patch <n>                   Patch version number
  --audit-report-url <url>      URL to the audit report (must match what the auditor signed)
  --signature <hex>             0x-prefixed EIP-712 signature from the auditor

Optional flags:
  --alternative <label>         Alternative version label (default: "")
  --version-controller <addr>   VersionController address (default: from deployments/)
  --help                        Show this help message

Examples:
  # Submit audit report for Comet v1.0.0
  HARDHAT_NETWORK=ethereum npx ts-node scripts/cli/submitAuditReport.ts \\
    --contract-type Comet --major 1 --minor 0 --patch 0 \\
    --audit-report-url "https://audits.firm.com/comet-v1.0.0-report.pdf" \\
    --signature 0xabc123...def456

  # Submit for an alternative version
  HARDHAT_NETWORK=ethereum npx ts-node scripts/cli/submitAuditReport.ts \\
    --contract-type Comet --major 1 --minor 0 --patch 0 --alternative gas-optimized \\
    --audit-report-url "https://audits.firm.com/comet-gas-optimized-report.pdf" \\
    --signature 0xabc123...def456
`;

interface CliArgs {
    contractType?: string;
    major?: string;
    minor?: string;
    patch?: string;
    alternative?: string;
    auditReportURL?: string;
    signature?: string;
    versionController?: string;
    help?: boolean;
}

/**
 * Parse CLI arguments. Unknown flags are silently ignored.
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
            case "--audit-report-url":
                result.auditReportURL = next;
                i++;
                break;
            case "--signature":
                result.signature = next;
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
    if (cliArgs.major === undefined) missing.push("--major");
    if (cliArgs.minor === undefined) missing.push("--minor");
    if (cliArgs.patch === undefined) missing.push("--patch");
    if (!cliArgs.auditReportURL) missing.push("--audit-report-url");
    if (!cliArgs.signature) missing.push("--signature");

    if (missing.length > 0) {
        console.error(`Missing required flags: ${missing.join(", ")}`);
        console.error("Run with --help for usage information.");
        process.exit(1);
    }

    console.log("AUDIT REPORT SUBMISSION");
    console.log("═".repeat(60));

    // Network and signer info
    const networkInfo = await ethers.provider.getNetwork();
    const [signer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(signer.address);

    console.log(`Network:   ${networkInfo.name} (Chain ID: ${networkInfo.chainId})`);
    console.log(`Developer: ${signer.address}`);
    console.log(`Balance:   ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        throw new Error("Signer account has no ETH balance");
    }

    // Resolve VersionController address
    const vcAddress = loadVersionControllerAddress(networkInfo.name, cliArgs.versionController);
    console.log(`VersionController: ${vcAddress}`);
    console.log("");

    // Build params
    const params: SubmitAuditReportParams = {
        contractType: cliArgs.contractType!,
        major: Number(cliArgs.major),
        minor: Number(cliArgs.minor),
        patch: Number(cliArgs.patch),
        alternative: cliArgs.alternative ?? "",
        auditReportURL: cliArgs.auditReportURL!,
        signature: cliArgs.signature!
    };

    // Get contract instance
    const versionController = await ethers.getContractAt("VersionController", vcAddress);

    // Recover auditor from signature for display
    console.log("Verifying signature...");
    const recoveredAuditor = await recoverAuditorAddress(versionController, params);

    // Pre-flight summary
    console.log("");
    console.log("Submission Summary:");
    console.log("─".repeat(40));
    console.log(`  Contract Type:    ${params.contractType}`);
    console.log(`  Version:          ${formatVersion(params)}`);
    console.log(`  Audit Report URL: ${params.auditReportURL}`);
    console.log(`  Recovered Auditor: ${recoveredAuditor}`);
    console.log(`  Signature:        ${params.signature.slice(0, 20)}...${params.signature.slice(-16)}`);
    console.log("");

    // Validate and submit
    console.log("Validating developer access...");
    console.log("Validating auditor role...");
    console.log("Submitting audit report on-chain...");
    const result = await submitAuditReport(versionController, params, signer.address);

    console.log("");
    console.log("Audit report submitted successfully!");
    console.log("─".repeat(40));
    console.log(`  Transaction:       ${result.txHash}`);
    console.log(`  Block:             ${result.blockNumber}`);
    console.log(`  Gas Used:          ${result.gasUsed.toString()}`);
    console.log(`  Contract Type:     ${result.contractType}`);
    console.log(`  Version:           ${result.version}`);
    console.log(`  Verified Auditor:  ${result.recoveredAuditor}`);
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
            console.error("\nSubmission failed:", error);
            process.exit(1);
        });
}

export default main;
