/**
 * CCIP getFee helper for L1DeployManager.sendBytecodeToOtherChain
 *
 * Reproduces the EVM2AnyMessage that L1DeployManager._ccipSend would build
 * for sendBytecodeToOtherChain, queries the L1 CCIP router's getFee, and
 * prints inputs in a form that can be pasted into Etherscan's
 * "Write Contract" UI (tuple format) plus the ETH value to attach.
 *
 * Edit the constants below between runs. Run against L1 (Ethereum mainnet).
 *
 * Usage:
 *   HARDHAT_NETWORK=ethereum npx ts-node scripts/getFeeSendBytecode.ts
 */

import hre from "hardhat";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { getNetworkConfig } from "./config/networkConfig";

// ─── Edit these between runs ──────────────────────────────────────────────
const TARGET_L2 = "linea"; // key from networkConfig.ts (linea | scroll | base | ...)
const CONTRACT_TYPE = "CometWithAssetList";
const VERSION = { major: 1, minor: 0, patch: 0, alternative: "" };
const GAS_LIMIT = 200_000; // gas limit for execution on the destination chain (200_000 Should be enough for any call)
const FEE_BUFFER_BPS = 0; // safety margin on top of the raw fee
// ──────────────────────────────────────────────────────────────────────────

// Client.GENERIC_EXTRA_ARGS_V2_TAG — bytes4(keccak256("CCIP EVMExtraArgsV2"))
const GENERIC_EXTRA_ARGS_V2_TAG = "0x181dcf10";
// IL1DeployManager.MessageType.SEND_BYTECODE
const MESSAGE_TYPE_SEND_BYTECODE = 0;

