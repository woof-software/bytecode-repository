import { expect } from "chai";
import { network, ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { CometInitCode, CometExtInitCode } from "./testData.json";
import { EIP712Domain, Developers, domainResultToPlainObject, prepareAuditReportSignature } from "./helpers";

const mockRouterFee = ethers.parseEther("0.1");
const mockChainSelectorId = "16015286601757825753";
const mockOtherChainId = 123456;

describe("L1/L2 DeployManager", function () {
    const fixture = async () => {
        const signers = await ethers.getSigners();
        const governor = signers[0];
        const auditors = signers.slice(1, 4); // 3 Auditors
        const WOOF: Developers = {
            keyDeveloper: signers[4],
            subDevelopers: signers.slice(5, 8),
            contractTypes: ["COMET", "VERSION_CONTROLLER"].map((ct: string): string => ethers.encodeBytes32String(ct))
        };
        const localTimelockL2 = signers[8];
        const users = signers.slice(9);

        const versionController = await upgrades.deployProxy(
            await ethers.getContractFactory("VersionController"),
            [await governor.getAddress()],
            { kind: "uups" }
        );

        const AUDITOR_ROLE = await versionController.AUDITOR_ROLE();
        for (const auditor of auditors) await versionController.connect(governor).grantRole(AUDITOR_ROLE, auditor);

        const KEY_DEVELOPER_ROLE = await versionController.KEY_DEVELOPER_ROLE();
        await versionController.connect(governor).grantRole(KEY_DEVELOPER_ROLE, WOOF.keyDeveloper);

        for (const contractType of WOOF.contractTypes)
            await versionController.connect(governor).assignDeveloperForContractType(contractType, WOOF.keyDeveloper);

        for (const subDev of WOOF.subDevelopers)
            await versionController.connect(WOOF.keyDeveloper).addSubDeveloper(subDev);

        const mockRouter = await (await ethers.getContractFactory("MockCCIPRouter")).deploy();
        await mockRouter.setFee(mockRouterFee);
        const mockFactoryL1 = await (await ethers.getContractFactory("MockFactory")).deploy();
        const mockFactoryL2 = await (await ethers.getContractFactory("MockFactory")).deploy();

        const l1DeployManager = await upgrades.deployProxy(await ethers.getContractFactory("L1DeployManager"), [], {
            kind: "uups",
            constructorArgs: [await versionController.getAddress(), await mockRouter.getAddress()]
        });
        await l1DeployManager.connect(governor).setContractTypeFactory(WOOF.contractTypes[0], mockFactoryL1);

        const l2DeployManager = await (
            await ethers.getContractFactory("L2DeployManager")
        ).deploy(l1DeployManager, localTimelockL2, mockRouter);
        await l2DeployManager.connect(localTimelockL2).setContractTypeFactory(WOOF.contractTypes[0], mockFactoryL2);
        await l1DeployManager.connect(governor).setChainConfig(mockOtherChainId, {
            l2DeployManager: l2DeployManager,
            destinationChainSelector: mockChainSelectorId,
            gasLimit: 1_000_000
        });

        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Release new major version
        const NEW_URL = "https://github.com/compound-finance/comet/blob/main/contracts/CometExt.sol";
        await versionController.connect(WOOF.subDevelopers[1]).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometExtInitCode,
            sourceURL: NEW_URL
        });
        // Verify bytecode 1.0.0
        const version = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: ""
        };
        const bytecodeHash_1_0_0 = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const auditReport = "AUDIT_REPORT_URL";
        const signature = await prepareAuditReportSignature(
            bytecodeHash_1_0_0,
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion_1_0_0 = { contractType: WOOF.contractTypes[0], version };
        await versionController.connect(auditors[0]).verifyBytecode(bytecodeVersion_1_0_0, auditReport, signature);

        return {
            governor,
            auditors,
            WOOF,
            localTimelockL2,
            users,
            versionController,
            mockRouter,
            mockFactoryL1,
            mockFactoryL2,
            l1DeployManager,
            l2DeployManager,
            bytecodeVersion_1_0_0,
            bytecodeHash_1_0_0
        };
    };

    const restore = async () => await loadFixture(fixture);

    it("Should send bytecode to other chain", async () => {
        const { WOOF, l1DeployManager, l2DeployManager, versionController, bytecodeVersion_1_0_0, bytecodeHash_1_0_0 } =
            await restore();
        await l1DeployManager
            .connect(WOOF.keyDeveloper)
            .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, mockOtherChainId, { value: mockRouterFee });

        const expectedBytecode = await versionController.getVerifiedBytecode(bytecodeVersion_1_0_0);
        expect(await l2DeployManager.getBytecode(bytecodeVersion_1_0_0)).to.equal(expectedBytecode);
        expect(await l1DeployManager.isVersionSentToChain(mockOtherChainId, bytecodeHash_1_0_0)).to.be.true;
    });

    it("Should not let send same bytecode to same chain more than once", async () => {
        const { WOOF, l1DeployManager, bytecodeVersion_1_0_0, bytecodeHash_1_0_0 } = await restore();
        await l1DeployManager
            .connect(WOOF.keyDeveloper)
            .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, mockOtherChainId, { value: mockRouterFee });
        // Try to send one more time
        await expect(
            l1DeployManager
                .connect(WOOF.subDevelopers[0])
                .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, mockOtherChainId, { value: mockRouterFee })
        )
            .revertedWithCustomError(l1DeployManager, "BytecodeAlreadySent")
            .withArgs(mockOtherChainId, bytecodeHash_1_0_0);
    });

    it("Should not send same bytecode if not enough ETH funds sent", async () => {
        const { WOOF, l1DeployManager, bytecodeVersion_1_0_0 } = await restore();
        await expect(
            l1DeployManager
                .connect(WOOF.subDevelopers[0])
                .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, mockOtherChainId, { value: mockRouterFee - 1000n })
        ).revertedWithCustomError(l1DeployManager, "InsufficientBalance");
    });

    it("Should revert if setter called by non-governor address in L1DeployManager", async () => {
        const { users, l1DeployManager } = await restore();
        await expect(
            l1DeployManager.connect(users[0]).setChainConfig(2, {
                l2DeployManager: ethers.ZeroAddress,
                gasLimit: 120_000,
                destinationChainSelector: 1000
            })
        ).revertedWithCustomError(l1DeployManager, "OnlyGovernor");
    });

    it("Should revert if send function called neither by key nor sub developer", async () => {
        const { users, l1DeployManager, bytecodeVersion_1_0_0 } = await restore();
        await expect(
            l1DeployManager
                .connect(users[1])
                .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, mockOtherChainId, { value: mockRouterFee })
        ).revertedWithCustomError(l1DeployManager, "OnlyDeveloper");
    });

    it("Should revert if setter called by non-local timelock in L2DeployManager", async () => {
        const { users, l2DeployManager, WOOF } = await restore();
        await expect(
            l2DeployManager.connect(users[2]).setContractTypeFactory(WOOF.contractTypes[0], ethers.ZeroAddress)
        ).revertedWithCustomError(l2DeployManager, "OnlyTimelock");
    });

    it("Should not receive bytecode if sender is not L1DeployManager", async () => {
        const { users, mockRouter, l2DeployManager, bytecodeVersion_1_0_0, bytecodeHash_1_0_0, versionController } =
            await restore();
        const coder = new ethers.AbiCoder();
        const encodedArgs = coder.encode(["tuple(uint256 gasLimit, bool strict)"], [[1_000_000, true]]);
        const GENERIC_EXTRA_ARGS_V2_TAG = "0x181dcf10";
        const evm2AnyMessage = {
            receiver: coder.encode(["address"], [await l2DeployManager.getAddress()]),
            data: coder.encode(
                ["bytes32", "bytes"],
                [bytecodeHash_1_0_0, await versionController.getVerifiedBytecode(bytecodeVersion_1_0_0)]
            ),
            tokenAmounts: [],
            feeToken: ethers.ZeroAddress,
            extraArgs: ethers.concat([GENERIC_EXTRA_ARGS_V2_TAG, encodedArgs])
        };
        await expect(
            mockRouter.connect(users[0]).ccipSend(mockChainSelectorId, evm2AnyMessage, { value: mockRouterFee })
        )
            .revertedWithCustomError(mockRouter, "ReceiverError")
            .withArgs(ethers.id("InvalidSender()").slice(0, 10));
    });

    it("Should revert sending bytecode to an unsupported chain", async () => {
        const { WOOF, l1DeployManager, bytecodeVersion_1_0_0 } = await restore();
        const unsupportedChainId = 123;
        await expect(
            l1DeployManager
                .connect(WOOF.keyDeveloper)
                .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, unsupportedChainId)
        )
            .revertedWithCustomError(l1DeployManager, "UnsupportedChain")
            .withArgs(unsupportedChainId);
    });
});
