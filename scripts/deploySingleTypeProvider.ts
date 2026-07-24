import { ethers } from "hardhat";
import { DeploymentManager, waitForConfirmations, logDeploymentStep } from "./utils/deployment";
import { loadBytecodeFromFile } from "./utils/uploadBytecode";

/**
 * Deployment Script for SingleTypeBytecodeProvider
 *
 * Deploys a {SingleTypeBytecodeProvider} for ONE contract type and immediately uploads the bytecode
 * for a single version, so the provider is ready to back a factory (e.g. {CometFactoryV2}) on the
 * same network.
 *
 * Use this for "Traditional Framework Integration": the canonical bytecode lives in a
 * {LightVersionController} on a testnet, but the factory needs a provider on ITS network. The bytecode
 * is copied here manually because CCIP cannot bridge testnets and mainnets.
 *
 * Usage:
 * ```bash
 * npx hardhat run scripts/deploySingleTypeProvider.ts --network <network>
 * ```
 *
 * The deployer is always the initial admin (it must hold UPLOADER_ROLE to perform the upload below).
 * Optionally set EXTRA_ADMIN_ADDRESS to also grant DEFAULT_ADMIN_ROLE + UPLOADER_ROLE to another
 * account after the upload; the deployer keeps its roles unless you renounce them separately.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * FILL THESE IN BEFORE RUNNING
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The single contract type this provider will serve, as a plain string (max 31 bytes).
 * It is encoded to bytes32 exactly like a Solidity `bytes32 constant` string literal.
 * NOTE: to back CometFactoryV2 this MUST equal its COMET_CT, i.e. "CometWithAssetList".
 */
const CONTRACT_TYPE = "CometWithAssetList";

/**
 * Path to the file holding the contract's INIT CODE (creation bytecode, no constructor args).
 * Relative to the repo root, or absolute. Supported: Hardhat artifact JSON, Foundry artifact JSON,
 * custom JSON (see BYTECODE_JSON_KEY), or a raw hex file.
 */
const BYTECODE_PATH = "bytecodes/Comet/CometWithExtendedAssetList.json";

/** Optional: field name to read from a custom JSON file. Leave undefined to auto-detect. */
const BYTECODE_JSON_KEY: string | undefined = undefined;

/** The version to publish the bytecode under. */
const VERSION = {
    version: { major: 1n, minor: 0n, patch: 0n },
    alternative: ""
};

/* ──────────────────────────────────────────────────────────────────────────── */

/** Guards a placeholder constant that must be filled in before running. */
function requireFilledIn(value: string, name: string): string {
    if (!value.trim()) throw new Error(`${name} is empty — fill it in at the top of this script.`);
    return value;
}

