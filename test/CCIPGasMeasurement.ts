import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
    CometInitCode,
    CometExtInitCode,
    CometWithExtendedAssetListInitCode,
    CometExtAssetList
} from "./testData.json";
import { prepareAuditReportSignature } from "./helpers";
import type { Developers } from "./helpers";

/**
 * Measures the gas consumed on the destination chain by L2DeployManager._ccipReceive
 * when receiving a SEND_BYTECODE message. The MockCCIPRouter executes the receive
 * locally via CallWithExactGas and emits MsgExecuted(success, retData, gasUsed),
 * which is exactly the gas budget that real CCIP would bill against the configured
 * gasLimit on the destination chain.
 *
 * Run: pnpm hardhat test test/CCIPGasMeasurement.ts
 */

const mockRouterFee = ethers.parseEther("0.1");
const sepoliaSelector = "16015286601757825753";
const mockChainSelectorId = "1234567890";
const mockOtherChainId = 123456;
// Probe budget for the inner _ccipReceive call. Must satisfy:
//   gasleft() at CallWithExactGas time  >=  PROBE_GAS_LIMIT + GAS_FOR_CALL_EXACT_CHECK (5k)
// The L1 tx itself burns a few hundred-k gas before reaching that point (encoding the
// initCode, fee calc, etc.), and Hardhat's default block gas limit is 30M, so we cap
// the probe well below 30M and override the tx gasLimit to the block max.
const PROBE_GAS_LIMIT = 10_000_000;
const TX_GAS_LIMIT = 29_900_000;

interface BytecodeCase {
    label: string;
    initCode: string;
}

const CASES: BytecodeCase[] = [
    { label: "CometWithAssetList   ", initCode: CometWithExtendedAssetListInitCode },
    { label: "CometExtWithAssetList", initCode: CometExtAssetList },
    { label: "Comet (no asset list)", initCode: CometInitCode },
    { label: "CometExt (legacy)    ", initCode: CometExtInitCode }
];

describe("CCIP gas measurement — sendBytecodeToOtherChain", function () {
    const fixture = async () => {
        const signers = await ethers.getSigners();
        const governor = signers[0];
        const guardian = signers[1];
        const auditor = signers[2];
        const WOOF: Developers = {
            keyDeveloper: signers[5],
            subDevelopers: signers.slice(6, 9),
            // One contract type per case — keeps versioning simple
            contractTypes: CASES.map((_, i) => ethers.encodeBytes32String(`CT_${i}`))
        };
        const localTimelockL2 = signers[9];

        const versionController = await upgrades.deployProxy(
            await ethers.getContractFactory("VersionController"),
            [await governor.getAddress(), await guardian.getAddress()],
            { kind: "uups" }
        );

        const AUDITOR_ROLE = await versionController.AUDITOR_ROLE();
        await versionController.connect(governor).grantRole(AUDITOR_ROLE, auditor);

        const KEY_DEVELOPER_ROLE = await versionController.KEY_DEVELOPER_ROLE();
        await versionController.connect(governor).grantRole(KEY_DEVELOPER_ROLE, WOOF.keyDeveloper);

        await versionController
            .connect(governor)
            .assignDeveloperForContractTypes(WOOF.contractTypes, WOOF.keyDeveloper);

        const mockRouter = await (await ethers.getContractFactory("MockCCIPRouter")).deploy();
        await mockRouter.setFee(mockRouterFee);

        const l1DeployManager = await upgrades.deployProxy(await ethers.getContractFactory("L1DeployManager"), [], {
            kind: "uups",
            constructorArgs: [await versionController.getAddress(), await mockRouter.getAddress()]
        });

        const l2DeployManager = await (
            await ethers.getContractFactory("L2DeployManager")
        ).deploy(sepoliaSelector, l1DeployManager, mockRouter, localTimelockL2);

        await l1DeployManager.connect(governor).setChainConfig(mockOtherChainId, {
            l2DeployManager: l2DeployManager,
            destinationChainSelector: mockChainSelectorId
        });

        // Release + verify v1.0.0 of each contract type with its assigned bytecode
        const URL = "https://example.com/source";
        const auditReportURL = "https://example.com/audit";

        for (let i = 0; i < CASES.length; i++) {
            const ct = WOOF.contractTypes[i];
            const initCode = CASES[i].initCode;

            await versionController.connect(WOOF.keyDeveloper).releaseBytecode({
                contractType: ct,
                initCode,
                sourceURL: URL
            });

            const version = { version: { major: 1, minor: 0, patch: 0 }, alternative: "" };
            const bytecodeHash = await versionController.computeBytecodeHash(ct, version);
            const sig = await prepareAuditReportSignature(
                bytecodeHash,
                ethers.keccak256(initCode),
                auditReportURL,
                await versionController.getAddress(),
                auditor
            );
            await versionController
                .connect(WOOF.keyDeveloper)
                .verifyBytecode({ contractType: ct, version }, auditReportURL, sig);
        }

        // Cooldown bypass not needed — releaseBytecode is initial release for each type
        return { WOOF, l1DeployManager, l2DeployManager, mockRouter, versionController };
    };

    const restore = async () => await loadFixture(fixture);

    it("Reports gas consumed by _ccipReceive for each bytecode size", async () => {
        const { WOOF, l1DeployManager, mockRouter } = await restore();

        const results: { label: string; bytes: number; gasUsed: bigint; recommended: bigint }[] = [];
        const safetyBps = 2500n; // 25% safety margin

        for (let i = 0; i < CASES.length; i++) {
            const ct = WOOF.contractTypes[i];
            const version = { version: { major: 1, minor: 0, patch: 0 }, alternative: "" };

            const tx = await l1DeployManager
                .connect(WOOF.keyDeveloper)
                .sendBytecodeToOtherChain({ contractType: ct, version }, mockOtherChainId, PROBE_GAS_LIMIT, {
                    value: mockRouterFee,
                    gasLimit: TX_GAS_LIMIT
                });
            const receipt = await tx.wait();

            // Find MsgExecuted(bool success, bytes retData, uint256 gasUsed) from MockCCIPRouter
            const iface = mockRouter.interface;
            let gasUsed = 0n;
            for (const log of receipt!.logs) {
                if (log.address.toLowerCase() !== (await mockRouter.getAddress()).toLowerCase()) continue;
                try {
                    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
                    if (parsed?.name === "MsgExecuted") {
                        gasUsed = parsed.args.gasUsed as bigint;
                        break;
                    }
                } catch {
                    /* not a MockCCIPRouter event */
                }
            }

            const bytes = (CASES[i].initCode.length - 2) / 2;
            const recommended = (gasUsed * (10000n + safetyBps)) / 10000n;
            results.push({ label: CASES[i].label, bytes, gasUsed, recommended });
        }

        // Pretty-print the report
        console.log("\n  ── CCIP _ccipReceive gas usage on L2 ──");
        console.log("  bytecode                bytes    gasUsed   gasLimit (+25%)");
        console.log("  ─────────────────────  ──────  ─────────  ────────────────");
        for (const r of results) {
            console.log(
                `  ${r.label}  ${r.bytes.toString().padStart(6)}  ${r.gasUsed.toString().padStart(9)}  ${r.recommended
                    .toString()
                    .padStart(16)}`
            );
        }
        console.log("");
    });
});
