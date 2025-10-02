import { expect } from "chai";
import { network, ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { CometInitCode, CometExtInitCode, ConstantPriceFeedInitCode } from "./testData.json";
import { domainResultToPlainObject, prepareAuditReportSignature } from "./helpers";
import type { EIP712Domain, Developers } from "./helpers";

const abiCoder = new ethers.AbiCoder();

const mockRouterFee = ethers.parseEther("0.1");
const mockChainSelectorId = "16015286601757825753";
const mockOtherChainId = 123456;

describe("L1/L2 DeployManager", function () {
    const fixture = async () => {
        const signers = await ethers.getSigners();
        const governor = signers[0];
        const guardian = signers[1];
        const auditors = signers.slice(2, 5); // 3 Auditors
        const WOOF: Developers = {
            keyDeveloper: signers[5],
            subDevelopers: signers.slice(6, 9),
            contractTypes: ["COMET", "VERSION_CONTROLLER"].map((ct: string): string => ethers.encodeBytes32String(ct))
        };
        const localTimelockL2 = signers[9];
        const users = signers.slice(10);

        const versionController = await upgrades.deployProxy(
            await ethers.getContractFactory("VersionController"),
            [await governor.getAddress(), await guardian.getAddress()],
            { kind: "uups" }
        );

        const AUDITOR_ROLE = await versionController.AUDITOR_ROLE();
        for (const auditor of auditors) await versionController.connect(governor).grantRole(AUDITOR_ROLE, auditor);

        const KEY_DEVELOPER_ROLE = await versionController.KEY_DEVELOPER_ROLE();
        await versionController.connect(governor).grantRole(KEY_DEVELOPER_ROLE, WOOF.keyDeveloper);

        await versionController
            .connect(governor)
            .assignDeveloperForContractTypes(WOOF.contractTypes, WOOF.keyDeveloper);

        for (const subDev of WOOF.subDevelopers)
            await versionController.connect(WOOF.keyDeveloper).addSubDeveloper(subDev);

        const mockRouter = await (await ethers.getContractFactory("MockCCIPRouter")).deploy();
        await mockRouter.setFee(mockRouterFee);

        const l1DeployManager = await upgrades.deployProxy(await ethers.getContractFactory("L1DeployManager"), [], {
            kind: "uups",
            constructorArgs: [await versionController.getAddress(), await mockRouter.getAddress()]
        });

        const l2DeployManager = await (
            await ethers.getContractFactory("L2DeployManager")
        ).deploy(l1DeployManager, mockRouter, localTimelockL2);
        await l1DeployManager.connect(governor).setChainConfig(mockOtherChainId, {
            l2DeployManager: l2DeployManager,
            destinationChainSelector: mockChainSelectorId,
            gasLimit: 5_000_000
        });

        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        await time.increase(time.duration.days(90));
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
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion_1_0_0 = { contractType: WOOF.contractTypes[0], version };
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode(bytecodeVersion_1_0_0, auditReport, signature);

        // Deploy mock tokens and oracle for Comet configuration
        const mockBaseToken = await (await ethers.getContractFactory("MockERC20")).deploy("Base Token", "BT");
        const mockCollateralToken = await (
            await ethers.getContractFactory("MockERC20")
        ).deploy("Collateral Token", "CT");

        // Deploy constant price feed for oracle
        const constantPriceFeedContractType = ethers.encodeBytes32String("ConstantPriceFeed");
        await versionController
            .connect(governor)
            .assignDeveloperForContractTypes([constantPriceFeedContractType], WOOF.keyDeveloper);
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: constantPriceFeedContractType,
            initCode: ConstantPriceFeedInitCode,
            sourceURL: "https://github.com/compound-finance/comet/blob/main/contracts/ConstantPriceFeed.sol"
        });
        const priceFeedVersion = { version: { major: 1, minor: 0, patch: 0 }, alternative: "" };
        const priceFeedBytecodeHash = await versionController.computeBytecodeHash(
            constantPriceFeedContractType,
            priceFeedVersion
        );
        const priceFeedSignature = await prepareAuditReportSignature(
            priceFeedBytecodeHash,
            ethers.keccak256(ConstantPriceFeedInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode(
                { contractType: constantPriceFeedContractType, version: priceFeedVersion },
                auditReport,
                priceFeedSignature
            );

        // Compute and deploy the price feed
        const constantPriceFeedVersion = { contractType: constantPriceFeedContractType, version: priceFeedVersion };
        const constantPriceFeedAddr = await l1DeployManager.computeAddress(
            constantPriceFeedVersion,
            ethers.ZeroHash,
            abiCoder.encode(["uint8", "int256"], [8, "100000000"]), // 1 * 10^8
            WOOF.keyDeveloper.address
        );

        await expect(
            l1DeployManager.connect(WOOF.keyDeveloper).deploy(
                constantPriceFeedVersion,
                ethers.ZeroHash,
                abiCoder.encode(["uint8", "int256"], [8, "100000000"]) // 1 * 10^8
            )
        )
            .to.emit(l1DeployManager, "ContractDeployed")
            .withArgs(
                [constantPriceFeedContractType, [[1, 0, 0], ""]],
                abiCoder.encode(["uint8", "int256"], [8, "100000000"]), // 1 * 10^8
                constantPriceFeedAddr,
                WOOF.keyDeveloper.address
            );

        return {
            governor,
            guardian,
            auditors,
            WOOF,
            localTimelockL2,
            users,
            versionController,
            mockRouter,
            l1DeployManager,
            l2DeployManager,
            bytecodeVersion_1_0_0,
            bytecodeHash_1_0_0,
            mockBaseToken,
            mockCollateralToken,
            constantPriceFeedAddr,
            constantPriceFeedVersion
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
        expect(await l2DeployManager.getVerifiedBytecode(bytecodeVersion_1_0_0)).to.equal(expectedBytecode);
        expect(await l2DeployManager.versionExists(bytecodeVersion_1_0_0)).to.be.true;
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
        const insufficientValue = ethers.parseEther("0.099");
        await expect(
            l1DeployManager
                .connect(WOOF.subDevelopers[0])
                .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, mockOtherChainId, { value: insufficientValue })
        )
            .revertedWithCustomError(l1DeployManager, "InsufficientBalance")
            .withArgs(insufficientValue, mockRouterFee);
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
        ).revertedWithCustomError(l1DeployManager, "OnlyDeveloperOrGovernor");
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

    it("Should allow to send bytecode using already deposited ETH", async () => {
        const { WOOF, l1DeployManager, bytecodeVersion_1_0_0, users, bytecodeHash_1_0_0 } = await restore();
        await users[0].sendTransaction({ to: l1DeployManager, value: ethers.parseEther("1") });
        const tx = await l1DeployManager
            .connect(WOOF.keyDeveloper)
            .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, mockOtherChainId);
        expect(await l1DeployManager.isVersionSentToChain(mockOtherChainId, bytecodeHash_1_0_0)).to.be.true;
        await expect(tx).changeEtherBalance(l1DeployManager, -mockRouterFee);
    });

    it("Should let governor withdraw ETH", async () => {
        const { l1DeployManager, users, governor } = await restore();
        const amount = ethers.parseEther("1");
        await users[0].sendTransaction({ to: l1DeployManager, value: amount });
        const tx = await l1DeployManager.connect(governor).withdrawETH();
        await expect(tx).changeEtherBalances([l1DeployManager, governor], [-amount, amount]);
    });

    it("Should revert when non-governor tries to withdraw ETH", async () => {
        const { l1DeployManager, users } = await restore();
        const amount = ethers.parseEther("1");
        await users[0].sendTransaction({ to: l1DeployManager, value: amount });
        await expect(l1DeployManager.connect(users[0]).withdrawETH()).to.be.revertedWithCustomError(
            l1DeployManager,
            "OnlyGovernor"
        );
    });

    it("Should deploy contract on L2 after bytecode is sent and developer access is granted", async () => {
        const {
            WOOF,
            l1DeployManager,
            l2DeployManager,
            bytecodeVersion_1_0_0,
            users,
            mockBaseToken,
            mockCollateralToken,
            constantPriceFeedAddr,
            governor
        } = await restore();

        // First send bytecode to L2
        await l1DeployManager
            .connect(WOOF.keyDeveloper)
            .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, mockOtherChainId, { value: mockRouterFee });

        // Become Developer on L2
        await l1DeployManager
            .connect(WOOF.keyDeveloper)
            .becomeDeveloperOnOtherChain(mockOtherChainId, { value: mockRouterFee });

        // Prepare Comet constructor parameters
        const cometConfiguration = {
            governor: governor.address,
            pauseGuardian: governor.address,
            baseToken: await mockBaseToken.getAddress(),
            baseTokenPriceFeed: constantPriceFeedAddr,
            extensionDelegate: ethers.ZeroAddress,
            supplyKink: "900000000000000000",
            supplyPerYearInterestRateSlopeLow: BigInt(1141552511) * BigInt(time.duration.years(1)),
            supplyPerYearInterestRateSlopeHigh: BigInt(101344495180) * BigInt(time.duration.years(1)),
            supplyPerYearInterestRateBase: 0,
            borrowKink: "900000000000000000",
            borrowPerYearInterestRateSlopeLow: BigInt(880834601) * BigInt(time.duration.years(1)),
            borrowPerYearInterestRateSlopeHigh: BigInt(114155251141) * BigInt(time.duration.years(1)),
            borrowPerYearInterestRateBase: BigInt(475646879) * BigInt(time.duration.years(1)),
            storeFrontPriceFactor: "600000000000000000",
            trackingIndexScale: "1000000000000000",
            baseTrackingSupplySpeed: 810185185185,
            baseTrackingBorrowSpeed: 821759259259,
            baseMinForRewards: 1000000000000,
            baseBorrowMin: 100000000,
            targetReserves: 20000000000000,
            assetConfigs: [
                {
                    asset: await mockCollateralToken.getAddress(),
                    priceFeed: constantPriceFeedAddr,
                    decimals: 18,
                    borrowCollateralFactor: "500000000000000000",
                    liquidateCollateralFactor: "700000000000000000",
                    liquidationFactor: "750000000000000000",
                    supplyCap: "100000000000000000000000"
                }
            ]
        };

        // Deploy on L2
        const salt = ethers.solidityPackedKeccak256(["string"], ["test-salt"]);
        const constructorParams = abiCoder.encode(
            [
                "tuple(address governor,address pauseGuardian,address baseToken,address baseTokenPriceFeed,address extensionDelegate,uint64 supplyKink,uint64 supplyPerYearInterestRateSlopeLow,uint64 supplyPerYearInterestRateSlopeHigh,uint64 supplyPerYearInterestRateBase,uint64 borrowKink,uint64 borrowPerYearInterestRateSlopeLow,uint64 borrowPerYearInterestRateSlopeHigh,uint64 borrowPerYearInterestRateBase,uint64 storeFrontPriceFactor,uint64 trackingIndexScale,uint64 baseTrackingSupplySpeed,uint64 baseTrackingBorrowSpeed,uint104 baseMinForRewards,uint104 baseBorrowMin,uint104 targetReserves,tuple(address asset,address priceFeed,uint8 decimals,uint64 borrowCollateralFactor,uint64 liquidateCollateralFactor,uint64 liquidationFactor,uint128 supplyCap)[] assetConfigs)"
            ],
            [cometConfiguration]
        );

        const deployedAddress = await l2DeployManager.computeAddress(
            bytecodeVersion_1_0_0,
            salt,
            constructorParams,
            WOOF.keyDeveloper
        );

        await l2DeployManager.connect(WOOF.keyDeveloper).deploy(bytecodeVersion_1_0_0, salt, constructorParams);

        // Verify contract was deployed
        expect(await ethers.provider.getCode(deployedAddress)).to.not.equal("0x");
    });

    it("Should revert deploy when bytecode is not available on L2", async () => {
        const {
            l2DeployManager,
            bytecodeVersion_1_0_0,
            mockBaseToken,
            mockCollateralToken,
            constantPriceFeedAddr,
            governor,
            l1DeployManager,
            WOOF
        } = await restore();

        // Prepare Comet constructor parameters
        const cometConfiguration = {
            governor: governor.address,
            pauseGuardian: governor.address,
            baseToken: await mockBaseToken.getAddress(),
            baseTokenPriceFeed: constantPriceFeedAddr,
            extensionDelegate: ethers.ZeroAddress,
            supplyKink: "900000000000000000",
            supplyPerYearInterestRateSlopeLow: BigInt(1141552511) * BigInt(time.duration.years(1)),
            supplyPerYearInterestRateSlopeHigh: BigInt(101344495180) * BigInt(time.duration.years(1)),
            supplyPerYearInterestRateBase: 0,
            borrowKink: "900000000000000000",
            borrowPerYearInterestRateSlopeLow: BigInt(880834601) * BigInt(time.duration.years(1)),
            borrowPerYearInterestRateSlopeHigh: BigInt(114155251141) * BigInt(time.duration.years(1)),
            borrowPerYearInterestRateBase: BigInt(475646879) * BigInt(time.duration.years(1)),
            storeFrontPriceFactor: "600000000000000000",
            trackingIndexScale: "1000000000000000",
            baseTrackingSupplySpeed: 810185185185,
            baseTrackingBorrowSpeed: 821759259259,
            baseMinForRewards: 1000000000000,
            baseBorrowMin: 100000000,
            targetReserves: 20000000000000,
            assetConfigs: [
                {
                    asset: await mockCollateralToken.getAddress(),
                    priceFeed: constantPriceFeedAddr,
                    decimals: 18,
                    borrowCollateralFactor: "500000000000000000",
                    liquidateCollateralFactor: "700000000000000000",
                    liquidationFactor: "750000000000000000",
                    supplyCap: "100000000000000000000000"
                }
            ]
        };

        const salt = ethers.solidityPackedKeccak256(["string"], ["test-salt"]);
        const constructorParams = abiCoder.encode(
            [
                "tuple(address governor,address pauseGuardian,address baseToken,address baseTokenPriceFeed,address extensionDelegate,uint64 supplyKink,uint64 supplyPerYearInterestRateSlopeLow,uint64 supplyPerYearInterestRateSlopeHigh,uint64 supplyPerYearInterestRateBase,uint64 borrowKink,uint64 borrowPerYearInterestRateSlopeLow,uint64 borrowPerYearInterestRateSlopeHigh,uint64 borrowPerYearInterestRateBase,uint64 storeFrontPriceFactor,uint64 trackingIndexScale,uint64 baseTrackingSupplySpeed,uint64 baseTrackingBorrowSpeed,uint104 baseMinForRewards,uint104 baseBorrowMin,uint104 targetReserves,tuple(address asset,address priceFeed,uint8 decimals,uint64 borrowCollateralFactor,uint64 liquidateCollateralFactor,uint64 liquidationFactor,uint128 supplyCap)[] assetConfigs)"
            ],
            [cometConfiguration]
        );

        await l1DeployManager
            .connect(WOOF.keyDeveloper)
            .becomeDeveloperOnOtherChain(mockOtherChainId, { value: mockRouterFee });

        await expect(
            l2DeployManager.connect(WOOF.keyDeveloper).deploy(bytecodeVersion_1_0_0, salt, constructorParams)
        ).to.be.revertedWithCustomError(l2DeployManager, "BytecodeIsEmpty");
    });

    it("Should compute correct address on L2", async () => {
        const {
            WOOF,
            l1DeployManager,
            l2DeployManager,
            bytecodeVersion_1_0_0,
            mockBaseToken,
            mockCollateralToken,
            constantPriceFeedAddr,
            governor
        } = await restore();

        // First send bytecode to L2
        await l1DeployManager
            .connect(WOOF.keyDeveloper)
            .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, mockOtherChainId, { value: mockRouterFee });

        // Prepare Comet constructor parameters
        const cometConfiguration = {
            governor: governor.address,
            pauseGuardian: governor.address,
            baseToken: await mockBaseToken.getAddress(),
            baseTokenPriceFeed: constantPriceFeedAddr,
            extensionDelegate: ethers.ZeroAddress,
            supplyKink: "900000000000000000",
            supplyPerYearInterestRateSlopeLow: BigInt(1141552511) * BigInt(time.duration.years(1)),
            supplyPerYearInterestRateSlopeHigh: BigInt(101344495180) * BigInt(time.duration.years(1)),
            supplyPerYearInterestRateBase: 0,
            borrowKink: "900000000000000000",
            borrowPerYearInterestRateSlopeLow: BigInt(880834601) * BigInt(time.duration.years(1)),
            borrowPerYearInterestRateSlopeHigh: BigInt(114155251141) * BigInt(time.duration.years(1)),
            borrowPerYearInterestRateBase: BigInt(475646879) * BigInt(time.duration.years(1)),
            storeFrontPriceFactor: "600000000000000000",
            trackingIndexScale: "1000000000000000",
            baseTrackingSupplySpeed: 810185185185,
            baseTrackingBorrowSpeed: 821759259259,
            baseMinForRewards: 1000000000000,
            baseBorrowMin: 100000000,
            targetReserves: 20000000000000,
            assetConfigs: [
                {
                    asset: await mockCollateralToken.getAddress(),
                    priceFeed: constantPriceFeedAddr,
                    decimals: 18,
                    borrowCollateralFactor: "500000000000000000",
                    liquidateCollateralFactor: "700000000000000000",
                    liquidationFactor: "750000000000000000",
                    supplyCap: "100000000000000000000000"
                }
            ]
        };

        const salt = ethers.solidityPackedKeccak256(["string"], ["test-salt"]);
        const constructorParams = abiCoder.encode(
            [
                "tuple(address governor,address pauseGuardian,address baseToken,address baseTokenPriceFeed,address extensionDelegate,uint64 supplyKink,uint64 supplyPerYearInterestRateSlopeLow,uint64 supplyPerYearInterestRateSlopeHigh,uint64 supplyPerYearInterestRateBase,uint64 borrowKink,uint64 borrowPerYearInterestRateSlopeLow,uint64 borrowPerYearInterestRateSlopeHigh,uint64 borrowPerYearInterestRateBase,uint64 storeFrontPriceFactor,uint64 trackingIndexScale,uint64 baseTrackingSupplySpeed,uint64 baseTrackingBorrowSpeed,uint104 baseMinForRewards,uint104 baseBorrowMin,uint104 targetReserves,tuple(address asset,address priceFeed,uint8 decimals,uint64 borrowCollateralFactor,uint64 liquidateCollateralFactor,uint64 liquidationFactor,uint128 supplyCap)[] assetConfigs)"
            ],
            [cometConfiguration]
        );
        const deployer = WOOF.keyDeveloper.address;

        await l1DeployManager
            .connect(WOOF.keyDeveloper)
            .becomeDeveloperOnOtherChain(mockOtherChainId, { value: mockRouterFee });

        // Compute address before deployment
        const computedAddress = await l2DeployManager.computeAddress(
            bytecodeVersion_1_0_0,
            salt,
            constructorParams,
            deployer
        );

        // Deploy and get actual address
        const actualAddress = await l2DeployManager
            .connect(WOOF.keyDeveloper)
            .deploy.staticCall(bytecodeVersion_1_0_0, salt, constructorParams);

        // Addresses should match
        expect(computedAddress).to.equal(actualAddress);
    });

    it("Should allow timelock to deploy contracts", async () => {
        const { governor, versionController, l1DeployManager, constantPriceFeedVersion, localTimelockL2 } =
            await restore();

        // Grant timelock the governor role
        const DEFAULT_ADMIN_ROLE = await versionController.DEFAULT_ADMIN_ROLE();
        await versionController.connect(governor).grantRole(DEFAULT_ADMIN_ROLE, localTimelockL2.address);

        // Prepare constructor parameters
        const constructorParams = abiCoder.encode(["uint8", "int256"], [8, "100000000"]); // 1 * 10^8
        const salt = ethers.solidityPackedKeccak256(["string"], ["timelock-test"]);

        // Compute expected address
        const expectedAddress = await l1DeployManager.computeAddress(
            constantPriceFeedVersion,
            salt,
            constructorParams,
            localTimelockL2.address
        );

        // Deploy using timelock and verify event
        await l1DeployManager.connect(localTimelockL2).deploy(constantPriceFeedVersion, salt, constructorParams);

        // Verify contract was deployed
        expect(await ethers.provider.getCode(expectedAddress)).to.not.equal("0x");
    });

    it("Should compute different addresses for different deployers", async () => {
        const {
            WOOF,
            l1DeployManager,
            l2DeployManager,
            bytecodeVersion_1_0_0,
            users,
            mockBaseToken,
            mockCollateralToken,
            constantPriceFeedAddr,
            governor
        } = await restore();

        // First send bytecode to L2
        await l1DeployManager
            .connect(WOOF.keyDeveloper)
            .sendBytecodeToOtherChain(bytecodeVersion_1_0_0, mockOtherChainId, { value: mockRouterFee });

        // Prepare Comet constructor parameters
        const cometConfiguration = {
            governor: governor.address,
            pauseGuardian: governor.address,
            baseToken: await mockBaseToken.getAddress(),
            baseTokenPriceFeed: constantPriceFeedAddr,
            extensionDelegate: ethers.ZeroAddress,
            supplyKink: "900000000000000000",
            supplyPerYearInterestRateSlopeLow: BigInt(1141552511) * BigInt(time.duration.years(1)),
            supplyPerYearInterestRateSlopeHigh: BigInt(101344495180) * BigInt(time.duration.years(1)),
            supplyPerYearInterestRateBase: 0,
            borrowKink: "900000000000000000",
            borrowPerYearInterestRateSlopeLow: BigInt(880834601) * BigInt(time.duration.years(1)),
            borrowPerYearInterestRateSlopeHigh: BigInt(114155251141) * BigInt(time.duration.years(1)),
            borrowPerYearInterestRateBase: BigInt(475646879) * BigInt(time.duration.years(1)),
            storeFrontPriceFactor: "600000000000000000",
            trackingIndexScale: "1000000000000000",
            baseTrackingSupplySpeed: 810185185185,
            baseTrackingBorrowSpeed: 821759259259,
            baseMinForRewards: 1000000000000,
            baseBorrowMin: 100000000,
            targetReserves: 20000000000000,
            assetConfigs: [
                {
                    asset: await mockCollateralToken.getAddress(),
                    priceFeed: constantPriceFeedAddr,
                    decimals: 18,
                    borrowCollateralFactor: "500000000000000000",
                    liquidateCollateralFactor: "700000000000000000",
                    liquidationFactor: "750000000000000000",
                    supplyCap: "100000000000000000000000"
                }
            ]
        };

        const salt = ethers.solidityPackedKeccak256(["string"], ["test-salt"]);
        const constructorParams = abiCoder.encode(
            [
                "tuple(address governor,address pauseGuardian,address baseToken,address baseTokenPriceFeed,address extensionDelegate,uint64 supplyKink,uint64 supplyPerYearInterestRateSlopeLow,uint64 supplyPerYearInterestRateSlopeHigh,uint64 supplyPerYearInterestRateBase,uint64 borrowKink,uint64 borrowPerYearInterestRateSlopeLow,uint64 borrowPerYearInterestRateSlopeHigh,uint64 borrowPerYearInterestRateBase,uint64 storeFrontPriceFactor,uint64 trackingIndexScale,uint64 baseTrackingSupplySpeed,uint64 baseTrackingBorrowSpeed,uint104 baseMinForRewards,uint104 baseBorrowMin,uint104 targetReserves,tuple(address asset,address priceFeed,uint8 decimals,uint64 borrowCollateralFactor,uint64 liquidateCollateralFactor,uint64 liquidationFactor,uint128 supplyCap)[] assetConfigs)"
            ],
            [cometConfiguration]
        );

        // Compute addresses for different deployers
        const address1 = await l2DeployManager.computeAddress(
            bytecodeVersion_1_0_0,
            salt,
            constructorParams,
            users[0].address
        );

        const address2 = await l2DeployManager.computeAddress(
            bytecodeVersion_1_0_0,
            salt,
            constructorParams,
            users[1].address
        );

        // Addresses should be different
        expect(address1).to.not.equal(address2);
    });

    it("Should let developer become developer on other chain", async () => {
        const { WOOF, l1DeployManager, l2DeployManager } = await restore();

        // Request developer access
        await expect(
            l1DeployManager
                .connect(WOOF.keyDeveloper)
                .becomeDeveloperOnOtherChain(mockOtherChainId, { value: mockRouterFee })
        )
            .to.emit(l1DeployManager, "DeveloperAccessRequested")
            .withArgs(mockOtherChainId, WOOF.keyDeveloper);
        expect(await l2DeployManager.developerUntil(WOOF.keyDeveloper)).to.equal(
            (await time.latest()) + time.duration.days(90)
        );
        expect(await l2DeployManager.isDeveloper(WOOF.keyDeveloper)).to.be.true;
    });

    it("Only developer can become developer", async () => {
        const { users, l1DeployManager } = await restore();
        await expect(
            l1DeployManager.connect(users[0]).becomeDeveloperOnOtherChain(mockOtherChainId, { value: mockRouterFee })
        ).revertedWithCustomError(l1DeployManager, "OnlyDeveloper");
    });
});
