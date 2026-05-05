/**
 * Core audit report submission utilities for VersionController.
 *
 * Reusable module for developers to submit auditor-signed audit reports on-chain
 * via `verifyBytecode()`. The auditor signs off-chain (see signAuditReport.ts),
 * and the developer submits the signature on-chain using this module.
 *
 * @example
 * ```typescript
 * import { ethers } from "hardhat";
 * import { submitAuditReport } from "./utils/submitAuditReport";
 *
 * const vc = await ethers.getContractAt("VersionController", "0x...");
 * const [developer] = await ethers.getSigners();
 *
 * const result = await submitAuditReport(vc, {
 *     contractType: "Comet",
 *     major: 1, minor: 0, patch: 0, alternative: "",
 *     auditReportURL: "https://audits.firm.com/comet-v1.0.0-report.pdf",
 *     signature: "0xabc123..."
 * }, developer.address);
 * ```
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access,
    @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { ethers } from "hardhat";
import { validateDeveloperAccess } from "./uploadBytecode";
import { validateAuditorRole } from "./signAuditReport";

export interface SubmitAuditReportParams {
    /** Human-readable contract type name (e.g., "Comet"). Max 31 chars. */
    contractType: string;
    /** Major version number. */
    major: number;
    /** Minor version number. */
    minor: number;
    /** Patch version number. */
    patch: number;
    /** Alternative version label. Empty string for standard versions. */
    alternative: string;
    /** URL to the audit report. Must match what the auditor signed. */
    auditReportURL: string;
    /** EIP-712 signature produced by the auditor via signAuditReport. */
    signature: string;
}

export interface SubmitAuditReportResult {
    txHash: string;
    blockNumber: number;
    contractType: string;
    version: string;
    recoveredAuditor: string;
    gasUsed: bigint;
}

/**
 * Validate submit audit report parameters.
 */
export function validateSubmitAuditParams(params: SubmitAuditReportParams): void {
    if (!params.contractType) throw new Error("--contract-type is required");
    if (params.major < 0 || !Number.isInteger(params.major)) throw new Error("--major must be a non-negative integer");
    if (params.minor < 0 || !Number.isInteger(params.minor)) throw new Error("--minor must be a non-negative integer");
    if (params.patch < 0 || !Number.isInteger(params.patch)) throw new Error("--patch must be a non-negative integer");
    if (!params.auditReportURL) throw new Error("--audit-report-url is required");
    if (!params.signature) throw new Error("--signature is required");
    if (!params.signature.startsWith("0x")) throw new Error("--signature must be 0x-prefixed hex");

    if (new TextEncoder().encode(params.contractType).length > 31) {
        throw new Error(`Contract type "${params.contractType}" exceeds 31 bytes (bytes32 limit)`);
    }
}

/**
 * Format version string for display.
 */
export function formatVersion(params: SubmitAuditReportParams): string {
    const base = `${params.major}.${params.minor}.${params.patch}`;
    return params.alternative ? `${base}-${params.alternative}` : base;
}

/**
 * Recover the auditor address from the EIP-712 signature off-chain.
 *
 * Reconstructs the same EIP-712 typed data that the auditor signed, then uses
 * `ethers.verifyTypedData` to recover the signer address. This allows the developer
 * to verify who signed before sending the transaction.
 *
 * @param versionController - VersionController contract instance
 * @param params - Submission parameters including signature
 * @returns Recovered auditor address
 */
export async function recoverAuditorAddress(versionController: any, params: SubmitAuditReportParams): Promise<string> {
    const contractTypeBytes32 = ethers.encodeBytes32String(params.contractType);
    const version = {
        version: { major: params.major, minor: params.minor, patch: params.patch },
        alternative: params.alternative
    };

    const bytecodeVersionHash: string = await versionController.computeBytecodeHash(contractTypeBytes32, version);
    const bytecodeData = await versionController.bytecodes(bytecodeVersionHash);
    const initCodeHash: string = bytecodeData.initCodeHash;

    if (initCodeHash === ethers.ZeroHash) {
        throw new Error(
            `No bytecode found for ${params.contractType} v${formatVersion(params)}.\n` +
                `Ensure the version has been released before submitting an audit report.`
        );
    }

    const vcAddress = await versionController.getAddress();
    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
        name: "VersionController",
        version: "1",
        chainId,
        verifyingContract: vcAddress
    };

    const types = {
        AuditReport: [
            { name: "bytecodeVersionHash", type: "bytes32" },
            { name: "bytecodeHash", type: "bytes32" },
            { name: "auditReport", type: "string" }
        ]
    };

    const values = {
        bytecodeVersionHash,
        bytecodeHash: initCodeHash,
        auditReport: params.auditReportURL
    };

    return ethers.verifyTypedData(domain, types, values, params.signature);
}

/**
 * Submit an auditor-signed audit report on-chain via `verifyBytecode()`.
 *
 * Validates developer access, recovers the auditor address from the signature,
 * verifies the auditor has AUDITOR_ROLE, then sends the on-chain transaction.
 *
 * @param versionController - VersionController contract instance
 * @param params - Submission parameters (contract type, version, audit report URL, signature)
 * @param signerAddress - Address of the developer submitting the report
 * @returns Transaction result with hash, block number, recovered auditor, and gas used
 */
export async function submitAuditReport(
    versionController: any,
    params: SubmitAuditReportParams,
    signerAddress: string
): Promise<SubmitAuditReportResult> {
    validateSubmitAuditParams(params);

    // Validate developer access for this contract type
    await validateDeveloperAccess(versionController, params.contractType, signerAddress);

    // Recover auditor address from signature and validate role
    const recoveredAuditor = await recoverAuditorAddress(versionController, params);
    await validateAuditorRole(versionController, recoveredAuditor);

    const contractTypeBytes32 = ethers.encodeBytes32String(params.contractType);
    const bytecodeVersion = {
        contractType: contractTypeBytes32,
        version: {
            version: { major: params.major, minor: params.minor, patch: params.patch },
            alternative: params.alternative
        }
    };

    const tx = await versionController.verifyBytecode(bytecodeVersion, params.auditReportURL, params.signature);
    const receipt = await tx.wait(1);

    return {
        txHash: receipt!.hash,
        blockNumber: receipt!.blockNumber,
        contractType: params.contractType,
        version: formatVersion(params),
        recoveredAuditor,
        gasUsed: receipt!.gasUsed
    };
}
