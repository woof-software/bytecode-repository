/**
 * Core bytecode upload utilities for the version controllers.
 *
 * Reusable module for uploading bytecode to either {VersionController} or
 * {LightVersionController}. Import these functions in batch upload scripts.
 *
 * Bind the ABI of whichever variant is actually deployed — the two expose different
 * developer APIs, and mixing them makes calls revert with a bare "execution reverted".
 * Use {detectControllerKind} rather than assuming.
 *
 * @example
 * ```typescript
 * import { ethers } from "hardhat";
 * import { uploadBytecode, loadBytecodeFromFile, detectControllerKind, CONTROLLER_ARTIFACT } from "./utils/uploadBytecode";
 *
 * const kind = await detectControllerKind("0x...");
 * const vc = await ethers.getContractAt(CONTROLLER_ARTIFACT[kind], "0x...");
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
import { resolve, extname, join } from "path";

export type ReleaseType = "initial" | "major" | "minor" | "patch" | "alternative";

export const VALID_RELEASE_TYPES: ReleaseType[] = ["initial", "major", "minor", "patch", "alternative"];

/**
 * Which controller variant is deployed at an address.
 * - "full"  — {VersionController}: Key/Sub developer hierarchy, per-contract-type assignment.
 * - "light" — {LightVersionController}: a single flat DEVELOPER_ROLE, no assignment.
 *
 * The two expose different developer APIs, so callers must not assume one ABI fits both.
 */
export type ControllerKind = "full" | "light";

/** Artifact name to bind for each controller kind. */
export const CONTROLLER_ARTIFACT: Record<ControllerKind, string> = {
    full: "VersionController",
    light: "LightVersionController"
};

/**
 * Determine which controller variant lives at an address by probing for a role
 * constant unique to each: KEY_DEVELOPER_ROLE (full) vs DEVELOPER_ROLE (light).
 *
 * On-chain detection is authoritative — a deployment artifact name can be stale, and
 * an address passed via --version-controller carries no name at all.
 *
 * Throws if neither probe answers, rather than guessing: silently assuming "light"
 * against a full controller would skip the real authorization check.
 */
export async function detectControllerKind(address: string, runner?: any): Promise<ControllerKind> {
    const provider = runner ?? ethers.provider;

    const code = await ethers.provider.getCode(address);
    if (code === "0x") throw new Error(`No contract deployed at ${address}`);

    const probe = (signature: string) => new ethers.Contract(address, [signature], provider);

    try {
        await probe("function KEY_DEVELOPER_ROLE() view returns (bytes32)").KEY_DEVELOPER_ROLE();
        return "full";
    } catch {
        // Not a full controller — fall through and try the light variant.
    }

    try {
        await probe("function DEVELOPER_ROLE() view returns (bytes32)").DEVELOPER_ROLE();
        return "light";
    } catch {
        // Neither — reported below.
    }

    throw new Error(
        `Contract at ${address} is neither a VersionController nor a LightVersionController.\n` +
            `Neither KEY_DEVELOPER_ROLE() nor DEVELOPER_ROLE() could be read. ` +
            `Check the address and the network.`
    );
}

/**
 * Resolve the controller address for a network from deployment artifacts, or a CLI override.
 *
 * Either variant may be deployed, so both artifact names are searched. VersionController
 * wins if both exist — a network with the full controller deployed should not upload
 * through a light one left over from testing.
 */
export function loadControllerAddress(networkName: string, override?: string): string {
    if (override) return override;

    const candidates = [CONTROLLER_ARTIFACT.full, CONTROLLER_ARTIFACT.light];

    for (const artifact of candidates) {
        const deploymentFile = join(process.cwd(), "deployments", networkName, `${artifact}.json`);
        if (existsSync(deploymentFile)) {
            const deployment = JSON.parse(readFileSync(deploymentFile, "utf8"));
            return deployment.address as string;
        }
    }

    throw new Error(
        `No controller address found for network "${networkName}".\n` +
            `Looked for ${candidates.map((c) => `deployments/${networkName}/${c}.json`).join(" and ")}.\n` +
            `Either deploy first or provide --version-controller <address>`
    );
}

