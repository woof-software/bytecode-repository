/**
 * Core audit report signing utilities for VersionController.
 *
 * Reusable module for generating EIP-712 audit report signatures.
 * The auditor signs off-chain, then a developer submits the signature
 * on-chain via `verifyBytecode()`.
 *
 * @example
 * ```typescript
 * import { ethers } from "hardhat";
 * import { signAuditReport } from "./utils/signAuditReport";
 *
 * const vc = await ethers.getContractAt("VersionController", "0x...");
 * const [auditor] = await ethers.getSigners();
 *
 * const result = await signAuditReport(vc, auditor, {
 *     contractType: "Comet",
 *     major: 1, minor: 0, patch: 0, alternative: "",
 *     auditReportURL: "https://audits.firm.com/comet-v1.0.0-report.pdf"
 * });
 * console.log(result.signature);
 * ```
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access,
    @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-explicit-any */

import { ethers, network } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export interface SignAuditReportParams {
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
    /** URL to the audit report (e.g., IPFS/Arweave link or PDF URL). */
    auditReportURL: string;
}

export interface SignAuditReportResult {
    signature: string;
    auditorAddress: string;
    contractType: string;
    contractTypeBytes32: string;
    version: string;
    bytecodeVersionHash: string;
    initCodeHash: string;
    auditReportURL: string;
}

/**
 * Validate sign audit report parameters.
 */
export function validateSignAuditParams(params: SignAuditReportParams): void {
    if (!params.contractType) throw new Error("--contract-type is required");
    if (params.major < 0 || !Number.isInteger(params.major)) throw new Error("--major must be a non-negative integer");
    if (params.minor < 0 || !Number.isInteger(params.minor)) throw new Error("--minor must be a non-negative integer");
    if (params.patch < 0 || !Number.isInteger(params.patch)) throw new Error("--patch must be a non-negative integer");
    if (!params.auditReportURL) throw new Error("--audit-report-url is required");

    if (new TextEncoder().encode(params.contractType).length > 31) {
        throw new Error(`Contract type "${params.contractType}" exceeds 31 bytes (bytes32 limit)`);
    }
}

/**
 * Validate that the signer has AUDITOR_ROLE on the VersionController.
 *
 * @param versionController - VersionController contract instance
 * @param signerAddress - Address of the auditor account
 */
export async function validateAuditorRole(versionController: any, signerAddress: string): Promise<void> {
    const AUDITOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AUDITOR_ROLE"));
    const hasRole: boolean = await versionController.hasRole(AUDITOR_ROLE, signerAddress);

    if (!hasRole) {
        throw new Error(
            `Account ${signerAddress} does not have AUDITOR_ROLE.\n` +
                `A governor must grant AUDITOR_ROLE before the account can sign audit reports.`
        );
    }
}

/**
 * Format version string for display.
 */
export function formatVersion(params: SignAuditReportParams): string {
    const base = `${params.major}.${params.minor}.${params.patch}`;
    return params.alternative ? `${base}-${params.alternative}` : base;
}

/**
 * Sign an audit report using EIP-712 typed data.
 *
 * Retrieves on-chain bytecode data, validates the auditor role, constructs the
 * EIP-712 domain and types, and produces a signature that can be submitted
 * on-chain via `verifyBytecode()`.
 *
 * @param versionController - VersionController contract instance
 * @param auditor - Signer with AUDITOR_ROLE
 * @param params - Audit report parameters (contract type, version, report URL)
 * @returns Signature and metadata for on-chain submission
 */
export async function signAuditReport(
    versionController: any,
    auditor: HardhatEthersSigner,
    params: SignAuditReportParams
): Promise<SignAuditReportResult> {
    validateSignAuditParams(params);

    const auditorAddress = await auditor.getAddress();

    // Validate auditor role
    await validateAuditorRole(versionController, auditorAddress);

    const contractTypeBytes32 = ethers.encodeBytes32String(params.contractType);
    const version = {
        version: { major: params.major, minor: params.minor, patch: params.patch },
        alternative: params.alternative
    };

    // Compute bytecodeVersionHash from contract type and version
    const bytecodeVersionHash: string = await versionController.computeBytecodeHash(contractTypeBytes32, version);

    // Retrieve stored bytecode to get initCodeHash
    const bytecodeData = await versionController.bytecodes(bytecodeVersionHash);
    const initCodeHash: string = bytecodeData.initCodeHash;

    if (initCodeHash === ethers.ZeroHash) {
        throw new Error(
            `No bytecode found for ${params.contractType} v${formatVersion(params)}.\n` +
                `Ensure the version has been released before signing an audit report.`
        );
    }

    // EIP-712 domain matching VersionController's EIP5267 implementation
    const vcAddress = await versionController.getAddress();
    const domain = {
        name: "VersionController",
        version: "1",
        chainId: network.config.chainId,
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

    // Sign EIP-712 typed data
    const signature = await auditor.signTypedData(domain, types, values);

    return {
        signature,
        auditorAddress,
        contractType: params.contractType,
        contractTypeBytes32,
        version: formatVersion(params),
        bytecodeVersionHash,
        initCodeHash,
        auditReportURL: params.auditReportURL
    };
}
