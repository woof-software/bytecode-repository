import { expect } from "chai";
import { network, ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
    CometInitCode,
    CometExtInitCode,
    CometWithExtendedAssetListInitCode,
    CometExtAssetList,
    ConstantPriceFeedInitCode,
    CometProxyAdminInitCode,
    AssetListFactoryInitCode
} from "./testData.json";
import { EIP712Domain, Developers, domainResultToPlainObject, prepareAuditReportSignature } from "./helpers";

const abiCoder = new ethers.AbiCoder();

describe("MarketFactory", function () {
    const fixture = async () => {
        const signers = await ethers.getSigners();
        const governor = signers[0];
        const auditors = signers.slice(1, 4); // 3 Auditors
        const WOOF: Developers = {
            keyDeveloper: signers[4],
            subDevelopers: signers.slice(5, 8),
            contractTypes: [
                "Comet",
                "CometExt",
                "CometWithAssetList",
                "CometExtWithAssetList",
                "ConstantPriceFeed",
                "CometProxyAdmin",
                "AssetListFactory"
            ].map((ct: string): string => ethers.encodeBytes32String(ct))
        };
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
        const l1DeployManager = await upgrades.deployProxy(await ethers.getContractFactory("L1DeployManager"), [], {
            kind: "uups",
            constructorArgs: [await versionController.getAddress(), await mockRouter.getAddress()]
        });

        // Release and sign each bytecode
        // Comet
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts";
        const auditReport = "AUDIT_REPORT_URL";
        const version = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: ""
        };
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        let signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[0], version),
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[0], version }, auditReport, signature);

        // CometExt
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[1],
            initCode: CometExtInitCode,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[1], version),
            ethers.keccak256(CometExtInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[1], version }, auditReport, signature);

        // CometWithExtendedAssetList
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[2],
            initCode: CometWithExtendedAssetListInitCode,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[2], version),
            ethers.keccak256(CometWithExtendedAssetListInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[2], version }, auditReport, signature);

        // CometExtAssetList
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[3],
            initCode: CometExtAssetList,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[3], version),
            ethers.keccak256(CometExtAssetList),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[3], version }, auditReport, signature);

        // ConstantPriceFeed
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[4],
            initCode: ConstantPriceFeedInitCode,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[4], version),
            ethers.keccak256(ConstantPriceFeedInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[4], version }, auditReport, signature);

        // CometProxyAdmin
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[5],
            initCode: CometProxyAdminInitCode,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[5], version),
            ethers.keccak256(CometProxyAdminInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[5], version }, auditReport, signature);

        // AssetList
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[6],
            initCode: AssetListFactoryInitCode,
            sourceURL: URL
        });
        signature = await prepareAuditReportSignature(
            await versionController.computeBytecodeHash(WOOF.contractTypes[6], version),
            ethers.keccak256(AssetListFactoryInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        await versionController
            .connect(WOOF.keyDeveloper)
            .verifyBytecode({ contractType: WOOF.contractTypes[6], version }, auditReport, signature);

        // Deploy Mock tokens, Comet Proxy Admin, AssetList, Oracle
        const mockBaseToken = await (await ethers.getContractFactory("MockERC20")).deploy("Base token", "BT");
        const mockCollateralToken = await (
            await ethers.getContractFactory("MockERC20")
        ).deploy("Collateral token", "CT");
        const cometProxyAdminAddr = await l1DeployManager.computeAddress(
            { contractType: ethers.encodeBytes32String("CometProxyAdmin"), version },
            ethers.ZeroHash,
            "0x",
            users[0]
        );
        await l1DeployManager
            .connect(users[0])
            .deploy({ contractType: ethers.encodeBytes32String("CometProxyAdmin"), version }, ethers.ZeroHash, "0x");
        const constantPriceFeedAddr = await l1DeployManager.computeAddress(
            { contractType: ethers.encodeBytes32String("ConstantPriceFeed"), version },
            ethers.ZeroHash,
            abiCoder.encode(["uint8", "int256"], [8, ethers.parseUnits("1", 8)]),
            users[0]
        );
        await l1DeployManager
            .connect(users[0])
            .deploy(
                { contractType: ethers.encodeBytes32String("ConstantPriceFeed"), version },
                ethers.ZeroHash,
                abiCoder.encode(["uint8", "int256"], [8, ethers.parseUnits("1", 8)])
            );
        const assetListFactoryAddr = await l1DeployManager.computeAddress(
            { contractType: ethers.encodeBytes32String("AssetListFactory"), version },
            ethers.ZeroHash,
            "0x",
            users[0]
        );
        await l1DeployManager
            .connect(users[0])
            .deploy({ contractType: ethers.encodeBytes32String("AssetListFactory"), version }, ethers.ZeroHash, "0x");

        // Deploy MarketFactory
        const marketFactory = await (
            await ethers.getContractFactory("MarketFactory")
        ).deploy(versionController, cometProxyAdminAddr, assetListFactoryAddr);
        return {
            marketFactory,
            governor,
            WOOF,
            users,
            mockBaseToken,
            mockCollateralToken,
            constantPriceFeedAddr,
            version
        };
    };

    const restore = async () => await loadFixture(fixture);

    it("Should deploy market", async () => {
        const { marketFactory, governor, mockBaseToken, mockCollateralToken, constantPriceFeedAddr, version, users } =
            await restore();
        const configuration = {
            governor: governor,
            pauseGuardian: governor,
            baseToken: mockBaseToken,
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
                    asset: mockCollateralToken,
                    priceFeed: constantPriceFeedAddr,
                    decimals: 18,
                    borrowCollateralFactor: "500000000000000000",
                    liquidateCollateralFactor: "700000000000000000",
                    liquidationFactor: "750000000000000000",
                    supplyCap: "100000000000000000000000"
                }
            ]
        };
        const extConfiguration = {
            name32: ethers.encodeBytes32String("Compound Mock Base"),
            symbol32: ethers.encodeBytes32String("cMockBaseV3")
        };

        const resultAddresses = await marketFactory.computeCometAddresses(
            version,
            version,
            extConfiguration,
            configuration,
            ethers.ZeroHash,
            users[0],
            false
        );

        await marketFactory
            .connect(users[0])
            .deployComet(version, version, extConfiguration, configuration, ethers.ZeroHash, false);

        // Check comet
        expect(await ethers.provider.getCode(resultAddresses[0])).to.not.equal("0x");
        expect(await ethers.provider.getCode(resultAddresses[1])).to.not.equal("0x");
        expect(await ethers.provider.getCode(resultAddresses[2])).to.not.equal("0x");
        const comet = await ethers.getContractAt(["function governor() view returns (address)"], resultAddresses[2]);
        expect(await comet.governor()).to.equal(governor);
    });

    it("Should deploy Comet with extended asset list", async () => {
        const { marketFactory, governor, mockBaseToken, mockCollateralToken, constantPriceFeedAddr, version, users } =
            await restore();
        const configuration = {
            governor: governor,
            pauseGuardian: governor,
            baseToken: mockBaseToken,
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
                    asset: mockCollateralToken,
                    priceFeed: constantPriceFeedAddr,
                    decimals: 18,
                    borrowCollateralFactor: "500000000000000000",
                    liquidateCollateralFactor: "700000000000000000",
                    liquidationFactor: "750000000000000000",
                    supplyCap: "100000000000000000000000"
                }
            ]
        };
        const extConfiguration = {
            name32: ethers.encodeBytes32String("Compound Mock Base"),
            symbol32: ethers.encodeBytes32String("cMockBaseV3")
        };

        const resultAddresses = await marketFactory.computeCometAddresses(
            version,
            version,
            extConfiguration,
            configuration,
            ethers.ZeroHash,
            users[0],
            true
        );

        await marketFactory
            .connect(users[0])
            .deployComet(version, version, extConfiguration, configuration, ethers.ZeroHash, true);

        // Check comet
        expect(await ethers.provider.getCode(resultAddresses[0])).to.not.equal("0x");
        expect(await ethers.provider.getCode(resultAddresses[1])).to.not.equal("0x");
        expect(await ethers.provider.getCode(resultAddresses[2])).to.not.equal("0x");
        const comet = await ethers.getContractAt(["function assetList() view returns (address)"], resultAddresses[2]);
        expect(await comet.assetList()).to.not.equal(ethers.ZeroAddress);
    });
});
