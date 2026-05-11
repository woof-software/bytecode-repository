import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import { CometInitCode } from "./testData.json";
import { prepareAuditReportSignature } from "./helpers";

// Ethereum mainnet CCIP router (used by L1DeployManager).
const L1_CCIP_ROUTER = "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D";
// Arbitrum One CCIP router. Not deployed on the L1 fork — but L2DeployManager
// only checks that msg.sender == this address in onlyRouter, so we just impersonate
// it on the same fork to relay the message.
const L2_CCIP_ROUTER = "0x141fa059441E0ca23ce184B6A78bafD2A517DdE8";
// Chainlink CCIP chain selectors.
const ETHEREUM_SELECTOR = "5009297550715157269";
const ARBITRUM_SELECTOR = "4949039107694359620";
const ARBITRUM_CHAIN_ID = 42161;
const L2_GAS_LIMIT = 200_000;

describe("CCIP integration", function () {
    before(async function () {
        const forkingUrl = process.env.FORKING_URL ?? process.env.ETHEREUM_URL;
        if (!forkingUrl) {
            console.log(
                "  ⚠  Skipping: set FORKING_URL (or ETHEREUM_URL) to a mainnet RPC URL to run the CCIP integration test."
            );
            this.skip();
        }
        // Reset the in-memory chain to a fresh mainnet fork so the test is hermetic.
        await network.provider.request({
            method: "hardhat_reset",
            params: [{ forking: { jsonRpcUrl: forkingUrl } }]
        });
    });

    after(async function () {
        // Tear the fork down so subsequent tests run on a clean Hardhat network.
        await network.provider.request({ method: "hardhat_reset", params: [] });
    });

    it("relays bytecode from L1 => Ethereum CCIP router => Arbitrum One CCIP router => L2DeployManager", async function () {
        const [governor, guardian, auditor, keyDeveloper, localTimelockL2, anyone] = await ethers.getSigners();

        // 1. VersionController + roles
        const versionController = await upgrades.deployProxy(
            await ethers.getContractFactory("VersionController"),
            [governor.address, guardian.address],
            { kind: "uups" }
        );

        const AUDITOR_ROLE = await versionController.AUDITOR_ROLE();
        const KEY_DEVELOPER_ROLE = await versionController.KEY_DEVELOPER_ROLE();
        await versionController.connect(governor).grantRole(AUDITOR_ROLE, auditor.address);
        await versionController.connect(governor).grantRole(KEY_DEVELOPER_ROLE, keyDeveloper.address);

        const contractType = ethers.encodeBytes32String("COMET");
        await versionController.connect(governor).assignDeveloperForContractTypes([contractType], keyDeveloper.address);

        // 2. Release + audit-verify bytecode v1.0.0
        await versionController.connect(keyDeveloper).releaseBytecode({
            contractType,
            initCode: CometInitCode,
            sourceURL: "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol"
        });

        const version = { version: { major: 1, minor: 0, patch: 0 }, alternative: "" };
        const bytecodeVersion = { contractType, version };
        const bytecodeHash = await versionController.computeBytecodeHash(contractType, version);
        const initCodeHash = ethers.keccak256(CometInitCode);

        const auditReport = "https://example.com/audit/comet-v1.0.0";
        const sig = await prepareAuditReportSignature(
            bytecodeHash,
            initCodeHash,
            auditReport,
            await versionController.getAddress(),
            auditor
        );
        await versionController.connect(keyDeveloper).verifyBytecode(bytecodeVersion, auditReport, sig);

        // 3. L1DeployManager with Ethereum CCIP router
        const l1DeployManager = await upgrades.deployProxy(await ethers.getContractFactory("L1DeployManager"), [], {
            kind: "uups",
            constructorArgs: [await versionController.getAddress(), L1_CCIP_ROUTER]
        });

        // 4. L2DeployManager with impersonated Arbitrum One CCIP router
        const l2DeployManager = await (
            await ethers.getContractFactory("L2DeployManager")
        ).deploy(ETHEREUM_SELECTOR, await l1DeployManager.getAddress(), L2_CCIP_ROUTER, localTimelockL2.address);

        await l1DeployManager.connect(governor).setChainConfig(ARBITRUM_CHAIN_ID, {
            l2DeployManager: await l2DeployManager.getAddress(),
            destinationChainSelector: ARBITRUM_SELECTOR
        });

        // 5. Quote the fee from the real router and send the message
        const router = await ethers.getContractAt("IRouterClient", L1_CCIP_ROUTER);
        const GENERIC_EXTRA_ARGS_V2_TAG = "0x181dcf10";
        const expectedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint8", "bytes32", "bytes32"],
            [0 /* MessageType.SEND_BYTECODE */, bytecodeHash, initCodeHash]
        );
        const evm2AnyMessage = {
            receiver: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await l2DeployManager.getAddress()]),
            data: expectedPayload,
            tokenAmounts: [],
            extraArgs: ethers.concat([
                GENERIC_EXTRA_ARGS_V2_TAG,
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint256 gasLimit, bool allowOutOfOrderExecution)"],
                    [{ gasLimit: L2_GAS_LIMIT, allowOutOfOrderExecution: true }]
                )
            ]),
            feeToken: ethers.ZeroAddress
        };
        const fee: bigint = await router.getFee(ARBITRUM_SELECTOR, evm2AnyMessage);
        expect(fee).to.be.gt(0n);

        const sendTx = await l1DeployManager
            .connect(keyDeveloper)
            .sendBytecodeToOtherChain(bytecodeVersion, ARBITRUM_CHAIN_ID, L2_GAS_LIMIT, { value: fee });
        const sendReceipt = await sendTx.wait();

        expect(await l1DeployManager.isVersionSentToChain(ARBITRUM_CHAIN_ID, bytecodeHash)).to.be.true;
        await expect(sendTx).to.emit(l1DeployManager, "BytecodeSent");
        // Check that CCIP Router was called by validating there are logs after L1DeployManager.
        const l1DeployManagerAddr = (await l1DeployManager.getAddress()).toLowerCase();
        const downstreamLogs = sendReceipt!.logs.filter((l) => l.address.toLowerCase() !== l1DeployManagerAddr);
        expect(downstreamLogs.length, "no CCIP-side logs - message did not reach the router pipeline").to.be.gt(0);

        // 6. Impersonate the L2 CCIP router and relay the message
        await network.provider.request({ method: "hardhat_impersonateAccount", params: [L2_CCIP_ROUTER] });
        await network.provider.send("hardhat_setBalance", [L2_CCIP_ROUTER, "0x56BC75E2D63100000"]); // 100 ETH
        const l2RouterSigner = await ethers.getSigner(L2_CCIP_ROUTER);

        const any2EvmMessage = {
            messageId: ethers.keccak256(ethers.toUtf8Bytes("integration-test-msg-id")),
            sourceChainSelector: ETHEREUM_SELECTOR,
            sender: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await l1DeployManager.getAddress()]),
            data: expectedPayload,
            destTokenAmounts: []
        };

        await expect(l2DeployManager.connect(l2RouterSigner).ccipReceive(any2EvmMessage))
            .to.emit(l2DeployManager, "BytecodeRequested")
            .withArgs(any2EvmMessage.messageId, bytecodeHash, initCodeHash);

        await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [L2_CCIP_ROUTER] });

        // The relayed message should have been received on L2.
        expect(await l2DeployManager.bytecodeRequested(bytecodeHash)).to.equal(initCodeHash);
        expect(await l2DeployManager.versionExists(bytecodeVersion)).to.be.false;

        // 7. Anyone can finalize by uploading the matching init code
        await expect(l2DeployManager.connect(anyone).uploadBytecode(bytecodeVersion, CometInitCode))
            .to.emit(l2DeployManager, "BytecodeUploaded")
            .withArgs(bytecodeHash);

        expect(await l2DeployManager.bytecodeRequested(bytecodeHash)).to.equal(ethers.ZeroHash);
        expect(await l2DeployManager.versionExists(bytecodeVersion)).to.be.true;
        expect(await l2DeployManager.getVerifiedBytecode(bytecodeVersion)).to.equal(CometInitCode);
    });
});
