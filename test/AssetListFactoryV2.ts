import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
    AssetListV2InitCode,
    CometV2MockInitCode,
    CometWithExtendedAssetListV2InitCode,
    CometExtAssetList,
    ConfiguratorV2InitCode,
    ConstantPriceFeedInitCode
} from "./testData.json";
import { prepareAuditReportSignature } from "./helpers";
import type { Developers } from "./helpers";

interface ImmutableAssetConfig {
    asset: string;
    priceFeed: string;
}

interface AssetInfo {
    offset: bigint;
    asset: string;
    priceFeed: string;
    scale: bigint;
    borrowCollateralFactor: bigint;
    liquidateCollateralFactor: bigint;
    liquidationFactor: bigint;
    supplyCap: bigint;
}

const abiCoder = new ethers.AbiCoder();

const ASSET_CONFIG =
    "tuple(address asset, address priceFeed, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap)";
const STORAGE_ASSET_CONFIG =
    "tuple(uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap)";
const CONFIGURATION =
    "tuple(address governor, address pauseGuardian, address baseToken, address baseTokenPriceFeed, address extensionDelegate, uint64 supplyKink, uint64 supplyPerYearInterestRateSlopeLow, uint64 supplyPerYearInterestRateSlopeHigh, uint64 supplyPerYearInterestRateBase, uint64 borrowKink, uint64 borrowPerYearInterestRateSlopeLow, uint64 borrowPerYearInterestRateSlopeHigh, uint64 borrowPerYearInterestRateBase, uint64 storeFrontPriceFactor, uint64 trackingIndexScale, uint64 baseTrackingSupplySpeed, uint64 baseTrackingBorrowSpeed, uint104 baseMinForRewards, uint104 baseBorrowMin, uint104 targetReserves, address assetList)";

const ASSET_LIST_ABI = [
    "function TYPEHASH() view returns (bytes32)",
    "function numAssets() view returns (uint8)",
    "function configHash() view returns (bytes32)",
    "function configurator() view returns (address)",
    `function initialize(${STORAGE_ASSET_CONFIG}[] storageConfigs)`,
    `function setAssetConfigs(${STORAGE_ASSET_CONFIG}[] storageConfigs)`,
    "function getAssetInfo(uint8 i) view returns (tuple(uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))",
    "error NoAssets()",
    "error ZeroConfigurator()"
];

const CONFIGURATOR_ABI = [
    "function initialize(address governor_)",
    "function setFactory(address cometProxy, address newFactory)",
    `function setConfiguration(address cometProxy, ${CONFIGURATION} newConfiguration)`,
    "function setAssetListFactory(address cometProxy, address newAssetListFactory)",
    `function addAsset(address cometProxy, ${ASSET_CONFIG} assetConfig)`,
    "function updateAssetPriceFeed(address cometProxy, address asset, address newPriceFeed)",
    "function updateAssetSupplyCap(address cometProxy, address asset, uint128 newSupplyCap)",
    `function getStorageAssetConfig(address cometProxy) view returns (${STORAGE_ASSET_CONFIG}[])`,
    "function deployAssetList(address cometProxy) returns (address assetListProxy, address newAssetListImpl)",
    "function deploy(address cometProxy) returns (address)"
];

// Mirrors ConfigHash.hashConfig(TYPEHASH, abi.encode(assetConfigs)) computed in the AssetList constructor
const computeConfigHash = (typeHash: string, assetConfigs: ImmutableAssetConfig[]): string =>
    ethers.keccak256(
        ethers.concat([typeHash, abiCoder.encode(["tuple(address asset, address priceFeed)[]"], [assetConfigs])])
    );