export interface ResolvedController {
    /** Address of the deployed controller. */
    address: string;
    /** Which variant is deployed there. */
    kind: ControllerKind;
    /** Artifact name bound for `contract`. */
    artifact: string;
    /** Contract instance bound to the ABI of the variant actually deployed. */
    contract: any;
}

/**
 * Resolve the controller for a network and bind the ABI of whichever variant is actually
 * deployed there.
 *
 * Always prefer this over `getContractAt("VersionController", ...)`: binding the wrong ABI
 * makes developer checks revert with a bare "execution reverted", because the selectors do
 * not exist on the other contract.
 *
 * @param networkName - Network name, used to locate the deployment artifact
 * @param override - Explicit address (e.g. from --version-controller), skipping artifact lookup
 */
export async function resolveController(networkName: string, override?: string): Promise<ResolvedController> {
    const address = loadControllerAddress(networkName, override);
    const kind = await detectControllerKind(address);
    const artifact = CONTROLLER_ARTIFACT[kind];
    const contract = await ethers.getContractAt(artifact, address);

    return { address, kind, artifact, contract };
}

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
 * Dispatches on the deployed controller variant, whose developer models differ:
 * - "light" — signer holds DEVELOPER_ROLE. Any developer may release any contract type.
 * - "full"  — signer is a Key/Sub developer AND is assigned to this contract type.
 *
 * The contract-type checks below exist only on the full controller; calling them against
 * a LightVersionController reverts with empty data ("execution reverted"), because the
 * selector matches nothing and there is no fallback.
 *
 * @param versionController - Controller contract instance
 * @param contractType - Human-readable contract type name
 * @param signerAddress - Address of the account that will send the transaction
 * @param kind - Controller variant. Detected on-chain when omitted.
 */
export async function validateDeveloperAccess(
    versionController: any,
    contractType: string,
    signerAddress: string,
    kind?: ControllerKind
): Promise<void> {
    const address: string = await versionController.getAddress();
    const resolvedKind = kind ?? (await detectControllerKind(address, versionController.runner));

    if (resolvedKind === "light") {
        return validateLightDeveloperAccess(address, signerAddress, versionController.runner);
    }

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
 * Validate developer access against a {LightVersionController}.
 *
 * The light controller has no key/sub developer hierarchy and no per-contract-type
 * assignment: holding DEVELOPER_ROLE authorizes releasing any contract type.
 *
 * Binds its own minimal ABI so the check holds regardless of which ABI the caller bound.
 */
async function validateLightDeveloperAccess(address: string, signerAddress: string, runner?: any): Promise<void> {
    const light = new ethers.Contract(
        address,
        ["function isDeveloper(address) view returns (bool)"],
        runner ?? ethers.provider
    );

    const hasDeveloperRole: boolean = await light.isDeveloper(signerAddress);
    if (!hasDeveloperRole) {
        throw new Error(
            `Account ${signerAddress} is not a developer.\n` +
                `The account must have DEVELOPER_ROLE to upload bytecode.\n` +
                `An admin (DEFAULT_ADMIN_ROLE) must call grantRole(DEVELOPER_ROLE, ${signerAddress}) first.`
        );
    }
}

/**
 * Upload bytecode to the controller contract.
 *
 * Validates parameters, sends the appropriate release transaction, and waits for
 * confirmation. Works against both controller variants — the release functions share
 * the same signatures on each.
 *
 * Developer access is NOT checked here; callers invoke {validateDeveloperAccess}
 * beforehand so a failure is reported before any transaction is built.
 *
 * @param versionController - Controller contract instance (from `ethers.getContractAt`)
 * @param params - Upload parameters specifying contract type, release type, bytecode, and version info
 * @returns Transaction result with hash, block number, and gas used
 */
export async function uploadBytecode(
    versionController: any,
    params: UploadBytecodeParams
): Promise<UploadBytecodeResult> {
    validateUploadParams(params);

    const contractTypeBytes32 = ethers.encodeBytes32String(params.contractType);

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
