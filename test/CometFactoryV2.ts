import { expect } from "chai";
import { network, ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
    CometInitCode,
    CometWithExtendedAssetListInitCode,
    CometExtInitCode,
    CometExtAssetList,
    ConstantPriceFeedInitCode,
    AssetListFactoryInitCode
} from "./testData.json";
import { EIP712Domain, Developers, domainResultToPlainObject, prepareAuditReportSignature } from "./helpers";

const abiCoder = new ethers.AbiCoder();

describe("CometFactoryV2", function () {
    const fixture = async () => {
        const signers = await ethers.getSigners();
        const governor = signers[0];
        const timelock = signers[1];
        const auditors = signers.slice(2, 5); // 3 Auditors
        const WOOF: Developers = {
            keyDeveloper: signers[5],
            subDevelopers: signers.slice(6, 9),
            contractTypes: [
                "Comet",
                "CometWithAssetList",
                "CometExt",
                "CometExtWithAssetList",
                "ConstantPriceFeed",
                "AssetListFactory"
            ].map((ct: string): string => ethers.encodeBytes32String(ct))
        };
        const users = signers.slice(10);

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

        // Release and verify Comet bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts";
        const auditReport = "AUDIT_REPORT_URL";
        const version_1_0_0 = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: ""
        };
        const version_2_0_0 = {
            version: { major: 2, minor: 0, patch: 0 },
            alternative: ""
        };

        // Release Comet v1.0.0
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0], // Comet
            initCode: CometInitCode,
            sourceURL: URL
        });
        let signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[0], version_1_0_0),
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[0], version: version_1_0_0 }, auditReport, signature);

        // Release CometWithAssetList v1.0.0
        await versionController.connect(WOOF.subDevelopers[1]).releaseBytecode({
            contractType: WOOF.contractTypes[1], // CometWithAssetList
            initCode: CometWithExtendedAssetListInitCode,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[1], version_1_0_0),
            ethers.keccak256(CometWithExtendedAssetListInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[1], version: version_1_0_0 }, auditReport, signature);

        // Release Comet v2.0.0 for version upgrade tests
        await versionController.connect(WOOF.subDevelopers[0]).releaseMajorVersion({
            contractType: WOOF.contractTypes[0], // Comet
            initCode: CometExtInitCode, // Using different bytecode to avoid BytecodeAlreadyUploaded error
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[0], version_2_0_0),
            ethers.keccak256(CometExtInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[0], version: version_2_0_0 }, auditReport, signature);

        // Deploy CometExt for extension delegates
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[2], // CometExt
            initCode: CometExtInitCode,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[2], version_1_0_0),
            ethers.keccak256(CometExtInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[2], version: version_1_0_0 }, auditReport, signature);

        // Deploy CometExtWithAssetList for CometWithAssetList extension delegates
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[3], // CometExtWithAssetList
            initCode: CometExtAssetList,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[3], version_1_0_0),
            ethers.keccak256(CometExtAssetList),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[3], version: version_1_0_0 }, auditReport, signature);

        // Deploy ConstantPriceFeed for Comet configuration
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[4], // ConstantPriceFeed
            initCode: ConstantPriceFeedInitCode,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[4], version_1_0_0),
            ethers.keccak256(ConstantPriceFeedInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[4], version: version_1_0_0 }, auditReport, signature);

        // Deploy AssetListFactory for CometWithAssetList
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[5], // AssetListFactory
            initCode: AssetListFactoryInitCode,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[5], version_1_0_0),
            ethers.keccak256(AssetListFactoryInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[5], version: version_1_0_0 }, auditReport, signature);

        // Deploy mock tokens and price feed
        const mockBaseToken = await (await ethers.getContractFactory("MockERC20")).deploy("Base Token", "BT");
        const mockCollateralToken = await (
            await ethers.getContractFactory("MockERC20")
        ).deploy("Collateral Token", "CT");

        const mockRouter = await (await ethers.getContractFactory("MockCCIPRouter")).deploy();
        const l1DeployManager = await upgrades.deployProxy(await ethers.getContractFactory("L1DeployManager"), [], {
            kind: "uups",
            constructorArgs: [await versionController.getAddress(), await mockRouter.getAddress()]
        });

        // Deploy constant price feed
        const constantPriceFeedAddr = await l1DeployManager.computeAddress(
            { contractType: WOOF.contractTypes[4], version: version_1_0_0 },
            ethers.ZeroHash,
            abiCoder.encode(["uint8", "int256"], [8, ethers.parseUnits("1", 8)]),
            governor.address
        );
        await l1DeployManager
            .connect(governor)
            .deploy(
                { contractType: WOOF.contractTypes[4], version: version_1_0_0 },
                ethers.ZeroHash,
                abiCoder.encode(["uint8", "int256"], [8, ethers.parseUnits("1", 8)])
            );

        // Deploy AssetListFactory
        const assetListFactoryAddr = await l1DeployManager.computeAddress(
            { contractType: WOOF.contractTypes[5], version: version_1_0_0 },
            ethers.ZeroHash,
            "0x",
            governor.address
        );
        await l1DeployManager
            .connect(governor)
            .deploy({ contractType: WOOF.contractTypes[5], version: version_1_0_0 }, ethers.ZeroHash, "0x");

        // Deploy CometFactoryV2 instances (both variants)
        const cometFactory = await (
            await ethers.getContractFactory("CometFactoryV2")
        ).deploy(version_1_0_0, versionController, timelock, false);

        const cometFactoryWithAssetList = await (
            await ethers.getContractFactory("CometFactoryV2")
        ).deploy(version_1_0_0, versionController, timelock, true);

        // Create sample Comet configuration
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

        return {
            governor,
            timelock,
            auditors,
            WOOF,
            users,
            versionController,
            cometFactory,
            cometFactoryWithAssetList,
            mockBaseToken,
            mockCollateralToken,
            constantPriceFeedAddr,
            assetListFactoryAddr,
            cometConfiguration,
            version_1_0_0,
            version_2_0_0,
            l1DeployManager
        };
    };

    const restore = async () => await loadFixture(fixture);

    describe("Constructor", function () {
        it("Should set initial state correctly for standard Comet factory", async () => {
            const { cometFactory, timelock, versionController, version_1_0_0 } = await restore();

            expect(await cometFactory.timelock()).to.equal(timelock.address);
            expect(await cometFactory.bytecodeProvider()).to.equal(await versionController.getAddress());
            expect(await cometFactory.COMET_CT()).to.equal(ethers.encodeBytes32String("Comet"));

            const currentVersion = await cometFactory.version();
            expect(currentVersion.version.major).to.equal(version_1_0_0.version.major);
            expect(currentVersion.version.minor).to.equal(version_1_0_0.version.minor);
            expect(currentVersion.version.patch).to.equal(version_1_0_0.version.patch);
            expect(currentVersion.alternative).to.equal(version_1_0_0.alternative);
        });

        it("Should set COMET_CT to CometWithAssetList when withAssetList is true", async () => {
            const { cometFactoryWithAssetList, timelock, versionController } = await restore();

            expect(await cometFactoryWithAssetList.timelock()).to.equal(timelock.address);
            expect(await cometFactoryWithAssetList.bytecodeProvider()).to.equal(await versionController.getAddress());
            expect(await cometFactoryWithAssetList.COMET_CT()).to.equal(
                ethers.encodeBytes32String("CometWithAssetList")
            );
        });
    });

    describe("setVersion", function () {
        it("Should allow timelock to set iterative version", async () => {
            const { cometFactory, timelock, version_2_0_0 } = await restore();

            await expect(cometFactory.connect(timelock).setVersion(version_2_0_0))
                .to.emit(cometFactory, "VersionSet")
                .withArgs([
                    [version_2_0_0.version.major, version_2_0_0.version.minor, version_2_0_0.version.patch],
                    version_2_0_0.alternative
                ]);

            const currentVersion = await cometFactory.version();
            expect(currentVersion.version.major).to.equal(version_2_0_0.version.major);
        });

        it("Should revert when non-timelock calls setVersion", async () => {
            const { cometFactory, users, version_2_0_0 } = await restore();

            await expect(cometFactory.connect(users[0]).setVersion(version_2_0_0)).to.be.revertedWithCustomError(
                cometFactory,
                "OnlyTimelock"
            );
        });

        it("Should revert when version doesn't exist", async () => {
            const { cometFactory, timelock } = await restore();

            const nonExistentVersion = {
                version: { major: 5, minor: 0, patch: 0 },
                alternative: ""
            };

            await expect(cometFactory.connect(timelock).setVersion(nonExistentVersion)).to.be.revertedWithCustomError(
                cometFactory,
                "NonExistingVersion"
            );
        });

        it("Should revert when update is not iterative (major version jump > 1)", async () => {
            const { cometFactory, timelock, versionController, WOOF, auditors } = await restore();

            // Create version 3.0.0 (skipping 2.0.0)
            const version_3_0_0 = {
                version: { major: 3, minor: 0, patch: 0 },
                alternative: ""
            };

            // Release and verify version 3.0.0
            await versionController.connect(WOOF.subDevelopers[0]).releaseMajorVersion({
                contractType: await cometFactory.COMET_CT(),
                initCode: CometInitCode,
                sourceURL: "https://github.com/compound-finance/comet/blob/main/contracts"
            });
            const signature = await prepareAuditReportSignature(
                await versionController.computeBytecodeHash(await cometFactory.COMET_CT(), version_3_0_0),
                ethers.keccak256(CometInitCode),
                "AUDIT_REPORT_URL",
                await versionController.getAddress(),
                auditors[0]
            );
            await versionController
                .connect(WOOF.keyDeveloper)
                .verifyBytecode(
                    { contractType: await cometFactory.COMET_CT(), version: version_3_0_0 },
                    "AUDIT_REPORT_URL",
                    signature
                );

            await expect(cometFactory.connect(timelock).setVersion(version_3_0_0)).to.be.revertedWithCustomError(
                cometFactory,
                "OnlyIterativeUpdate"
            );
        });

        it("Should revert when trying to downgrade major version", async () => {
            const { cometFactory, timelock, version_2_0_0 } = await restore();

            // First upgrade to v2.0.0
            await cometFactory.connect(timelock).setVersion(version_2_0_0);

            // Try to downgrade back to v1.0.0
            const version_1_0_0 = {
                version: { major: 1, minor: 0, patch: 0 },
                alternative: ""
            };

            await expect(cometFactory.connect(timelock).setVersion(version_1_0_0)).to.be.revertedWithCustomError(
                cometFactory,
                "OnlyIterativeUpdate"
            );
        });
    });

    describe("clone", function () {
        it("Should deploy Comet successfully with valid configuration", async () => {
            const { cometFactory, users, cometConfiguration } = await restore();

            const deployedAddress = await cometFactory.connect(users[0]).clone.staticCall(cometConfiguration);

            await cometFactory.connect(users[0]).clone(cometConfiguration);

            expect(await ethers.provider.getCode(deployedAddress)).to.not.equal("0x");

            // Verify the deployed contract has correct governor
            const comet = await ethers.getContractAt(["function governor() view returns (address)"], deployedAddress);
            expect(await comet.governor()).to.equal(cometConfiguration.governor);
        });

        it("Should increment counter for deployer", async () => {
            const { cometFactory, users, cometConfiguration } = await restore();

            const initialCounter = await cometFactory.counters(users[0].address);
            expect(initialCounter).to.equal(0);

            await cometFactory.connect(users[0]).clone(cometConfiguration);

            const finalCounter = await cometFactory.counters(users[0].address);
            expect(finalCounter).to.equal(1);
        });

        it("Should use different salts for different deployers", async () => {
            const { cometFactory, users, cometConfiguration } = await restore();

            const address1 = await cometFactory.connect(users[0]).clone.staticCall(cometConfiguration);
            await cometFactory.connect(users[0]).clone(cometConfiguration);

            const address2 = await cometFactory.connect(users[1]).clone.staticCall(cometConfiguration);
            await cometFactory.connect(users[1]).clone(cometConfiguration);

            expect(address1).to.not.equal(address2);
        });

        it("Should use incremented salt for same deployer", async () => {
            const { cometFactory, users, cometConfiguration } = await restore();

            const address1 = await cometFactory.connect(users[0]).clone.staticCall(cometConfiguration);
            await cometFactory.connect(users[0]).clone(cometConfiguration);

            const address2 = await cometFactory.connect(users[0]).clone.staticCall(cometConfiguration);
            await cometFactory.connect(users[0]).clone(cometConfiguration);

            expect(address1).to.not.equal(address2);
            expect(await cometFactory.counters(users[0].address)).to.equal(2);
        });

        it("Should work with updated version after setVersion", async () => {
            const { cometFactory, timelock, users, cometConfiguration, version_2_0_0 } = await restore();

            // Upgrade to v2.0.0
            await cometFactory.connect(timelock).setVersion(version_2_0_0);

            const deployedAddress = await cometFactory.connect(users[0]).clone.staticCall(cometConfiguration);
            await cometFactory.connect(users[0]).clone(cometConfiguration);

            expect(await ethers.provider.getCode(deployedAddress)).to.not.equal("0x");
        });
    });

    describe("CometWithAssetList variant", function () {
        it("Should deploy CometWithAssetList successfully", async () => {
            const {
                cometFactoryWithAssetList,
                users,
                cometConfiguration,
                assetListFactoryAddr,
                l1DeployManager,
                WOOF,
                version_1_0_0
            } = await restore();

            // First deploy CometExtWithAssetList to use as extensionDelegate
            const extConfiguration = [
                ethers.encodeBytes32String("Compound Mock Base"),
                ethers.encodeBytes32String("cMockBaseV3")
            ];

            const cometExtAddr = await l1DeployManager.computeAddress(
                { contractType: WOOF.contractTypes[3], version: version_1_0_0 }, // CometExtWithAssetList
                ethers.ZeroHash,
                abiCoder.encode(["tuple(bytes32,bytes32)", "address"], [extConfiguration, assetListFactoryAddr]),
                users[0].address
            );

            await l1DeployManager.connect(users[0]).deploy(
                { contractType: WOOF.contractTypes[3], version: version_1_0_0 }, // CometExtWithAssetList
                ethers.ZeroHash,
                abiCoder.encode(["tuple(bytes32,bytes32)", "address"], [extConfiguration, assetListFactoryAddr])
            );

            // Update configuration to use the deployed CometExt as extensionDelegate
            const configWithExtension = {
                ...cometConfiguration,
                extensionDelegate: cometExtAddr
            };

            const deployedAddress = await cometFactoryWithAssetList
                .connect(users[0])
                .clone.staticCall(configWithExtension);
            await cometFactoryWithAssetList.connect(users[0]).clone(configWithExtension);

            expect(await ethers.provider.getCode(deployedAddress)).to.not.equal("0x");

            // Verify the deployed contract has an asset list
            const comet = await ethers.getContractAt(["function assetList() view returns (address)"], deployedAddress);
            expect(await comet.assetList()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should use CometWithAssetList contract type", async () => {
            const { cometFactoryWithAssetList } = await restore();

            expect(await cometFactoryWithAssetList.COMET_CT()).to.equal(
                ethers.encodeBytes32String("CometWithAssetList")
            );
        });
    });
});
