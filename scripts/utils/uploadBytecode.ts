/**
 * Core bytecode upload utilities for VersionController.
 *
 * Reusable module for uploading bytecode to the VersionController contract.
 * Import these functions in batch upload scripts for programmatic access.
 *
 * @example
 * ```typescript
 * import { ethers } from "hardhat";
 * import { uploadBytecode, loadBytecodeFromFile } from "./utils/uploadBytecode";
 *
 * const vc = await ethers.getContractAt("VersionController", "0x...");
 * const results = [];
 *
 * for (const entry of batch) {
 *     const result = await uploadBytecode(vc, {
 *         contractType: entry.contractType,
 *         releaseType: "initial",
 *         initCode: loadBytecodeFromFile(entry.bytecodeFile),
 *         sourceURL: entry.sourceURL
 *     });
 *     results.push(result);
 * }
 * ```
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access,
    @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-non-null-assertion, @typescript-eslint/restrict-template-expressions,
    @typescript-eslint/no-explicit-any */

import { ethers } from "hardhat";
import { readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";

export type ReleaseType = "initial" | "major" | "minor" | "patch" | "alternative";

export const VALID_RELEASE_TYPES: ReleaseType[] = ["initial", "major", "minor", "patch", "alternative"];

export interface UploadBytecodeParams {
    /** Human-readable contract type name (e.g., "Comet"). Encoded to bytes32 internally. Max 31 chars. */
    contractType: string;
    /** Release type determining which VersionController function to call. */
    releaseType: ReleaseType;
    /** 0x-prefixed hex-encoded init code (creation bytecode). */
    initCode: string;
    /** URL to source code repository. Must not be empty. */
    sourceURL: string;
    /** Major version number. Required for: minor, patch, alternative. */
    major?: number;
    /** Minor version number. Required for: patch, alternative. */
    minor?: number;
    /** Patch version number. Required for: alternative. */
    patch?: number;
    /** Alternative version label. Required for: alternative. */
    alternative?: string;
}

export interface UploadBytecodeResult {
    txHash: string;
    blockNumber: number;
    contractType: string;
    contractTypeBytes32: string;
    releaseType: ReleaseType;
    gasUsed: bigint;
}

/**
 * Load bytecode from a file.
 *
 * Supported formats:
 * - Hardhat artifact JSON (`artifacts/contracts/Foo.sol/Foo.json`): auto-detects `bytecode` field
 * - Foundry artifact JSON (`out/Foo.sol/Foo.json`): auto-detects `bytecode.object` field
 * - Custom JSON: use `jsonKey` parameter to specify which field contains the bytecode
 * - Raw hex file (`.hex`, `.bin`): reads entire file content as hex string
 *
 * @param filePath - Path to the bytecode file (relative or absolute)
 * @param jsonKey - Optional key to extract from a JSON file
 * @returns 0x-prefixed hex string of the bytecode
 */
export function loadBytecodeFromFile(filePath: string, jsonKey?: string): string {
    const absPath = resolve(filePath);
    if (!existsSync(absPath)) {
        throw new Error(`Bytecode file not found: ${absPath}`);
    }

    const content = readFileSync(absPath, "utf8").trim();
    const ext = extname(absPath).toLowerCase();

    if (ext === ".json") {
        const json: Record<string, any> = JSON.parse(content);

        // Explicit key specified
        if (jsonKey) {
            if (!(jsonKey in json)) {
                throw new Error(
                    `Key "${jsonKey}" not found in ${absPath}. Available keys: ${Object.keys(json).join(", ")}`
                );
            }
            return normalizeBytecode(json[jsonKey]);
        }

        // Hardhat artifact (has _format or abi + bytecode string)
        if (json._format?.startsWith("hh-sol-artifact") || (json.abi && typeof json.bytecode === "string")) {
            return normalizeBytecode(json.bytecode);
        }

        // Foundry artifact (bytecode.object)
        if (json.bytecode?.object) {
            return normalizeBytecode(json.bytecode.object);
        }

        // Common field names
        for (const key of ["bytecode", "initCode", "bin"]) {
            if (key in json && typeof json[key] === "string") {
                return normalizeBytecode(json[key]);
            }
        }

        throw new Error(
            `Could not auto-detect bytecode in ${absPath}. ` +
                `Use --json-key to specify the field. Available keys: ${Object.keys(json).join(", ")}`
        );
    }

    // Raw hex file (.hex, .bin, or any other extension)
    return normalizeBytecode(content);
}

function normalizeBytecode(hex: string): string {
    const trimmed = hex.trim();
    return trimmed.startsWith("0x") ? trimmed : "0x" + trimmed;
}

/**
 * Validate upload parameters before sending a transaction.
 * Throws descriptive errors for invalid or missing parameters.
 */
export function validateUploadParams(params: UploadBytecodeParams): void {
    if (!params.contractType) throw new Error("--contract-type is required");
    if (!params.initCode || params.initCode === "0x") throw new Error("Bytecode is empty");
    if (!params.sourceURL) throw new Error("--source-url is required");
    if (!params.initCode.startsWith("0x")) throw new Error("Bytecode must be 0x-prefixed hex");

    if (new TextEncoder().encode(params.contractType).length > 31) {
        throw new Error(`Contract type "${params.contractType}" exceeds 31 bytes (bytes32 limit)`);
    }

    switch (params.releaseType) {
        case "initial":
        case "major":
            break;
        case "minor":
            if (params.major === undefined) throw new Error("--major is required for minor release");
            break;
        case "patch":
            if (params.major === undefined) throw new Error("--major is required for patch release");
            if (params.minor === undefined) throw new Error("--minor is required for patch release");
            break;
        case "alternative":
            if (params.major === undefined) throw new Error("--major is required for alternative release");
            if (params.minor === undefined) throw new Error("--minor is required for alternative release");
            if (params.patch === undefined) throw new Error("--patch is required for alternative release");
            if (!params.alternative) throw new Error("--alternative label is required for alternative release");
            break;
        default:
            throw new Error(
                `Invalid release type: "${params.releaseType}". ` + `Must be one of: ${VALID_RELEASE_TYPES.join(", ")}`
            );
    }
}

/**
 * Format the target version string for display purposes.
 */
export function formatTargetVersion(params: UploadBytecodeParams): string {
    switch (params.releaseType) {
        case "initial":
            return "1.0.0 (initial release)";
        case "major":
            return "next major version";
        case "minor":
            return `next minor under major ${params.major}`;
        case "patch":
            return `next patch under ${params.major}.${params.minor}`;
        case "alternative":
            return `${params.major}.${params.minor}.${params.patch}-${params.alternative}`;
    }
}

/**
 * Validate that the signer has permission to upload bytecode for the given contract type.
 *
 * Checks on-chain state before sending a transaction:
 * 1. Signer has KEY_DEVELOPER_ROLE or SUB_DEVELOPER_ROLE
 * 2. Signer (or their key developer, if sub-dev) is assigned to the contract type
 *
 * @param versionController - VersionController contract instance
 * @param contractType - Human-readable contract type name
 * @param signerAddress - Address of the account that will send the transaction
 */
export async function validateDeveloperAccess(
    versionController: any,
    contractType: string,
    signerAddress: string
): Promise<void> {
    const contractTypeBytes32 = ethers.encodeBytes32String(contractType);

    // Check 1: Is the signer a developer at all?
    const hasDeveloperRole: boolean = await versionController.isDeveloper(signerAddress);
    if (!hasDeveloperRole) {
        throw new Error(
            `Account ${signerAddress} is not a developer.\n` +
                `The account must have KEY_DEVELOPER_ROLE or SUB_DEVELOPER_ROLE to upload bytecode.`
        );
    }

    // Check 2: Is the signer (or their key developer) assigned to this contract type?
    const assignedKeyDev: string = await versionController.contractTypeKeyDeveloper(contractTypeBytes32);

    if (assignedKeyDev === ethers.ZeroAddress) {
        throw new Error(
            `Contract type "${contractType}" has no assigned key developer.\n` +
                `A governor must call assignDeveloperForContractTypes() first.`
        );
    }

    // Resolve the signer's key developer (returns self if signer IS a key dev, or their key dev if sub-dev)
    const signerKeyDev: string = await versionController.getKeyDeveloper(signerAddress);

    if (signerKeyDev.toLowerCase() !== assignedKeyDev.toLowerCase()) {
        throw new Error(
            `Account ${signerAddress} is not authorized for contract type "${contractType}".\n` +
                `Assigned key developer: ${assignedKeyDev}\n` +
                `Your key developer:     ${signerKeyDev || "(none — not a sub-developer)"}`
        );
    }
}

/**
 * Upload bytecode to the VersionController contract.
 *
 * Validates parameters and developer access, sends the appropriate release transaction,
 * and waits for confirmation.
 * This is the core function intended for reuse in batch upload scripts.
 *
 * @param versionController - VersionController contract instance (from `ethers.getContractAt`)
 * @param params - Upload parameters specifying contract type, release type, bytecode, and version info
 * @param signerAddress - Address of the signer, used for pre-tx access validation
 * @returns Transaction result with hash, block number, and gas used
 */
export async function uploadBytecode(
    versionController: any,
    params: UploadBytecodeParams,
    signerAddress: string
): Promise<UploadBytecodeResult> {
    validateUploadParams(params);

    const contractTypeBytes32 = ethers.encodeBytes32String(params.contractType);

    // Validate developer access before sending tx
    await validateDeveloperAccess(versionController, params.contractType, signerAddress);

    const bytecodeInput = {
        contractType: contractTypeBytes32,
        initCode: params.initCode,
        sourceURL: params.sourceURL
    };

    let tx;

    switch (params.releaseType) {
        case "initial":
            tx = await versionController.releaseBytecode(bytecodeInput);
            break;
        case "major":
            tx = await versionController.releaseMajorVersion(bytecodeInput);
            break;
        case "minor":
            tx = await versionController.releaseMinorVersion(bytecodeInput, params.major!);
            break;
        case "patch":
            tx = await versionController.releasePatchVersion(bytecodeInput, params.major!, params.minor!);
            break;
        case "alternative":
            tx = await versionController.releaseAlternativeVersion(bytecodeInput, {
                version: {
                    major: params.major!,
                    minor: params.minor!,
                    patch: params.patch!
                },
                alternative: params.alternative!
            });
            break;
    }

    const receipt = await tx.wait(1);

    return {
        txHash: receipt!.hash,
        blockNumber: receipt!.blockNumber,
        contractType: params.contractType,
        contractTypeBytes32,
        releaseType: params.releaseType,
        gasUsed: receipt!.gasUsed
    };
}
