/**
 * L2 Bytecode Upload Script
 *
 * Calls L2DeployManager.uploadBytecode for a single (contractType, version, initCode).
 * The bytecode hash + initCodeHash must already be requested on L2 via CCIP from L1
 * (i.e., L1DeployManager.sendBytecodeToOtherChain has been executed and the message
 * delivered), otherwise the call reverts with BytecodeNotRequested.
 *
 * Edit the constants below between runs.
 *
 * Usage:
 *   HARDHAT_NETWORK=linea  npx ts-node scripts/uploadBytecodeL2.ts
 *   HARDHAT_NETWORK=scroll npx ts-node scripts/uploadBytecodeL2.ts
 */

import hre from "hardhat";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { loadBytecodeFromFile } from "./utils/uploadBytecode";

// ─── Edit these between runs ──────────────────────────────────────────────
const CONTRACT_TYPE = "CometWithAssetList";
const VERSION = { major: 1, minor: 0, patch: 0, alternative: "" };
const BYTECODE_FILE = "bytecodes/CometWithExtendedAssetList.json";
const JSON_KEY: string | undefined = undefined; // set if the file uses a non-standard key
// ──────────────────────────────────────────────────────────────────────────

async function main() {
    const network = await ethers.provider.getNetwork();
    const [signer] = await ethers.getSigners();

    const deploymentPath = path.join(__dirname, "..", "deployments", hre.network.name, "L2DeployManager.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`L2DeployManager deployment not found for network "${hre.network.name}" at ${deploymentPath}`);
    }
    const { address: l2DeployManagerAddress } = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

    const initCode = loadBytecodeFromFile(BYTECODE_FILE, JSON_KEY);
    const initCodeHash = ethers.keccak256(initCode);

    const bytecodeVersion = {
        contractType: ethers.encodeBytes32String(CONTRACT_TYPE),
        version: {
            version: { major: VERSION.major, minor: VERSION.minor, patch: VERSION.patch },
            alternative: VERSION.alternative
        }
    };

    console.log(`Network:           ${hre.network.name} (chainId ${network.chainId})`);
    console.log(`Signer:            ${signer.address}`);
    console.log(`L2DeployManager:   ${l2DeployManagerAddress}`);
    console.log(`Contract type:     ${CONTRACT_TYPE}`);
    console.log(
        `Version:           ${VERSION.major}.${VERSION.minor}.${VERSION.patch}${VERSION.alternative ? ` (${VERSION.alternative})` : ""}`
    );
    console.log(`Bytecode file:     ${BYTECODE_FILE}`);
    console.log(`Init code length:  ${(initCode.length - 2) / 2} bytes`);
    console.log(`Init code hash:    ${initCodeHash}`);

    const l2 = await ethers.getContractAt("L2DeployManager", l2DeployManagerAddress, signer);

    const tx = await l2.uploadBytecode(bytecodeVersion, initCode);
    console.log(`\nTx sent:           ${tx.hash}`);

    const receipt = await tx.wait(1);
    console.log(`Confirmed block:   ${receipt?.blockNumber}`);
    console.log(`Gas used:          ${receipt?.gasUsed.toString()}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