describe("AssetListFactoryV2", function () {
    const fixture = async () => {
        const signers = await ethers.getSigners();
        const governor = signers[0];
        const timelock = signers[1];
        const auditors = signers.slice(2, 5);
        const WOOF: Developers = {
            keyDeveloper: signers[5],
            subDevelopers: signers.slice(6, 9),
            contractTypes: ["AssetList", "CometWithAssetList"].map((ct: string): string =>
                ethers.encodeBytes32String(ct)
            )
        };
        // Address allowed to call the setters of the AssetList, the Configurator proxy in production
        const configurator = signers[9];
        const users = signers.slice(10);

        const versionController = await upgrades.deployProxy(
            await ethers.getContractFactory("VersionController"),
            [await governor.getAddress(), await timelock.getAddress()],
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

        const URL = "https://github.com/compound-finance/comet/blob/main/contracts";
        const auditReport = "AUDIT_REPORT_URL";
        const version_1_0_0 = { version: { major: 1, minor: 0, patch: 0 }, alternative: "" };
        const version_2_0_0 = { version: { major: 2, minor: 0, patch: 0 }, alternative: "" };

        const verify = async (contractType: string, version: typeof version_1_0_0, initCode: string) => {
            const signature = await prepareAuditReportSignature(
                await versionController.computeBytecodeHash(contractType, version),
                ethers.keccak256(initCode),
                auditReport,
                await versionController.getAddress(),
                auditors[0]
            );
            await versionController
                .connect(WOOF.keyDeveloper)
                .verifyBytecode({ contractType, version }, auditReport, signature);
        };

        // Release and verify AssetList v1.0.0
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: AssetListV2InitCode,
            sourceURL: URL
        });
        await verify(WOOF.contractTypes[0], version_1_0_0, AssetListV2InitCode);

        // Release and verify CometWithAssetList v1.0.0 for the Configurator integration test
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[1],
            initCode: CometWithExtendedAssetListV2InitCode,
            sourceURL: URL
        });
        await verify(WOOF.contractTypes[1], version_1_0_0, CometWithExtendedAssetListV2InitCode);

        // Release AssetList v2.0.0 for version upgrade tests
        await time.increase(time.duration.days(90));
        await versionController.connect(WOOF.subDevelopers[0]).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometV2MockInitCode, // Different bytecode to avoid BytecodeAlreadyUploaded error
            sourceURL: URL
        });
        await verify(WOOF.contractTypes[0], version_2_0_0, CometV2MockInitCode);

        const assetListFactory = await (
            await ethers.getContractFactory("AssetListFactoryV2")
        ).deploy(version_1_0_0, versionController, timelock);

        // Mock tokens and a price feed with 8 decimals, as required by AssetList
        const mockBaseToken = await (await ethers.getContractFactory("MockERC20")).deploy("Base Token", "BT");
        const mockCollateralToken = await (
            await ethers.getContractFactory("MockERC20")
        ).deploy("Collateral Token", "CT");
        const priceFeed = await new ethers.ContractFactory(
            ["constructor(uint8 decimals_, int256 constantPrice_)"],
            ConstantPriceFeedInitCode,
            governor
        ).deploy(8, 100000000);

        // Immutable part of the asset configurations, passed to the AssetList constructor with the configurator.
        // Asset decimals are read from the token by AssetList
        const assetConfigs: ImmutableAssetConfig[] = [
            {
                asset: await mockCollateralToken.getAddress(),
                priceFeed: await priceFeed.getAddress()
            }
        ];

        return {
            governor,
            timelock,
            WOOF,
            configurator,
            users,
            versionController,
            assetListFactory,
            mockBaseToken,
            priceFeed,
            assetConfigs,
            version_1_0_0,
            version_2_0_0
        };
    };

    const restore = async () => await loadFixture(fixture);

    const toTuple = (c: ImmutableAssetConfig) => [c.asset, c.priceFeed];

    describe("Constructor", function () {
        it("Should set initial state correctly", async () => {
            const { assetListFactory, timelock, versionController, version_1_0_0 } = await restore();

            expect(await assetListFactory.timelock()).to.equal(timelock.address);
            expect(await assetListFactory.bytecodeProvider()).to.equal(await versionController.getAddress());
            expect(await assetListFactory.ASSET_LIST_CT()).to.equal(ethers.encodeBytes32String("AssetList"));

            const currentVersion = await assetListFactory.version();
            expect(currentVersion.version.major).to.equal(version_1_0_0.version.major);
            expect(currentVersion.version.minor).to.equal(version_1_0_0.version.minor);
            expect(currentVersion.version.patch).to.equal(version_1_0_0.version.patch);
            expect(currentVersion.alternative).to.equal(version_1_0_0.alternative);
        });
    });

    describe("setVersion", function () {
        it("Should allow timelock to set iterative version", async () => {
            const { assetListFactory, timelock, version_2_0_0 } = await restore();

            await expect(assetListFactory.connect(timelock).setVersion(version_2_0_0))
                .to.emit(assetListFactory, "VersionSet")
                .withArgs([
                    [version_2_0_0.version.major, version_2_0_0.version.minor, version_2_0_0.version.patch],
                    version_2_0_0.alternative
                ]);

            expect((await assetListFactory.version()).version.major).to.equal(version_2_0_0.version.major);
        });

        it("Should revert when non-timelock calls setVersion", async () => {
            const { assetListFactory, users, version_2_0_0 } = await restore();

            await expect(assetListFactory.connect(users[0]).setVersion(version_2_0_0)).to.be.revertedWithCustomError(
                assetListFactory,
                "OnlyTimelock"
            );
        });

        it("Should revert when version doesn't exist", async () => {
            const { assetListFactory, timelock } = await restore();

            await expect(
                assetListFactory
                    .connect(timelock)
                    .setVersion({ version: { major: 1, minor: 1, patch: 0 }, alternative: "" })
            ).to.be.revertedWithCustomError(assetListFactory, "NonExistingVersion");
        });

        describe("Version rules", function () {
            const fixtureWithMock = async () => {
                const timelock = (await ethers.getSigners())[0];
                const bytecodeProviderMock = await (await ethers.getContractFactory("BytecodeProviderMock")).deploy();
                return await (await ethers.getContractFactory("AssetListFactoryV2"))
                    .connect(timelock)
                    .deploy(
                        { version: { major: 1n, minor: 5n, patch: 3n }, alternative: "" },
                        bytecodeProviderMock,
                        timelock
                    );
            };

            const v = (major: bigint, minor: bigint, patch: bigint) => ({
                version: { major, minor, patch },
                alternative: ""
            });

            it("1.5.3 => 1.5.1 (patch rollback)", async () => {
                const factory = await loadFixture(fixtureWithMock);
                await factory.setVersion(v(1n, 5n, 1n));
                expect((await factory.version()).version.patch).to.equal(1n);
            });

            it("1.5.3 => 2.0.0", async () => {
                const factory = await loadFixture(fixtureWithMock);
                await factory.setVersion(v(2n, 0n, 0n));
                expect((await factory.version()).version.major).to.equal(2n);
            });

            it("1.5.3 => 1.5.3 reverts", async () => {
                const factory = await loadFixture(fixtureWithMock);
                await expect(factory.setVersion(v(1n, 5n, 3n))).to.be.revertedWithCustomError(factory, "SameVersion");
            });

            it("1.5.3 => 1.4.9 reverts", async () => {
                const factory = await loadFixture(fixtureWithMock);
                await expect(factory.setVersion(v(1n, 4n, 9n))).to.be.revertedWithCustomError(
                    factory,
                    "InvalidMinorVersion"
                );
            });

            it("1.5.3 => 3.0.0 reverts", async () => {
                const factory = await loadFixture(fixtureWithMock);
                await expect(factory.setVersion(v(3n, 0n, 0n))).to.be.revertedWithCustomError(
                    factory,
                    "OnlyIterativeUpdate"
                );
            });

            it("1.5.3 => 0.9.0 reverts", async () => {
                const factory = await loadFixture(fixtureWithMock);
                await expect(factory.setVersion(v(0n, 9n, 0n))).to.be.revertedWithCustomError(
                    factory,
                    "OnlyIterativeUpdate"
                );
            });
        });
    });

    describe("createAssetList", function () {
        it("Should deploy AssetList implementation with provided immutable asset configurations", async () => {
            const { assetListFactory, users, configurator, assetConfigs } = await restore();

            const deployedAddress = await assetListFactory
                .connect(users[0])
                .createAssetList.staticCall(assetConfigs, configurator.address);
            await assetListFactory.connect(users[0]).createAssetList(assetConfigs, configurator.address);

            expect(await ethers.provider.getCode(deployedAddress)).to.not.equal("0x");

            const assetList = await ethers.getContractAt(ASSET_LIST_ABI, deployedAddress);
            expect(await assetList.numAssets()).to.equal(assetConfigs.length);
            expect(await assetList.configurator()).to.equal(configurator.address);
            expect(await assetList.configHash()).to.equal(
                computeConfigHash((await assetList.TYPEHASH()) as string, assetConfigs)
            );

            const assetInfo = (await assetList.getAssetInfo(0)) as AssetInfo;
            expect(assetInfo.offset).to.equal(0);
            expect(assetInfo.asset).to.equal(assetConfigs[0].asset);
            expect(assetInfo.priceFeed).to.equal(assetConfigs[0].priceFeed);
            // Scale comes from the decimals of the token
            expect(assetInfo.scale).to.equal(10n ** 18n);
        });

        it("Should emit AssetListCreated event", async () => {
            const { assetListFactory, users, configurator, assetConfigs } = await restore();

            const deployedAddress = await assetListFactory
                .connect(users[0])
                .createAssetList.staticCall(assetConfigs, configurator.address);

            await expect(assetListFactory.connect(users[0]).createAssetList(assetConfigs, configurator.address))
                .to.emit(assetListFactory, "AssetListCreated")
                .withArgs(deployedAddress, assetConfigs.map(toTuple));
        });

        it("Should emit event with the same signature as Compound's AssetListFactory", async () => {
            const { assetListFactory } = await restore();

            expect(assetListFactory.interface.getEvent("AssetListCreated").topicHash).to.equal(
                ethers.id("AssetListCreated(address,(address,address)[])")
            );
        });

        it("Should increment counter for deployer", async () => {
            const { assetListFactory, users, configurator, assetConfigs } = await restore();

            expect(await assetListFactory.counters(users[0].address)).to.equal(0);
            await assetListFactory.connect(users[0]).createAssetList(assetConfigs, configurator.address);
            expect(await assetListFactory.counters(users[0].address)).to.equal(1);
        });

        it("Should use different salts for different deployers", async () => {
            const { assetListFactory, users, configurator, assetConfigs } = await restore();

            const address1 = await assetListFactory
                .connect(users[0])
                .createAssetList.staticCall(assetConfigs, configurator.address);
            await assetListFactory.connect(users[0]).createAssetList(assetConfigs, configurator.address);

            const address2 = await assetListFactory
                .connect(users[1])
                .createAssetList.staticCall(assetConfigs, configurator.address);
            await assetListFactory.connect(users[1]).createAssetList(assetConfigs, configurator.address);

            expect(address1).to.not.equal(address2);
        });

        it("Should use incremented salt for same deployer", async () => {
            const { assetListFactory, users, configurator, assetConfigs } = await restore();

            const address1 = await assetListFactory
                .connect(users[0])
                .createAssetList.staticCall(assetConfigs, configurator.address);
            await assetListFactory.connect(users[0]).createAssetList(assetConfigs, configurator.address);

            const address2 = await assetListFactory
                .connect(users[0])
                .createAssetList.staticCall(assetConfigs, configurator.address);
            await assetListFactory.connect(users[0]).createAssetList(assetConfigs, configurator.address);

            expect(address1).to.not.equal(address2);
            expect(await assetListFactory.counters(users[0].address)).to.equal(2);
        });

        it("Should revert when AssetList constructor rejects configuration", async () => {
            const { assetListFactory, users, configurator, assetConfigs } = await restore();

            const assetList = await ethers.getContractAt(ASSET_LIST_ABI, ethers.ZeroAddress);

            await expect(
                assetListFactory.connect(users[0]).createAssetList([], configurator.address)
            ).to.be.revertedWithCustomError(assetList, "NoAssets");
            await expect(
                assetListFactory.connect(users[0]).createAssetList(assetConfigs, ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(assetList, "ZeroConfigurator");
        });
    });

    describe("Configurator integration", function () {
        it("Should deploy AssetList implementations and Comet through Compound V3 Configurator", async () => {
            const { assetListFactory, governor, users, versionController, mockBaseToken, priceFeed, assetConfigs } =
                await restore();
            const proxyFactory = await ethers.getContractFactory("TransparentUpgradeableProxy");
            const proxyAdminOwner = users[1];
            // Configurator stores everything per Comet proxy, any address is enough as a key here
            const cometProxy = users[2].address;

            // Configurator behind a proxy, as its implementation cannot be initialized
            const configuratorImpl = await new ethers.ContractFactory([], ConfiguratorV2InitCode, governor).deploy();
            const configuratorProxy = await proxyFactory.deploy(
                configuratorImpl,
                proxyAdminOwner.address,
                new ethers.Interface(CONFIGURATOR_ABI).encodeFunctionData("initialize", [governor.address])
            );
            const configuratorAddress = await configuratorProxy.getAddress();
            const configurator = await ethers.getContractAt(CONFIGURATOR_ABI, configuratorAddress, governor);
            // Deployments through Configurator are callable by anyone
            const configuratorAsUser = await ethers.getContractAt(CONFIGURATOR_ABI, configuratorAddress, users[0]);

            const storageConfig = {
                borrowCollateralFactor: 500000000000000000n,
                liquidateCollateralFactor: 700000000000000000n,
                liquidationFactor: 750000000000000000n,
                supplyCap: 100000000000000000000000n
            };
            await configurator.setAssetListFactory(cometProxy, assetListFactory);
            await configurator.addAsset(cometProxy, { ...assetConfigs[0], ...storageConfig });

            // Configurator only redeploys an existing asset list, the first implementation is deployed through the factory directly
            const assetListImpl = await assetListFactory.createAssetList.staticCall(assetConfigs, configuratorAddress);
            await assetListFactory.createAssetList(assetConfigs, configuratorAddress);

            // AssetList proxy initialized with the storage part of the asset configurations
            const assetListInterface = new ethers.Interface(ASSET_LIST_ABI);
            const assetListProxy = await proxyFactory.deploy(
                assetListImpl,
                proxyAdminOwner.address,
                assetListInterface.encodeFunctionData("initialize", [[storageConfig]])
            );
            const assetListAddress = await assetListProxy.getAddress();
            const assetList = await ethers.getContractAt(ASSET_LIST_ABI, assetListAddress);
            expect(await assetList.configurator()).to.equal(configuratorAddress);
            let assetInfo = (await assetList.getAssetInfo(0)) as AssetInfo;
            expect(assetInfo.asset).to.equal(assetConfigs[0].asset);
            expect(assetInfo.priceFeed).to.equal(assetConfigs[0].priceFeed);
            expect(assetInfo.borrowCollateralFactor).to.equal(storageConfig.borrowCollateralFactor);
            expect(assetInfo.liquidateCollateralFactor).to.equal(storageConfig.liquidateCollateralFactor);
            expect(assetInfo.liquidationFactor).to.equal(storageConfig.liquidationFactor);
            expect(assetInfo.supplyCap).to.equal(storageConfig.supplyCap);

            // Comet configuration holding the asset list proxy
            const cometExt = await new ethers.ContractFactory(
                ["constructor(tuple(bytes32 name32, bytes32 symbol32) config, address assetListFactoryAddress)"],
                CometExtAssetList,
                governor
            ).deploy(
                [ethers.encodeBytes32String("Compound Mock Base"), ethers.encodeBytes32String("cMockBaseV3")],
                await assetListFactory.getAddress()
            );
            const cometFactory = await (
                await ethers.getContractFactory("CometFactoryV2")
            ).deploy({ version: { major: 1, minor: 0, patch: 0 }, alternative: "" }, versionController, governor);
            await configurator.setFactory(cometProxy, cometFactory);
            await configurator.setConfiguration(cometProxy, {
                governor: governor.address,
                pauseGuardian: governor.address,
                baseToken: await mockBaseToken.getAddress(),
                baseTokenPriceFeed: await priceFeed.getAddress(),
                extensionDelegate: await cometExt.getAddress(),
                supplyKink: "900000000000000000",
                supplyPerYearInterestRateSlopeLow: "36000000000000000",
                supplyPerYearInterestRateSlopeHigh: "3200000000000000000",
                supplyPerYearInterestRateBase: 0,
                borrowKink: "900000000000000000",
                borrowPerYearInterestRateSlopeLow: "27800000000000000",
                borrowPerYearInterestRateSlopeHigh: "3600000000000000000",
                borrowPerYearInterestRateBase: "15000000000000000",
                storeFrontPriceFactor: "600000000000000000",
                trackingIndexScale: "1000000000000000",
                baseTrackingSupplySpeed: 810185185185,
                baseTrackingBorrowSpeed: 821759259259,
                baseMinForRewards: 1000000000000,
                baseBorrowMin: 100000000,
                targetReserves: 20000000000000,
                assetList: assetListAddress
            });

            // Unchanged immutable configs: Configurator recognizes the deployed implementation, nothing is deployed
            expect(await configurator.deployAssetList.staticCall(cometProxy)).to.deep.equal([
                assetListAddress,
                ethers.ZeroAddress
            ]);
            await configuratorAsUser.deployAssetList(cometProxy);
            expect(await assetListFactory.counters(configuratorAddress)).to.equal(0);

            // Changed immutable configs: Configurator deploys a new implementation through the factory with itself as configurator
            const newPriceFeed = await new ethers.ContractFactory(
                ["constructor(uint8 decimals_, int256 constantPrice_)"],
                ConstantPriceFeedInitCode,
                governor
            ).deploy(8, 200000000);
            const newAssetConfigs = [{ ...assetConfigs[0], priceFeed: await newPriceFeed.getAddress() }];
            await configurator.updateAssetPriceFeed(cometProxy, assetConfigs[0].asset, newAssetConfigs[0].priceFeed);
            const [, newAssetListImpl] = (await configurator.deployAssetList.staticCall(cometProxy)) as [
                string,
                string
            ];
            await expect(configuratorAsUser.deployAssetList(cometProxy))
                .to.emit(assetListFactory, "AssetListCreated")
                .withArgs(newAssetListImpl, newAssetConfigs.map(toTuple));
            expect(newAssetListImpl).to.not.equal(assetListImpl);
            // Salt counter is tracked per Configurator, the caller of createAssetList
            expect(await assetListFactory.counters(configuratorAddress)).to.equal(1);
            const newAssetListImplContract = await ethers.getContractAt(ASSET_LIST_ABI, newAssetListImpl);
            expect(await newAssetListImplContract.configurator()).to.equal(configuratorAddress);

            // Proxy admin upgrades the asset list proxy and writes the storage configs in the same call, as CometProxyAdmin does
            const proxyAdmin = await ethers.getContractAt(
                "ProxyAdmin",
                await upgrades.erc1967.getAdminAddress(assetListAddress),
                proxyAdminOwner
            );
            await proxyAdmin.upgradeAndCall(
                assetListAddress,
                newAssetListImpl,
                assetListInterface.encodeFunctionData("setAssetConfigs", [
                    await configurator.getStorageAssetConfig(cometProxy)
                ])
            );
            assetInfo = (await assetList.getAssetInfo(0)) as AssetInfo;
            expect(assetInfo.priceFeed).to.equal(newAssetConfigs[0].priceFeed);
            expect(assetInfo.supplyCap).to.equal(storageConfig.supplyCap);

            // Configurator passed to the factory is allowed to update the asset list behind the proxy
            const newSupplyCap = 200000000000000000000000n;
            await configurator.updateAssetSupplyCap(cometProxy, assetConfigs[0].asset, newSupplyCap);
            assetInfo = (await assetList.getAssetInfo(0)) as AssetInfo;
            expect(assetInfo.supplyCap).to.equal(newSupplyCap);

            // Comet implementation is deployed by Configurator through CometFactoryV2 with the asset list proxy
            const cometAddress = (await configurator.deploy.staticCall(cometProxy)) as string;
            await configuratorAsUser.deploy(cometProxy);

            const comet = await ethers.getContractAt(
                ["function assetList() view returns (address)", "function numAssets() view returns (uint8)"],
                cometAddress
            );
            expect(await comet.assetList()).to.equal(assetListAddress);
            expect(await comet.numAssets()).to.equal(assetConfigs.length);
            // Salt counter of CometFactoryV2 is tracked per Configurator as well
            expect(await cometFactory.counters(configuratorAddress)).to.equal(1);
        });
    });
});