async function main() {
    console.log("Starting SingleTypeBytecodeProvider deployment...\n");

    const deploymentManager = await DeploymentManager.create();

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const extraAdmin = process.env.EXTRA_ADMIN_ADDRESS;

    // ── Validate configuration before spending any gas ──────────────────────
    const contractTypeName = requireFilledIn(CONTRACT_TYPE, "CONTRACT_TYPE");
    const bytecodePath = requireFilledIn(BYTECODE_PATH, "BYTECODE_PATH");

    const contractTypeBytes = new TextEncoder().encode(contractTypeName).length;
    if (contractTypeBytes > 31) {
        throw new Error(
            `CONTRACT_TYPE "${contractTypeName}" is ${contractTypeBytes.toString()} bytes; max is 31 (bytes32 limit).`
        );
    }
    const contractType = ethers.encodeBytes32String(contractTypeName);

    const initCode = loadBytecodeFromFile(bytecodePath, BYTECODE_JSON_KEY);
    if (initCode === "0x") throw new Error(`No bytecode found in ${bytecodePath}`);
    if (!ethers.isHexString(initCode)) throw new Error(`Bytecode in ${bytecodePath} is not valid hex`);
    const initCodeHash = ethers.keccak256(initCode);
    const initCodeSize = (initCode.length - 2) / 2;

    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
    console.log("Network:", network.name, "| Chain ID:", network.chainId.toString());
    console.log("Configuration:");
    console.log("  Contract type:", `"${contractTypeName}"`, "->", contractType);
    console.log("  Bytecode file:", bytecodePath);
    console.log("  Init code size:", initCodeSize, "bytes");
    console.log("  Init code hash:", initCodeHash);
    console.log(
        "  Version:",
        `${VERSION.version.major.toString()}.${VERSION.version.minor.toString()}.` +
            `${VERSION.version.patch.toString()}${VERSION.alternative}`
    );
    if (extraAdmin) console.log("  Extra admin:", extraAdmin);
    console.log("");

    const deployedContracts: Record<string, string> = {};

    try {
        // 1. Deploy the provider (deployer is the initial admin + uploader)
        logDeploymentStep(1, 2, "Deploying SingleTypeBytecodeProvider...");
        const Provider = await ethers.getContractFactory("SingleTypeBytecodeProvider");
        const providerArgs = [contractType, deployer.address];

        console.log("Deploying contract...");
        const provider = await Provider.deploy(...providerArgs);
        await provider.waitForDeployment();

        const providerTx = provider.deploymentTransaction();
        if (providerTx) await waitForConfirmations(providerTx, 1, "SingleTypeBytecodeProvider");

        const providerAddress = await provider.getAddress();
        deployedContracts.SingleTypeBytecodeProvider = providerAddress;

        await deploymentManager.saveDeployment(
            "SingleTypeBytecodeProvider",
            provider,
            providerTx,
            providerArgs,
            false // isUpgradeable
        );

        console.log("SingleTypeBytecodeProvider:", providerAddress);
        console.log("");

        // 2. Upload the bytecode for the configured version
        logDeploymentStep(2, 2, "Uploading bytecode...");
        const gasEstimate = await provider.uploadBytecode.estimateGas(VERSION, initCode);
        console.log(`   Estimated gas: ${gasEstimate.toString()}`);

        const uploadTx = await provider.uploadBytecode(VERSION, initCode);
        const uploadReceipt = await uploadTx.wait(1);
        if (!uploadReceipt) throw new Error("Upload transaction was not mined (null receipt)");
        console.log(`   ✅ Bytecode uploaded in block ${uploadReceipt.blockNumber.toString()}`);
        console.log(`   ⛽ Gas used: ${uploadReceipt.gasUsed.toString()}`);
        console.log("");

        // 3. Verify the upload landed intact
        console.log("Verifying upload...");
        const bytecodeVersion = { contractType, version: VERSION };

        const exists = await provider.versionExists(bytecodeVersion);
        if (!exists) throw new Error("Verification failed: versionExists() returned false after upload");

        const onChainHash = await provider.getInitCodeHash(bytecodeVersion);
        if (onChainHash !== initCodeHash) {
            throw new Error(`Verification failed: on-chain init code hash ${onChainHash} != local ${initCodeHash}`);
        }
        console.log("   ✅ versionExists() == true");
        console.log("   ✅ on-chain init code hash matches the local file");
        console.log("");

        // 4. Optionally grant roles to an additional admin
        if (extraAdmin && extraAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
            console.log("Granting roles to extra admin...");
            const DEFAULT_ADMIN_ROLE = await provider.DEFAULT_ADMIN_ROLE();
            const UPLOADER_ROLE = await provider.UPLOADER_ROLE();
            await (await provider.grantRole(DEFAULT_ADMIN_ROLE, extraAdmin)).wait(1);
            await (await provider.grantRole(UPLOADER_ROLE, extraAdmin)).wait(1);
            console.log(`   ✅ DEFAULT_ADMIN_ROLE + UPLOADER_ROLE granted to ${extraAdmin}`);
            console.log(`   ℹ️  ${deployer.address} still holds both roles — renounce separately if undesired.`);
            console.log("");
        }

        // 5. Save network summary and generate report
        console.log("Finalizing deployment...");
        deploymentManager.saveNetworkSummary(deployedContracts);
        deploymentManager.generateReport();

        console.log("🎉 Deployment completed successfully!");
        console.log("");
        console.log("Next step: point your factory at this provider as its bytecodeProvider:");
        console.log("  ", providerAddress);
        console.log("");
    } catch (error) {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});

if (require.main === module) {
    void main();
}

export default main;
