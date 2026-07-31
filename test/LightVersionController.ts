import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { CometInitCode, CometExtInitCode, ConstantPriceFeedInitCode } from "./testData.json";

// Full signature of the tuple `versionExists` overload (the other overload takes a bytes32).
const VERSION_EXISTS = "versionExists((bytes32,((uint64,uint64,uint64),string)))";
const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

// CCIP cross-chain params for the L1DeployManager integration.
const MOCK_ROUTER_FEE = ethers.parseEther("0.1");
const MOCK_CHAIN_SELECTOR = "1234567890";
const MOCK_OTHER_CHAIN_ID = 123456;
const GAS_LIMIT = 100_000;

describe("LightVersionController", function () {
    const fixture = async () => {
        const [admin, developer, user] = await ethers.getSigners();

        const lvc = await upgrades.deployProxy(
            await ethers.getContractFactory("LightVersionController"),
            [admin.address, "Integration test stack"],
            { kind: "uups" }
        );
        const DEVELOPER_ROLE = await lvc.DEVELOPER_ROLE();
        await lvc.connect(admin).grantRole(DEVELOPER_ROLE, developer.address);

        // L1DeployManager consumes LightVersionController through the surface it shares with the full
        // VersionController: hasRole (governor check), isDeveloper, computeBytecodeHash,
        // getVerifiedBytecode and getVerifiedInitCodeHash.
        const mockRouter = await (await ethers.getContractFactory("MockCCIPRouter")).deploy();
        await mockRouter.setFee(MOCK_ROUTER_FEE);
        const l1DeployManager = await upgrades.deployProxy(await ethers.getContractFactory("L1DeployManager"), [], {
            kind: "uups",
            constructorArgs: [await lvc.getAddress(), await mockRouter.getAddress()]
        });
        // Register a destination chain so bytecode can be sent cross-chain. The admin is the governor
        // because it holds DEFAULT_ADMIN_ROLE on the LightVersionController. The l2 address is a
        // placeholder — this test only exercises the L1 send side.
        await l1DeployManager.connect(admin).setChainConfig(MOCK_OTHER_CHAIN_ID, {
            l2DeployManager: await mockRouter.getAddress(),
            destinationChainSelector: MOCK_CHAIN_SELECTOR
        });

        const contractType = ethers.encodeBytes32String("COMET");
        return { admin, developer, user, lvc, l1DeployManager, contractType, DEVELOPER_ROLE };
    };

    const restore = async () => await loadFixture(fixture);

    it("Should let admin assign a developer", async () => {
        const { lvc, admin, user, DEVELOPER_ROLE } = await restore();
        expect(await lvc.hasRole(await lvc.DEFAULT_ADMIN_ROLE(), admin)).to.be.true;
        expect(await lvc.isDeveloper(user)).to.be.false;
        await lvc.connect(admin).grantRole(DEVELOPER_ROLE, user);
        expect(await lvc.isDeveloper(user)).to.be.true;
    });

    it("Should release initial bytecode for any contract type without registration", async () => {
        const { lvc, developer, contractType } = await restore();
        await lvc.connect(developer).releaseBytecode({ contractType, initCode: CometInitCode, sourceURL: URL });

        const latest = await lvc.latestVersions(contractType);
        expect([latest.major, latest.minor, latest.patch]).to.deep.equal([1n, 0n, 0n]);
        expect(await lvc.getLatestVersion(contractType)).to.equal("1.0.0");

        const version = { version: { major: 1, minor: 0, patch: 0 }, alternative: "" };
        expect(await lvc[VERSION_EXISTS]({ contractType, version })).to.be.true;
        const bytecode = await lvc.bytecodes(await lvc.computeBytecodeHash(contractType, version));
        expect(bytecode.contractType).to.equal(contractType);
        expect(bytecode.sourceURL).to.equal(URL);
        expect(bytecode.author).to.equal(developer.address);
    });

    it("Should release a major version (no cooldown)", async () => {
        const { lvc, developer, contractType } = await restore();
        await lvc.connect(developer).releaseBytecode({ contractType, initCode: CometInitCode, sourceURL: URL });
        await lvc.connect(developer).releaseMajorVersion({ contractType, initCode: CometExtInitCode, sourceURL: URL });

        expect(await lvc.getLatestVersion(contractType)).to.equal("2.0.0");
        expect(
            await lvc[VERSION_EXISTS]({
                contractType,
                version: { version: { major: 2, minor: 0, patch: 0 }, alternative: "" }
            })
        ).to.be.true;
        // Previous version still exists.
        expect(
            await lvc[VERSION_EXISTS]({
                contractType,
                version: { version: { major: 1, minor: 0, patch: 0 }, alternative: "" }
            })
        ).to.be.true;
    });

    it("Should release a minor version (no cooldown)", async () => {
        const { lvc, developer, contractType } = await restore();
        await lvc.connect(developer).releaseBytecode({ contractType, initCode: CometInitCode, sourceURL: URL });
        await lvc
            .connect(developer)
            .releaseMinorVersion({ contractType, initCode: CometExtInitCode, sourceURL: URL }, 1);

        expect(await lvc.getLatestVersion(contractType)).to.equal("1.1.0");
        expect(
            await lvc[VERSION_EXISTS]({
                contractType,
                version: { version: { major: 1, minor: 1, patch: 0 }, alternative: "" }
            })
        ).to.be.true;
    });

    it("Should release a patch version (no cooldown)", async () => {
        const { lvc, developer, contractType } = await restore();
        await lvc.connect(developer).releaseBytecode({ contractType, initCode: CometInitCode, sourceURL: URL });
        await lvc
            .connect(developer)
            .releasePatchVersion({ contractType, initCode: CometExtInitCode, sourceURL: URL }, 1, 0);

        expect(await lvc.getLatestVersion(contractType)).to.equal("1.0.1");
        expect(
            await lvc[VERSION_EXISTS]({
                contractType,
                version: { version: { major: 1, minor: 0, patch: 1 }, alternative: "" }
            })
        ).to.be.true;
    });

    it("Should release an alternative version", async () => {
        const { lvc, developer, contractType } = await restore();
        await lvc.connect(developer).releaseBytecode({ contractType, initCode: CometInitCode, sourceURL: URL });
        const alternativeVersion = { version: { major: 1, minor: 0, patch: 0 }, alternative: "alt" };
        await lvc
            .connect(developer)
            .releaseAlternativeVersion(
                { contractType, initCode: CometExtInitCode, sourceURL: URL },
                alternativeVersion
            );

        // Core version unchanged.
        expect(await lvc.getLatestVersion(contractType)).to.equal("1.0.0");
        expect(await lvc[VERSION_EXISTS]({ contractType, version: alternativeVersion })).to.be.true;
        const altVersions = await lvc.getAllAlternativeVersions(contractType);
        expect(altVersions.length).to.equal(1);
        expect(altVersions[0].alternative).to.equal("alt");
    });

    it("Should return any registered bytecode via getVerifiedBytecode (no audit required)", async () => {
        const { lvc, developer, contractType } = await restore();
        await lvc.connect(developer).releaseBytecode({ contractType, initCode: CometInitCode, sourceURL: URL });
        const version = { version: { major: 1, minor: 0, patch: 0 }, alternative: "" };
        expect(await lvc.getVerifiedBytecode({ contractType, version })).to.equal(CometInitCode);
    });

    it("Should allow uploading the same bytecode more than once", async () => {
        const { lvc, developer, contractType } = await restore();
        const otherContractType = ethers.encodeBytes32String("COMET_COPY");
        const v1 = { version: { major: 1, minor: 0, patch: 0 }, alternative: "" };
        const v2 = { version: { major: 2, minor: 0, patch: 0 }, alternative: "" };

        // Same init code registered under a first contract type.
        await lvc.connect(developer).releaseBytecode({ contractType, initCode: CometInitCode, sourceURL: URL });
        // Same init code registered again under a different contract type.
        await lvc
            .connect(developer)
            .releaseBytecode({ contractType: otherContractType, initCode: CometInitCode, sourceURL: URL });
        // Same init code registered again as a new version of the first contract type.
        await lvc.connect(developer).releaseMajorVersion({ contractType, initCode: CometInitCode, sourceURL: URL });

        // All three slots exist and resolve to the same bytecode.
        expect(await lvc[VERSION_EXISTS]({ contractType, version: v1 })).to.be.true;
        expect(await lvc[VERSION_EXISTS]({ contractType, version: v2 })).to.be.true;
        expect(await lvc[VERSION_EXISTS]({ contractType: otherContractType, version: v1 })).to.be.true;
        expect(await lvc.getVerifiedBytecode({ contractType, version: v1 })).to.equal(CometInitCode);
        expect(await lvc.getVerifiedBytecode({ contractType, version: v2 })).to.equal(CometInitCode);
        expect(await lvc.getVerifiedBytecode({ contractType: otherContractType, version: v1 })).to.equal(CometInitCode);
    });

    it("Should let L1DeployManager deploy bytecode retrieved from LightVersionController", async () => {
        const { lvc, l1DeployManager, developer } = await restore();
        const contractType = ethers.encodeBytes32String("ConstantPriceFeed");
        await lvc.connect(developer).releaseBytecode({
            contractType,
            initCode: ConstantPriceFeedInitCode,
            sourceURL: URL
        });

        const bytecodeVersion = {
            contractType,
            version: { version: { major: 1, minor: 0, patch: 0 }, alternative: "" }
        };
        const salt = ethers.ZeroHash;
        const constructorParams = ethers.AbiCoder.defaultAbiCoder().encode(["uint8", "int256"], [8, "100000000"]); // 1 * 10^8

        // A developer on the LightVersionController may deploy through the manager.
        const expectedAddress = await l1DeployManager.computeAddress(
            bytecodeVersion,
            salt,
            constructorParams,
            developer.address
        );

        await expect(l1DeployManager.connect(developer).deploy(bytecodeVersion, salt, constructorParams))
            .to.emit(l1DeployManager, "ContractDeployed")
            .withArgs([contractType, [[1, 0, 0], ""]], constructorParams, expectedAddress, developer.address);

        // The bytecode served by the LightVersionController produced a live contract at the CREATE2 address.
        expect(await ethers.provider.getCode(expectedAddress)).to.not.equal("0x");
    });

    it("Should let L1DeployManager send LightVersionController bytecode to another chain", async () => {
        const { lvc, l1DeployManager, developer } = await restore();
        const contractType = ethers.encodeBytes32String("ConstantPriceFeed");
        await lvc.connect(developer).releaseBytecode({
            contractType,
            initCode: ConstantPriceFeedInitCode,
            sourceURL: URL
        });

        const bytecodeVersion = {
            contractType,
            version: { version: { major: 1, minor: 0, patch: 0 }, alternative: "" }
        };
        // The manager reads the version hash and init code hash from the LightVersionController.
        const bytecodeHash = await lvc.computeBytecodeHash(contractType, bytecodeVersion.version);

        await expect(
            l1DeployManager
                .connect(developer)
                .sendBytecodeToOtherChain(bytecodeVersion, MOCK_OTHER_CHAIN_ID, GAS_LIMIT, { value: MOCK_ROUTER_FEE })
        )
            .to.emit(l1DeployManager, "BytecodeSent")
            .withArgs(MOCK_OTHER_CHAIN_ID, [contractType, [[1, 0, 0], ""]]);

        expect(await l1DeployManager.isVersionSentToChain(MOCK_OTHER_CHAIN_ID, bytecodeHash)).to.be.true;
    });

    it("Should revert when a non-developer releases bytecode", async () => {
        const { lvc, user, contractType } = await restore();
        await expect(lvc.connect(user).releaseBytecode({ contractType, initCode: CometInitCode, sourceURL: URL }))
            .to.be.revertedWithCustomError(lvc, "NotDeveloper")
            .withArgs(user);
    });

    it("Should revert when releasing a new version before the initial one", async () => {
        const { lvc, developer, contractType } = await restore();
        await expect(
            lvc.connect(developer).releaseMajorVersion({ contractType, initCode: CometInitCode, sourceURL: URL })
        )
            .to.be.revertedWithCustomError(lvc, "BytecodeNotReleased")
            .withArgs(contractType);
    });
});