async function main() {
    if (hre.network.name !== "ethereum") {
        console.warn(`⚠ Expected HARDHAT_NETWORK=ethereum (got "${hre.network.name}"). getFee is queried on L1.`);
    }

    // ── Resolve addresses ──────────────────────────────────────────────────
    const l2Cfg = getNetworkConfig(TARGET_L2);
    const targetChainId = l2Cfg.chainId;
    const destChainSelector = l2Cfg.destinationChainSelector;

    const l2DeployManagerAddress = readDeploymentAddress(TARGET_L2, "L2DeployManager");
    const l1DeployManagerAddress = readDeploymentAddress("ethereum", "L1DeployManager");
    const versionControllerAddress = readDeploymentAddress("ethereum", "VersionController");

    // ── Build BytecodeVersion + fetch on-chain hashes ──────────────────────
    const contractTypeBytes32 = ethers.encodeBytes32String(CONTRACT_TYPE);
    const versionWithAlt = {
        version: { major: VERSION.major, minor: VERSION.minor, patch: VERSION.patch },
        alternative: VERSION.alternative
    };
    const bytecodeVersion = { contractType: contractTypeBytes32, version: versionWithAlt };

    const versionController = await ethers.getContractAt("VersionController", versionControllerAddress);
    const l1DeployManager = await ethers.getContractAt("L1DeployManager", l1DeployManagerAddress);

    const bytecodeHash: string = await versionController.computeBytecodeHash(contractTypeBytes32, versionWithAlt);
    const verifiedInitCodeHash: string = await versionController.getVerifiedInitCodeHash(bytecodeVersion);

    if (verifiedInitCodeHash === ethers.ZeroHash) {
        console.warn(`⚠ getVerifiedInitCodeHash returned zero — bytecode is not uploaded/verified for this version.`);
    }

    // ── Sanity-check chain config registered on L1DeployManager ────────────
    const onChainConfig = await l1DeployManager.chainConfigs(targetChainId);
    const onChainL2DM: string = onChainConfig.l2DeployManager ?? onChainConfig[0];
    const onChainSelector: bigint = onChainConfig.destinationChainSelector ?? onChainConfig[1];

    if (onChainL2DM === ethers.ZeroAddress) {
        throw new Error(
            `L1DeployManager has no chain config for chainId ${targetChainId}. ` +
                `Governor must call setChainConfig first.`
        );
    }
    if (onChainL2DM.toLowerCase() !== l2DeployManagerAddress.toLowerCase()) {
        console.warn(
            `⚠ On-chain L2DeployManager (${onChainL2DM}) ≠ deployments file (${l2DeployManagerAddress}). ` +
                `Using on-chain value for fee estimation.`
        );
    }
    if (onChainSelector.toString() !== destChainSelector) {
        console.warn(
            `⚠ On-chain destinationChainSelector (${onChainSelector}) ≠ networkConfig (${destChainSelector}). ` +
                `Using on-chain value for fee estimation.`
        );
    }
    const effectiveL2DM = onChainL2DM;
    const effectiveSelector = onChainSelector.toString();

    // ── Build EVM2AnyMessage exactly like L1DeployManager._ccipSend ────────
    const abi = ethers.AbiCoder.defaultAbiCoder();
    const receiver = abi.encode(["address"], [effectiveL2DM]);
    const data = abi.encode(
        ["uint8", "bytes32", "bytes32"],
        [MESSAGE_TYPE_SEND_BYTECODE, bytecodeHash, verifiedInitCodeHash]
    );
    const extraArgs = ethers.concat([GENERIC_EXTRA_ARGS_V2_TAG, abi.encode(["uint256", "bool"], [GAS_LIMIT, true])]);

    const evm2AnyMessage = {
        receiver,
        data,
        tokenAmounts: [],
        feeToken: ethers.ZeroAddress,
        extraArgs
    };

    // ── Query getFee on the L1 CCIP router ─────────────────────────────────
    const ccipRouterAddress: string = await l1DeployManager.routerClient();
    const router = new ethers.Contract(
        ccipRouterAddress,
        [
            "function getFee(uint64 destinationChainSelector, (bytes receiver, bytes data, (address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs) message) view returns (uint256 fee)"
        ],
        ethers.provider
    );
    const fee: bigint = await router.getFee(effectiveSelector, evm2AnyMessage);
    const feeWithBuffer = (fee * BigInt(10_000 + FEE_BUFFER_BPS)) / 10_000n;

    // ── Format Etherscan tuple for `_bytecodeVersion` ──────────────────────
    const bytecodeVersionTuple = JSON.stringify([
        contractTypeBytes32,
        [[VERSION.major, VERSION.minor, VERSION.patch], VERSION.alternative]
    ]);

    // ── Encoded calldata (bonus: usable for Safe / raw eth_sendTransaction)
    const calldata = l1DeployManager.interface.encodeFunctionData("sendBytecodeToOtherChain", [
        bytecodeVersion,
        targetChainId,
        GAS_LIMIT
    ]);

    const versionLabel = `${VERSION.major}.${VERSION.minor}.${VERSION.patch}${VERSION.alternative ? `-${VERSION.alternative}` : ""}`;
    const sep = "─".repeat(72);

    console.log(sep);
    console.log("CCIP getFee for L1DeployManager.sendBytecodeToOtherChain");
    console.log(sep);
    console.log(`Target L2:           ${TARGET_L2} (chainId ${targetChainId})`);
    console.log(`Contract type:       ${CONTRACT_TYPE}`);
    console.log(`Version:             ${versionLabel}`);
    console.log(`Gas limit (L2):      ${GAS_LIMIT.toLocaleString("en-US")}`);
    console.log("");
    console.log(`L1DeployManager:     ${l1DeployManagerAddress}`);
    console.log(`L1 CCIP Router:      ${ccipRouterAddress}`);
    console.log(`L2DeployManager:     ${effectiveL2DM}`);
    console.log(`Dest chain selector: ${effectiveSelector}`);
    console.log("");
    console.log(`bytecodeHash:        ${bytecodeHash}`);
    console.log(`initCodeHash:        ${verifiedInitCodeHash}`);
    console.log("");
    console.log(`CCIP fee (raw):      ${fee.toString()} wei = ${ethers.formatEther(fee)} ETH`);
    console.log(
        `Fee + ${FEE_BUFFER_BPS / 100}% buffer:    ${feeWithBuffer.toString()} wei = ${ethers.formatEther(feeWithBuffer)} ETH`
    );
    console.log("");
    console.log(sep);
    console.log("Etherscan inputs for sendBytecodeToOtherChain");
    console.log(sep);
    console.log(`_bytecodeVersion (tuple):`);
    console.log(`  ${bytecodeVersionTuple}`);
    console.log(`_chainId:            ${targetChainId}`);
    console.log(`_gasLimit:           ${GAS_LIMIT}`);
    console.log(
        `payableAmount (ETH): ${ethers.formatEther(feeWithBuffer)}   (raw fee = ${ethers.formatEther(fee)} ETH)`
    );
    console.log("");
    console.log(`Encoded calldata (bonus):`);
    console.log(`  ${calldata}`);
}

function readDeploymentAddress(network: string, contract: string): string {
    const p = path.join(__dirname, "..", "deployments", network, `${contract}.json`);
    if (!fs.existsSync(p)) {
        throw new Error(`${contract} deployment not found for "${network}" at ${p}`);
    }
    const json = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!json.address) throw new Error(`No "address" field in ${p}`);
    return json.address;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
