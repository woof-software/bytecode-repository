import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { CometInitCode, CometExtInitCode, ConstantPriceFeedInitCode } from "./testData.json";

// Full signature of the tuple `versionExists` overload (the other overload takes a bytes32).
const VERSION_EXISTS = "versionExists((bytes32,((uint64,uint64,uint64),string)))";
const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

describe("LightVersionController", function () {
    const fixture = async () => {
        const [admin, developer, user] = await ethers.getSigners();

        const lvc = await (await ethers.getContractFactory("LightVersionController")).deploy(admin.address);
        const DEVELOPER_ROLE = await lvc.DEVELOPER_ROLE();
        await lvc.connect(admin).grantRole(DEVELOPER_ROLE, developer.address);

        const contractType = ethers.encodeBytes32String("COMET");
        return { admin, developer, user, lvc, contractType, DEVELOPER_ROLE };
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

    it("Should deploy a registered bytecode via CREATE2", async () => {
        const { lvc, developer } = await restore();
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

        const expectedAddress = await lvc.computeAddress(bytecodeVersion, salt, constructorParams, developer.address);

        await expect(lvc.connect(developer).deploy(bytecodeVersion, salt, constructorParams))
            .to.emit(lvc, "ContractDeployed")
            .withArgs([contractType, [[1, 0, 0], ""]], constructorParams, expectedAddress, developer.address);

        expect(await ethers.provider.getCode(expectedAddress)).to.not.equal("0x");
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

    it("Should revert when a non-developer, non-admin deploys", async () => {
        const { lvc, developer, user } = await restore();
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
        const constructorParams = ethers.AbiCoder.defaultAbiCoder().encode(["uint8", "int256"], [8, "100000000"]);
        await expect(lvc.connect(user).deploy(bytecodeVersion, ethers.ZeroHash, constructorParams))
            .to.be.revertedWithCustomError(lvc, "NotDeveloperOrAdmin")
            .withArgs(user);
    });
});
