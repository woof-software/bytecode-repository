/**
 * Audit Report Signing Script
 *
 * Generates an EIP-712 signature for an audit report on a specific bytecode version.
 * The auditor signs off-chain; a developer then submits the signature on-chain via
 * `verifyBytecode()` on the VersionController contract.
 *
 * Usage:
 *   Note: Hardhat's `run` command does not pass CLI flags through to the script.
 *   Run the script directly with ts-node and set HARDHAT_NETWORK to select the network.
 *
 *   # Sign audit report for version 1.0.0
 *   HARDHAT_NETWORK=ethereum npx ts-node scripts/cli/signAuditReport.ts \
 *     --contract-type Comet \
 *     --major 1 --minor 0 --patch 0 \
 *     --audit-report-url "https://audits.firm.com/comet-v1.0.0-report.pdf"
 *
 *   # Sign audit report for an alternative version
 *   HARDHAT_NETWORK=ethereum npx ts-node scripts/cli/signAuditReport.ts \
 *     --contract-type Comet \
 *     --major 1 --minor 0 --patch 0 --alternative gas-optimized \
 *     --audit-report-url "https://audits.firm.com/comet-v1.0.0-gas-optimized-report.pdf"
 *
 *   # With explicit VersionController address
 *   HARDHAT_NETWORK=ethereum npx ts-node scripts/cli/signAuditReport.ts \
 *     --version-controller 0x1234...abcd \
 *     --contract-type Comet \
 *     --major 1 --minor 0 --patch 0 \
 *     --audit-report-url "https://audits.firm.com/report.pdf"
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access,
    @typescript-eslint/no-non-null-assertion, @typescript-eslint/restrict-template-expressions,
    @typescript-eslint/use-unknown-in-catch-callback-variable */

import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { signAuditReport, formatVersion, SignAuditReportParams } from "../utils/signAuditReport";

const HELP_TEXT = `
Audit Report Signing Script — generates EIP-712 signature for bytecode audit reports

The auditor signs off-chain. A developer then submits the signature on-chain
via verifyBytecode() on the VersionController contract.

Required flags:
  --contract-type <name>        Contract type name (e.g., "Comet", "CometExt")
  --major <n>                   Major version number
  --minor <n>                   Minor version number
  --patch <n>                   Patch version number
  --audit-report-url <url>      URL to the audit report

Optional flags:
  --alternative <label>         Alternative version label (default: "")
  --version-controller <addr>   VersionController address (default: from deployments/)
  --help                        Show this help message

Examples:
  # Sign audit for Comet v1.0.0
  HARDHAT_NETWORK=ethereum npx ts-node scripts/cli/signAuditReport.ts \\
    --contract-type Comet --major 1 --minor 0 --patch 0 \\
    --audit-report-url "https://audits.firm.com/comet-v1.0.0-report.pdf"

  # Sign audit for an alternative version
  HARDHAT_NETWORK=ethereum npx ts-node scripts/cli/signAuditReport.ts \\
    --contract-type Comet --major 1 --minor 0 --patch 0 --alternative gas-optimized \\
    --audit-report-url "https://audits.firm.com/comet-gas-optimized-report.pdf"
`;

interface CliArgs {
    contractType?: string;
    major?: string;
    minor?: string;
    patch?: string;
    alternative?: string;
    auditReportURL?: string;
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

    if (missing.length > 0) {
        console.error(`Missing required flags: ${missing.join(", ")}`);
        console.error("Run with --help for usage information.");
        process.exit(1);
    }

    console.log("AUDIT REPORT SIGNING");
    console.log("═".repeat(60));

    // Network and signer info
    const networkInfo = await ethers.provider.getNetwork();
    const [signer] = await ethers.getSigners();

    console.log(`Network: ${networkInfo.name} (Chain ID: ${networkInfo.chainId})`);
    console.log(`Auditor: ${signer.address}`);
    console.log("");

    // Resolve VersionController address
    const vcAddress = loadVersionControllerAddress(networkInfo.name, cliArgs.versionController);
    console.log(`VersionController: ${vcAddress}`);
    console.log("");

    // Build params
    const params: SignAuditReportParams = {
        contractType: cliArgs.contractType!,
        major: Number(cliArgs.major),
        minor: Number(cliArgs.minor),
        patch: Number(cliArgs.patch),
        alternative: cliArgs.alternative ?? "",
        auditReportURL: cliArgs.auditReportURL!
    };

    // Pre-flight summary
    console.log("Signing Summary:");
    console.log("─".repeat(40));
    console.log(`  Contract Type:    ${params.contractType}`);
    console.log(`  Version:          ${formatVersion(params)}`);
    console.log(`  Audit Report URL: ${params.auditReportURL}`);
    console.log("");

    // Get contract instance and sign
    const versionController = await ethers.getContractAt("VersionController", vcAddress);

    console.log("Validating auditor role...");
    console.log("Retrieving on-chain bytecode data...");
    const result = await signAuditReport(versionController, signer, params);

    console.log("");
    console.log("Signature generated successfully!");
    console.log("═".repeat(60));
    console.log("");
    console.log("Signature Output:");
    console.log("─".repeat(40));
    console.log(`  Signature:             ${result.signature}`);
    console.log("");
    console.log("Metadata:");
    console.log(`  Auditor:               ${result.auditorAddress}`);
    console.log(`  Contract Type:         ${result.contractType} (${result.contractTypeBytes32})`);
    console.log(`  Version:               ${result.version}`);
    console.log(`  Bytecode Version Hash: ${result.bytecodeVersionHash}`);
    console.log(`  Init Code Hash:        ${result.initCodeHash}`);
    console.log(`  Audit Report URL:      ${result.auditReportURL}`);
    console.log("");
    console.log("Next step: A developer submits this signature on-chain:");
    console.log("  versionController.verifyBytecode(bytecodeVersion, auditReportURL, signature)");
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
            console.error("\nSigning failed:", error);
            process.exit(1);
        });
}

export default main;
