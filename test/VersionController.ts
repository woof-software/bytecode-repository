import { expect } from "chai";
import { network, ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { CometInitCode, CometExtInitCode, CometWithExtendedAssetListInitCode } from "./testData.json";
import { domainResultToPlainObject, prepareAuditReportSignature } from "./helpers";
import type { EIP712Domain, Developers } from "./helpers";

// Additional test bytecodes to avoid conflicts
const TestBytecode1 = "0x608060405234801561001057600080fd5b50600080fd5b3480156100";
const TestBytecode2 = "0x608060405234801561001057600080fd5b50600180fd5b3480156100";
const TestBytecode3 = "0x608060405234801561001057600080fd5b50600280fd5b3480156100";
const TestBytecode4 = "0x608060405234801561001057600080fd5b50600380fd5b3480156100";
const TestBytecode5 = "0x608060405234801561001057600080fd5b50600480fd5b3480156100";

describe("VersionController", function () {
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
        const devTeam2: Developers = {
            keyDeveloper: signers[9],
            subDevelopers: signers.slice(10, 13),
            contractTypes: ["STAKING", "VESTING"].map((ct: string): string => ethers.encodeBytes32String(ct))
        };
        const devTeam3: Developers = {
            keyDeveloper: signers[13],
            subDevelopers: signers.slice(14, 17),
            contractTypes: ["BRIDGE", "BRAND_NEW_CONTRACT_TYPE"].map((ct: string): string =>
                ethers.encodeBytes32String(ct)
            )
        };
        const users = signers.slice(17);

        const versionController = await upgrades.deployProxy(
            await ethers.getContractFactory("VersionController"),
            [await governor.getAddress(), await guardian.getAddress()],
            { kind: "uups" }
        );

        const AUDITOR_ROLE = await versionController.AUDITOR_ROLE();
        for (const auditor of auditors) await versionController.connect(governor).grantRole(AUDITOR_ROLE, auditor);

        // const KEY_DEVELOPER_ROLE = await versionController.KEY_DEVELOPER_ROLE();
        // await versionController.connect(governor).grantRole(KEY_DEVELOPER_ROLE, WOOF.keyDeveloper);
        // await versionController.connect(governor).grantRole(KEY_DEVELOPER_ROLE, devTeam2.keyDeveloper);
        // await versionController.connect(governor).grantRole(KEY_DEVELOPER_ROLE, devTeam3.keyDeveloper);

        await versionController
            .connect(governor)
            .assignDeveloperForContractTypes(WOOF.contractTypes, WOOF.keyDeveloper);
        await versionController
            .connect(governor)
            .assignDeveloperForContractTypes(devTeam2.contractTypes, devTeam2.keyDeveloper);
        await versionController
            .connect(governor)
            .assignDeveloperForContractTypes(devTeam3.contractTypes, devTeam3.keyDeveloper);

        for (const subDev of WOOF.subDevelopers)
            await versionController.connect(WOOF.keyDeveloper).addSubDeveloper(subDev);
        for (const subDev of devTeam2.subDevelopers)
            await versionController.connect(devTeam2.keyDeveloper).addSubDeveloper(subDev);
        for (const subDev of devTeam3.subDevelopers)
            await versionController.connect(devTeam3.keyDeveloper).addSubDeveloper(subDev);

        return { governor, guardian, auditors, WOOF, devTeam2, devTeam3, users, versionController };
    };

    const restore = async () => await loadFixture(fixture);

    it("Should initialize correctly", async () => {
        const { governor, auditors, WOOF, devTeam2, devTeam3, versionController } = await restore();
        expect(await versionController.hasRole(await versionController.DEFAULT_ADMIN_ROLE(), governor)).to.be.true;
        const domain = (await versionController.eip712Domain()) as unknown as EIP712Domain;
        expect(domainResultToPlainObject(domain)).to.deep.equal({
            fields: "0x0f",
            name: "VersionController",
            version: "1",
            chainId: network.config.chainId,
            verifyingContract: await versionController.getAddress(),
            salt: ethers.ZeroHash,
            extensions: []
        });
        const AUDITOR_ROLE = await versionController.AUDITOR_ROLE();
        for (const auditor of auditors) expect(await versionController.hasRole(AUDITOR_ROLE, auditor)).to.be.true;
        const KEY_DEVELOPER_ROLE = await versionController.KEY_DEVELOPER_ROLE();
        expect(await versionController.hasRole(KEY_DEVELOPER_ROLE, WOOF.keyDeveloper)).to.be.true;
        expect(await versionController.hasRole(KEY_DEVELOPER_ROLE, devTeam2.keyDeveloper)).to.be.true;
        expect(await versionController.hasRole(KEY_DEVELOPER_ROLE, devTeam3.keyDeveloper)).to.be.true;
        const SUB_DEVELOPER_ROLE = await versionController.SUB_DEVELOPER_ROLE();
        for (const subDev of WOOF.subDevelopers) {
            expect(await versionController.hasRole(SUB_DEVELOPER_ROLE, subDev)).to.be.true;
            expect(await versionController.subToKeyDeveloper(subDev)).to.equal(WOOF.keyDeveloper);
        }
        expect(await versionController.getSubDevsForKeyDeveloper(WOOF.keyDeveloper)).to.deep.equal(
            WOOF.subDevelopers.map((h: HardhatEthersSigner): string => h.address)
        );
        for (const subDev of devTeam2.subDevelopers) {
            expect(await versionController.hasRole(SUB_DEVELOPER_ROLE, subDev)).to.be.true;
            expect(await versionController.subToKeyDeveloper(subDev)).to.equal(devTeam2.keyDeveloper);
        }
        expect(await versionController.getSubDevsForKeyDeveloper(WOOF.keyDeveloper)).to.deep.equal(
            WOOF.subDevelopers.map((h: HardhatEthersSigner): string => h.address)
        );
        for (const subDev of devTeam3.subDevelopers) {
            expect(await versionController.hasRole(SUB_DEVELOPER_ROLE, subDev)).to.be.true;
            expect(await versionController.subToKeyDeveloper(subDev)).to.equal(devTeam3.keyDeveloper);
        }
        expect(await versionController.getSubDevsForKeyDeveloper(WOOF.keyDeveloper)).to.deep.equal(
            WOOF.subDevelopers.map((h: HardhatEthersSigner): string => h.address)
        );
        for (const contractType of WOOF.contractTypes)
            expect(await versionController.contractTypeKeyDeveloper(contractType)).to.equal(WOOF.keyDeveloper);
        for (const contractType of devTeam2.contractTypes)
            expect(await versionController.contractTypeKeyDeveloper(contractType)).to.equal(devTeam2.keyDeveloper);
        for (const contractType of devTeam3.contractTypes)
            expect(await versionController.contractTypeKeyDeveloper(contractType)).to.equal(devTeam3.keyDeveloper);
    });

    it("Should revert when initializing with zero governor address", async () => {
        const signers = await ethers.getSigners();
        await expect(
            upgrades.deployProxy(
                await ethers.getContractFactory("VersionController"),
                [ethers.ZeroAddress, signers[1].address],
                {
                    kind: "uups"
                }
            )
        ).to.be.revertedWithCustomError(await ethers.getContractFactory("VersionController"), "ZeroAddress");
    });

    it("Should initialize correctly with guardian", async () => {
        const { versionController, guardian } = await restore();
        expect(await versionController.hasRole(await versionController.GUARDIAN_ROLE(), guardian)).to.be.true;
    });

    it("Should release bytecode", async () => {
        const { WOOF, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.major).to.equal(1);
        expect(latestVersion.minor).to.equal(0);
        expect(latestVersion.patch).to.equal(0);
        const version = {
            version: { major: latestVersion.major, minor: latestVersion.minor, patch: latestVersion.patch },
            alternative: ""
        };
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version
            })
        ).to.be.true;
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const bytecode = await versionController.bytecodes(bytecodeHash);
        expect(bytecode.contractType).to.equal(WOOF.contractTypes[0]);
        expect(bytecode.sourceURL).to.equal(URL);
        expect(bytecode.author).to.equal(WOOF.keyDeveloper);
        expect(await versionController.getLatestVersion(WOOF.contractTypes[0])).to.equal("1.0.0");
    });

    it("Should verify bytecode", async () => {
        const { WOOF, auditors, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Sign bytecode
        const version = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: ""
        };
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const auditReport = "AUDIT_REPORT_URL";
        const signature = await prepareAuditReportSignature(
            bytecodeHash,
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await versionController.connect(WOOF.keyDeveloper).verifyBytecode(bytecodeVersion, auditReport, signature);
        expect(await versionController.isBytecodeVerified(bytecodeVersion)).to.be.true;
        const signedAuditors = await versionController.getAuditorsForBytecodeVersion(bytecodeVersion);
        expect(signedAuditors.length).to.equal(1);
        expect(signedAuditors[0]).to.equal(auditors[0]);
        expect(await versionController.getAuditReport(bytecodeVersion, auditors[0])).to.equal(auditReport);
    });

    it("Should return verified bytecode", async () => {
        const { WOOF, auditors, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Sign bytecode
        const version = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: ""
        };
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const auditReport = "AUDIT_REPORT_URL";
        const signature = await prepareAuditReportSignature(
            bytecodeHash,
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await versionController.connect(WOOF.keyDeveloper).verifyBytecode(bytecodeVersion, auditReport, signature);
        // Get bytecode
        expect(await versionController.getVerifiedBytecode(bytecodeVersion)).to.equal(CometInitCode);
    });

    it("Should release major version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Skip cooldown period for major version release
        await time.increase(time.duration.days(90)); // 3 months
        // Release new major version
        const NEW_URL = "https://github.com/compound-finance/comet/blob/main/contracts/CometExt.sol";
        await versionController.connect(WOOF.subDevelopers[1]).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometExtInitCode,
            sourceURL: NEW_URL
        });
        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.major).to.equal(2);
        expect(latestVersion.minor).to.equal(0);
        expect(latestVersion.patch).to.equal(0);
        const version = {
            version: { major: latestVersion.major, minor: latestVersion.minor, patch: latestVersion.patch },
            alternative: ""
        };
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version
            })
        ).to.be.true;
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const bytecode = await versionController.bytecodes(bytecodeHash);
        expect(bytecode.contractType).to.equal(WOOF.contractTypes[0]);
        expect(bytecode.sourceURL).to.equal(NEW_URL);
        expect(bytecode.author).to.equal(WOOF.keyDeveloper);
        expect(await versionController.getLatestVersion(WOOF.contractTypes[0])).to.equal("2.0.0");
        // Check that previous version exists
        const prevVersion = {
            version: { major: 1n, minor: 0n, patch: 0n },
            alternative: ""
        };
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: prevVersion
            })
        ).to.be.true;
    });

    it("Should release minor version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Skip cooldown period for minor version release
        await time.increase(time.duration.days(30)); // 1 month
        // Release new minor version
        const NEW_URL = "https://github.com/compound-finance/comet/blob/main/contracts/CometExt.sol";
        await versionController.connect(WOOF.subDevelopers[1]).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: CometExtInitCode,
                sourceURL: NEW_URL
            },
            1
        );
        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.major).to.equal(1);
        expect(latestVersion.minor).to.equal(1);
        expect(latestVersion.patch).to.equal(0);
        const version = {
            version: { major: latestVersion.major, minor: latestVersion.minor, patch: latestVersion.patch },
            alternative: ""
        };
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version
            })
        ).to.be.true;
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const bytecode = await versionController.bytecodes(bytecodeHash);
        expect(bytecode.contractType).to.equal(WOOF.contractTypes[0]);
        expect(bytecode.sourceURL).to.equal(NEW_URL);
        expect(bytecode.author).to.equal(WOOF.keyDeveloper);
        expect(await versionController.getLatestVersion(WOOF.contractTypes[0])).to.equal("1.1.0");
        // Check that previous version exists
        const prevVersion = {
            version: { major: 1n, minor: 0n, patch: 0n },
            alternative: ""
        };
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: prevVersion
            })
        ).to.be.true;
    });

    it("Should release patch version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Skip cooldown period for patch version release
        await time.increase(time.duration.hours(1)); // 1 hour
        // Release new patch version
        const NEW_URL = "https://github.com/compound-finance/comet/blob/main/contracts/CometExt.sol";
        await versionController.connect(WOOF.subDevelopers[1]).releasePatchVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: CometExtInitCode,
                sourceURL: NEW_URL
            },
            1,
            0
        );
        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.major).to.equal(1);
        expect(latestVersion.minor).to.equal(0);
        expect(latestVersion.patch).to.equal(1);
        const version = {
            version: { major: latestVersion.major, minor: latestVersion.minor, patch: latestVersion.patch },
            alternative: ""
        };
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version
            })
        ).to.be.true;
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const bytecode = await versionController.bytecodes(bytecodeHash);
        expect(bytecode.contractType).to.equal(WOOF.contractTypes[0]);
        expect(bytecode.sourceURL).to.equal(NEW_URL);
        expect(bytecode.author).to.equal(WOOF.keyDeveloper);
        expect(await versionController.getLatestVersion(WOOF.contractTypes[0])).to.equal("1.0.1");
        // Check that previous version exists
        const prevVersion = {
            version: { major: 1n, minor: 0n, patch: 0n },
            alternative: ""
        };
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: prevVersion
            })
        ).to.be.true;
    });

    it("Should release alternative version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Release new alternative version
        const NEW_URL = "https://github.com/compound-finance/comet/blob/main/contracts/CometExt.sol";
        const alternativeVersion = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: "alt"
        };
        await versionController.connect(WOOF.subDevelopers[1]).releaseAlternativeVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: CometExtInitCode,
                sourceURL: NEW_URL
            },
            alternativeVersion
        );
        // Check that latest version is 1.0.0
        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.major).to.equal(1);
        expect(latestVersion.minor).to.equal(0);
        expect(latestVersion.patch).to.equal(0);
        // Check alternative version
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: alternativeVersion
            })
        ).to.be.true;
        const altVersions = await versionController.getAllAlternativeVersions(WOOF.contractTypes[0]);
        expect(altVersions.length).to.equal(1);
        expect(altVersions[0].version.major).to.equal(alternativeVersion.version.major);
        expect(altVersions[0].version.minor).to.equal(alternativeVersion.version.minor);
        expect(altVersions[0].version.patch).to.equal(alternativeVersion.version.patch);
        expect(altVersions[0].alternative).to.equal(alternativeVersion.alternative);
    });

    it("Should not release bytecode if caller is not the developer", async () => {
        const { WOOF, devTeam2, users, versionController } = await restore();
        // Revert when caller doesn't have role at all
        const bytecodeInput = {
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: "URL"
        };
        await expect(versionController.connect(users[0]).releaseBytecode(bytecodeInput))
            .revertedWithCustomError(versionController, "NotDeveloper")
            .withArgs(users[0]);
        // Revert when developer is not the assigned for contract type
        await expect(versionController.connect(devTeam2.keyDeveloper).releaseBytecode(bytecodeInput))
            .revertedWithCustomError(versionController, "WrongDeveloper")
            .withArgs(bytecodeInput.contractType, devTeam2.keyDeveloper);
        await expect(versionController.connect(devTeam2.subDevelopers[1]).releaseBytecode(bytecodeInput))
            .revertedWithCustomError(versionController, "WrongDeveloper")
            .withArgs(bytecodeInput.contractType, devTeam2.subDevelopers[1]);
    });

    it("Should revert when releasing bytecode with empty source URL", async () => {
        const { WOOF, versionController } = await restore();
        const bytecodeInput = {
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: ""
        };
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseBytecode(bytecodeInput)
        ).to.be.revertedWithCustomError(versionController, "EmptyURL");
    });

    it("Should not let release same bytecode more than once", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        const bytecodeInput = {
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        };
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode(bytecodeInput);
        // Try to release again
        await expect(versionController.connect(WOOF.subDevelopers[0]).releaseBytecode(bytecodeInput))
            .revertedWithCustomError(versionController, "BytecodeAlreadyReleased")
            .withArgs(bytecodeInput.contractType);
    });

    it("Should not let release new version if bytecode is not released", async () => {
        const { WOOF, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        const bytecodeInput = {
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        };
        await expect(versionController.connect(WOOF.keyDeveloper).releaseMajorVersion(bytecodeInput))
            .revertedWithCustomError(versionController, "BytecodeNotReleased")
            .withArgs(bytecodeInput.contractType);
    });

    it("Should not let release minor version for non-existing major version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        const bytecodeInput = {
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        };
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode(bytecodeInput);
        // Try to release minor version
        const nonExistingMajor = 2;
        await expect(
            versionController.connect(WOOF.subDevelopers[0]).releaseMinorVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: CometExtInitCode,
                    sourceURL: "NEW_URL"
                },
                nonExistingMajor
            )
        )
            .revertedWithCustomError(versionController, "NonExistingMajorVersion")
            .withArgs(WOOF.contractTypes[0], nonExistingMajor);
    });

    it("Should not update latest minor version if updating for not latest major version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Skip cooldown period for major version release
        await time.increase(time.duration.days(90)); // 3 months
        // Release new major version
        const NEW_URL = "https://github.com/compound-finance/comet/blob/main/contracts/CometExt.sol";
        await versionController.connect(WOOF.subDevelopers[1]).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometExtInitCode,
            sourceURL: NEW_URL
        });
        // Skip cooldown period for minor version release for major version 1
        await time.increase(time.duration.days(30)); // 1 month
        // Release minor for previous major version
        await versionController.connect(WOOF.subDevelopers[2]).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: CometWithExtendedAssetListInitCode,
                sourceURL: "NEW_URL"
            },
            1
        );
        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.major).to.equal(2);
        expect(latestVersion.minor).to.equal(0);
        expect(latestVersion.patch).to.equal(0);
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: { version: { major: 1, minor: 1, patch: 0 }, alternative: "" }
            })
        ).to.equal(true);
    });

    it("Should not release patch for non-existing major version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Skip cooldown to bypass cooldown check and hit validation
        await time.increase(time.duration.hours(1));
        // Try to release patch
        const nonExistingMajor = 2;
        await expect(
            versionController.connect(WOOF.subDevelopers[1]).releasePatchVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: CometExtInitCode,
                    sourceURL: "NEW_URL"
                },
                nonExistingMajor,
                0
            )
        )
            .revertedWithCustomError(versionController, "NonExistingMajorVersion")
            .withArgs(WOOF.contractTypes[0], nonExistingMajor);
    });

    it("Should not release patch for non-existing minor version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Skip cooldown to bypass cooldown check and hit validation
        await time.increase(time.duration.hours(1));
        // Try to release patch
        const nonExistingMinor = 2;
        await expect(
            versionController.connect(WOOF.subDevelopers[1]).releasePatchVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: CometExtInitCode,
                    sourceURL: "NEW_URL"
                },
                1,
                nonExistingMinor
            )
        )
            .revertedWithCustomError(versionController, "NonExistingMinorVersion")
            .withArgs(WOOF.contractTypes[0], 1, nonExistingMinor);
    });

    it("Should not update latest patch version if updating for not latest major and minor version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Skip cooldown period for major version release
        await time.increase(time.duration.days(90)); // 3 months
        // Release new major version
        const NEW_URL = "https://github.com/compound-finance/comet/blob/main/contracts/CometExt.sol";
        await versionController.connect(WOOF.subDevelopers[1]).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometExtInitCode,
            sourceURL: NEW_URL
        });
        // Skip cooldown period for patch version release
        await time.increase(time.duration.hours(1)); // 1 hour
        // Release patch for previous version
        await versionController.connect(WOOF.subDevelopers[1]).releasePatchVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: CometWithExtendedAssetListInitCode,
                sourceURL: "NEW_URL"
            },
            1,
            0
        );
        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.major).to.equal(2);
        expect(latestVersion.minor).to.equal(0);
        expect(latestVersion.patch).to.equal(0);
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: { version: { major: 1, minor: 0, patch: 1 }, alternative: "" }
            })
        ).to.equal(true);
    });

    it("Should not release alternative version for non-existing major version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Try to release alternative
        await expect(
            versionController.connect(WOOF.subDevelopers[0]).releaseAlternativeVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: CometExtInitCode,
                    sourceURL: "NEW_URL"
                },
                {
                    version: { major: 2, minor: 0, patch: 0 },
                    alternative: "alternative"
                }
            )
        )
            .revertedWithCustomError(versionController, "NonExistingVersion")
            .withArgs(WOOF.contractTypes[0], [[2, 0, 0], ""]);
    });

    it("Should not release alternative version for non-existing minor version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Try to release alternative
        await expect(
            versionController.connect(WOOF.subDevelopers[0]).releaseAlternativeVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: CometExtInitCode,
                    sourceURL: "NEW_URL"
                },
                {
                    version: { major: 1, minor: 1, patch: 0 },
                    alternative: "alternative"
                }
            )
        )
            .revertedWithCustomError(versionController, "NonExistingVersion")
            .withArgs(WOOF.contractTypes[0], [[1, 1, 0], ""]);
    });

    it("Should not release alternative version for non-existing patch version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Try to release alternative
        await expect(
            versionController.connect(WOOF.subDevelopers[0]).releaseAlternativeVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: CometExtInitCode,
                    sourceURL: "NEW_URL"
                },
                {
                    version: { major: 1, minor: 0, patch: 1 },
                    alternative: "alternative"
                }
            )
        )
            .revertedWithCustomError(versionController, "NonExistingVersion")
            .withArgs(WOOF.contractTypes[0], [[1, 0, 1], ""]);
    });

    it("Should revert if audit report is empty", async () => {
        const { WOOF, auditors, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Sign bytecode with empty audit report
        const version = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: ""
        };
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const auditReport = ""; // Empty audit report
        const signature = await prepareAuditReportSignature(
            bytecodeHash,
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await expect(
            versionController.connect(WOOF.keyDeveloper).verifyBytecode(bytecodeVersion, auditReport, signature)
        ).revertedWithCustomError(versionController, "EmptyURL");
    });

    it("Should revert if version does not exist", async () => {
        const { WOOF, auditors, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Try to verify non-existing version
        const nonExistingVersion = {
            version: { major: 2, minor: 0, patch: 0 }, // This version doesn't exist
            alternative: ""
        };
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], nonExistingVersion);
        const auditReport = "AUDIT_REPORT_URL";
        const signature = await prepareAuditReportSignature(
            bytecodeHash,
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version: nonExistingVersion };
        await expect(
            versionController.connect(WOOF.keyDeveloper).verifyBytecode(bytecodeVersion, auditReport, signature)
        )
            .revertedWithCustomError(versionController, "NonExistingVersion")
            .withArgs(WOOF.contractTypes[0], [[2, 0, 0], ""]);
    });

    it("Should revert if caller is wrong developer for contract type", async () => {
        const { WOOF, devTeam2, auditors, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Sign bytecode
        const version = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: ""
        };
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const auditReport = "AUDIT_REPORT_URL";
        const signature = await prepareAuditReportSignature(
            bytecodeHash,
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        // Try to verify with wrong developer (devTeam2 is not assigned to WOOF contract type)
        await expect(
            versionController.connect(devTeam2.keyDeveloper).verifyBytecode(bytecodeVersion, auditReport, signature)
        )
            .revertedWithCustomError(versionController, "WrongDeveloper")
            .withArgs(WOOF.contractTypes[0], devTeam2.keyDeveloper);
    });

    it("Should revert if not developer tries to verify bytecode", async () => {
        const { WOOF, users, auditors, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Sign bytecode
        const version = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: ""
        };
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const auditReport = "AUDIT_REPORT_URL";
        const signature = await prepareAuditReportSignature(
            bytecodeHash,
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await expect(versionController.connect(users[0]).verifyBytecode(bytecodeVersion, auditReport, signature))
            .revertedWithCustomError(versionController, "NotDeveloper")
            .withArgs(users[0]);
    });

    it("Should not let submit same audit report for same contract type twice", async () => {
        const { WOOF, auditors, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Sign bytecode
        const version = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: ""
        };
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const auditReport = "AUDIT_REPORT_URL";
        const signature = await prepareAuditReportSignature(
            bytecodeHash,
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await versionController.connect(WOOF.keyDeveloper).verifyBytecode(bytecodeVersion, auditReport, signature);
        // Try to verify again with same report
        await expect(
            versionController.connect(WOOF.keyDeveloper).verifyBytecode(bytecodeVersion, auditReport, signature)
        )
            .revertedWithCustomError(versionController, "AuditReportAlreadySubmitted")
            .withArgs(auditors[0], auditReport);
    });

    it("Should revert if signature is not from valid auditor", async () => {
        const { WOOF, auditors, users, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Sign bytecode
        const version = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: ""
        };
        const bytecodeHash = await versionController.computeBytecodeHash(WOOF.contractTypes[0], version);
        const auditReport = "AUDIT_REPORT_URL";
        const signature = await prepareAuditReportSignature(
            bytecodeHash,
            ethers.keccak256(CometInitCode),
            auditReport,
            await versionController.getAddress(),
            users[0] // Sign with non-auditor
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await expect(
            versionController.connect(WOOF.keyDeveloper).verifyBytecode(bytecodeVersion, auditReport, signature)
        )
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(users[0], await versionController.AUDITOR_ROLE());
    });

    it("Should not let non-admin assign dev for contract type", async () => {
        const { users, versionController } = await restore();
        const newContractType = ethers.encodeBytes32String("New_Contract_Type");
        await expect(versionController.connect(users[0]).assignDeveloperForContractTypes([newContractType], users[1]))
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(users[0], await versionController.DEFAULT_ADMIN_ROLE());
    });

    it("Should not let key developer assign dev for contract type (admin-only function)", async () => {
        const { WOOF, devTeam2, devTeam3, versionController } = await restore();
        await expect(
            versionController
                .connect(devTeam2.keyDeveloper)
                .assignDeveloperForContractTypes([WOOF.contractTypes[0]], devTeam3.keyDeveloper)
        )
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(devTeam2.keyDeveloper, await versionController.DEFAULT_ADMIN_ROLE());
    });

    it("Should not let revoked key developer assign dev for contract type", async () => {
        const { WOOF, devTeam2, governor, versionController } = await restore();
        // revoke role
        await versionController
            .connect(governor)
            .revokeRole(await versionController.KEY_DEVELOPER_ROLE(), WOOF.keyDeveloper);
        await expect(
            versionController
                .connect(WOOF.keyDeveloper)
                .transferContractTypesOwnership([WOOF.contractTypes[0]], devTeam2.keyDeveloper)
        )
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(WOOF.keyDeveloper, await versionController.KEY_DEVELOPER_ROLE());
    });

    it("Should not let assign same key dev for contract type", async () => {
        const { WOOF, governor, versionController } = await restore();
        await expect(
            versionController
                .connect(governor)
                .assignDeveloperForContractTypes([WOOF.contractTypes[0]], WOOF.keyDeveloper)
        )
            .revertedWithCustomError(versionController, "SameKeyDeveloper")
            .withArgs(WOOF.keyDeveloper);
    });

    it("Should allow admin to assign contract type to user and grant key developer role automatically", async () => {
        const { WOOF, governor, users, versionController } = await restore();

        // Verify user doesn't have key developer role initially
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), users[0])).to.be.false;

        // Admin assigns contract type (should grant role automatically)
        await expect(
            versionController.connect(governor).assignDeveloperForContractTypes([WOOF.contractTypes[0]], users[0])
        )
            .to.emit(versionController, "KeyDeveloperAssigned")
            .withArgs([WOOF.contractTypes[0]], users[0]);

        // Verify role was granted and assignment was made
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), users[0])).to.be.true;
        expect(await versionController.contractTypeKeyDeveloper(WOOF.contractTypes[0])).to.equal(users[0]);
    });

    it("Should not let add same sub developer", async () => {
        const { WOOF, governor, users, versionController } = await restore();
        // Add new key developer
        await versionController.connect(governor).grantRole(await versionController.KEY_DEVELOPER_ROLE(), users[0]);
        // Try to add same sub developer
        await expect(versionController.connect(users[0]).addSubDeveloper(WOOF.subDevelopers[0]))
            .revertedWithCustomError(versionController, "AlreadySubDeveloper")
            .withArgs(WOOF.subDevelopers[0]);
    });

    it("Should let only key developer add sub devs", async () => {
        const { governor, users, versionController } = await restore();
        // Try to add new sub
        await expect(versionController.connect(users[0]).addSubDeveloper(users[1]))
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(users[0], await versionController.KEY_DEVELOPER_ROLE());

        await expect(
            versionController.connect(governor).grantRole(await versionController.SUB_DEVELOPER_ROLE(), users[1])
        ).revertedWithCustomError(versionController, "AdminCantAddSubDevs");
    });

    it("Should revert if sub dev is already in set", async () => {
        const { governor, users, versionController } = await restore();
        // Add new key developer
        await versionController.connect(governor).grantRole(await versionController.KEY_DEVELOPER_ROLE(), users[0]);
        // Add 1st sub dev
        await versionController.connect(users[0]).addSubDeveloper(users[1]);
        // Try to add same sub dev
        await expect(versionController.connect(users[0]).addSubDeveloper(users[1]))
            .revertedWithCustomError(versionController, "SubDeveloperAlreadyInSet")
            .withArgs(users[0], users[1]);
    });

    it("Should revert if key developer reached limit of sub devs", async () => {
        const { WOOF, users, versionController } = await restore();
        await expect(versionController.connect(WOOF.keyDeveloper).addSubDeveloper(users[0]))
            .revertedWithCustomError(versionController, "TooManySubDevelopers")
            .withArgs(WOOF.keyDeveloper);
    });

    it("Should revoke sub developer role", async () => {
        const { WOOF, governor, versionController } = await restore();
        const SUB_DEVELOPER_ROLE = await versionController.SUB_DEVELOPER_ROLE();
        // Remove sub dev via removeSubDev function
        await versionController.connect(WOOF.keyDeveloper).removeSubDeveloper(WOOF.subDevelopers[0]);
        expect(await versionController.getSubDevsForKeyDeveloper(WOOF.keyDeveloper)).to.not.contain(
            WOOF.subDevelopers[0]
        );
        expect(await versionController.subToKeyDeveloper(WOOF.subDevelopers[0])).to.equal(ethers.ZeroAddress);
        expect(await versionController.hasRole(SUB_DEVELOPER_ROLE, WOOF.subDevelopers[0])).to.be.false;
        // Remove via revoke role
        await versionController.connect(governor).revokeRole(SUB_DEVELOPER_ROLE, WOOF.subDevelopers[1]);
        expect(await versionController.getSubDevsForKeyDeveloper(WOOF.keyDeveloper)).to.not.contain(
            WOOF.subDevelopers[1]
        );
        expect(await versionController.subToKeyDeveloper(WOOF.subDevelopers[1])).to.equal(ethers.ZeroAddress);
        expect(await versionController.hasRole(SUB_DEVELOPER_ROLE, WOOF.subDevelopers[1])).to.be.false;
        // Remove via renounce role
        await versionController.connect(WOOF.subDevelopers[2]).renounceRole(SUB_DEVELOPER_ROLE, WOOF.subDevelopers[2]);
        expect(await versionController.getSubDevsForKeyDeveloper(WOOF.keyDeveloper)).to.not.contain(
            WOOF.subDevelopers[2]
        );
        expect(await versionController.subToKeyDeveloper(WOOF.subDevelopers[0])).to.equal(ethers.ZeroAddress);
        expect(await versionController.hasRole(SUB_DEVELOPER_ROLE, WOOF.subDevelopers[0])).to.be.false;
        expect((await versionController.getSubDevsForKeyDeveloper(WOOF.keyDeveloper)).length).to.equal(0);
    });

    it("Only key developer can remove sub developer via removeSubDeveloper()", async () => {
        const { WOOF, users, versionController } = await restore();
        await expect(versionController.connect(users[0]).removeSubDeveloper(WOOF.subDevelopers[0]))
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(users[0], await versionController.KEY_DEVELOPER_ROLE());
    });

    it("Should not let remove sub developer of other key dev", async () => {
        const { WOOF, devTeam2, versionController } = await restore();
        await expect(versionController.connect(devTeam2.keyDeveloper).removeSubDeveloper(WOOF.subDevelopers[0]))
            .revertedWithCustomError(versionController, "WrongKeyDeveloper")
            .withArgs(devTeam2.keyDeveloper, WOOF.subDevelopers[0]);
    });

    it("Should revert if sub developer is not in key dev's set", async () => {
        const { WOOF, governor, versionController } = await restore();
        await versionController.connect(WOOF.keyDeveloper).removeSubDeveloper(WOOF.subDevelopers[0]);
        // Try to remove again via governor
        await expect(
            versionController
                .connect(governor)
                .revokeRole(await versionController.SUB_DEVELOPER_ROLE(), WOOF.subDevelopers[0])
        )
            .revertedWithCustomError(versionController, "SubDeveloperNotInSet")
            .withArgs(ethers.ZeroAddress, WOOF.subDevelopers[0]);
    });

    it("Should revoke key developer role", async () => {
        const { WOOF, governor, versionController } = await restore();
        const KEY_DEVELOPER_ROLE = await versionController.KEY_DEVELOPER_ROLE();
        await versionController.connect(governor).revokeRole(KEY_DEVELOPER_ROLE, WOOF.keyDeveloper);
        expect(await versionController.hasRole(KEY_DEVELOPER_ROLE, WOOF.keyDeveloper)).to.be.false;
        const SUB_DEVELOPER_ROLE = await versionController.SUB_DEVELOPER_ROLE();
        for (const dev of WOOF.subDevelopers) {
            expect(await versionController.hasRole(SUB_DEVELOPER_ROLE, dev)).to.be.false;
            expect(await versionController.subToKeyDeveloper(dev)).to.equal(ethers.ZeroAddress);
        }
        expect((await versionController.getSubDevsForKeyDeveloper(WOOF.keyDeveloper)).length).to.equal(0);
    });

    it("Should return key developer if passed address has key developer role", async () => {
        const { WOOF, versionController } = await restore();
        expect(await versionController.getKeyDeveloper(WOOF.keyDeveloper)).to.equal(WOOF.keyDeveloper);
    });

    it("Should return zero address as key developer if passed account is not dev", async () => {
        const { users, versionController } = await restore();
        expect(await versionController.getKeyDeveloper(users[0])).to.equal(ethers.ZeroAddress);
    });

    it("Should return false if version doesn't exist", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: { version: { major: 1, minor: 0, patch: 1 }, alternative: "" }
            })
        ).to.be.false;
    });

    it("Should not let release same alternative version", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Release new alternative version
        const NEW_URL = "https://github.com/compound-finance/comet/blob/main/contracts/CometExt.sol";
        const alternativeVersion = {
            version: { major: 1, minor: 0, patch: 0 },
            alternative: "alt"
        };
        await versionController.connect(WOOF.subDevelopers[1]).releaseAlternativeVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: CometExtInitCode,
                sourceURL: NEW_URL
            },
            alternativeVersion
        );
        await expect(
            versionController.connect(WOOF.subDevelopers[1]).releaseAlternativeVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: CometWithExtendedAssetListInitCode,
                    sourceURL: NEW_URL
                },
                alternativeVersion
            )
        )
            .revertedWithCustomError(versionController, "VersionAlreadyExists")
            .withArgs(WOOF.contractTypes[0], [[1, 0, 0], "alt"]);
    });

    it("Should revert if bytecode is not verified", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        // Try to get unverified bytecode
        await expect(
            versionController.getVerifiedBytecode({
                contractType: WOOF.contractTypes[0],
                version: { version: { major: 1, minor: 0, patch: 0 }, alternative: "" }
            })
        )
            .revertedWithCustomError(versionController, "BytecodeNotVerified")
            .withArgs([WOOF.contractTypes[0], [[1, 0, 0], ""]]);
    });

    it("Should revert if bytecode is empty", async () => {
        const { WOOF, versionController } = await restore();
        // Release bytecode
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";
        await expect(
            versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
                contractType: WOOF.contractTypes[0],
                initCode: "0x",
                sourceURL: URL
            })
        ).revertedWithCustomError(versionController, "InitCodeIsEmpty");
    });

    it("Should not allow uploading same initCode twice", async () => {
        const { WOOF, devTeam2, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Release bytecode with WOOF team first
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });

        // Try to upload same initCode for different contract type with different team
        const bytecodeHash = ethers.keccak256(CometInitCode);
        await expect(
            versionController.connect(devTeam2.keyDeveloper).releaseBytecode({
                contractType: devTeam2.contractTypes[0],
                initCode: CometInitCode,
                sourceURL: URL
            })
        )
            .revertedWithCustomError(versionController, "BytecodeAlreadyUploaded")
            .withArgs(bytecodeHash);
    });

    it("Should not allow uploading same initCode in different versions", async () => {
        const { WOOF, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Release initial bytecode
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });

        // Skip cooldown to bypass cooldown check and hit validation
        await time.increase(time.duration.days(90));

        // Try to upload same initCode as major version
        const bytecodeHash = ethers.keccak256(CometInitCode);
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
                contractType: WOOF.contractTypes[0],
                initCode: CometInitCode,
                sourceURL: URL
            })
        )
            .revertedWithCustomError(versionController, "BytecodeAlreadyUploaded")
            .withArgs(bytecodeHash);
    });

    it("Should not allow uploading same initCode in alternative versions", async () => {
        const { WOOF, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Release initial bytecode
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });

        // Try to upload same initCode as alternative version
        const bytecodeHash = ethers.keccak256(CometInitCode);
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseAlternativeVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: CometInitCode,
                    sourceURL: URL
                },
                {
                    version: { major: 1, minor: 0, patch: 0 },
                    alternative: "optimized"
                }
            )
        )
            .revertedWithCustomError(versionController, "BytecodeAlreadyUploaded")
            .withArgs(bytecodeHash);
    });

    /* Cooldown tests */

    it("Should enforce cooldown after releaseBytecode() - can't release any newer versions before cooldown passes", async () => {
        const { WOOF, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Release initial bytecode
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });

        // Try to release major version before cooldown passes
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode1,
                sourceURL: "NEW_URL"
            })
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Try to release minor version before cooldown passes
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: TestBytecode2,
                    sourceURL: "NEW_URL"
                },
                1
            )
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Try to release patch version before cooldown passes
        await expect(
            versionController.connect(WOOF.keyDeveloper).releasePatchVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: TestBytecode3,
                    sourceURL: "NEW_URL"
                },
                1,
                0
            )
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Skip cooldown for patch and verify it works
        await time.increase(time.duration.hours(1));
        await versionController.connect(WOOF.keyDeveloper).releasePatchVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode3,
                sourceURL: "NEW_URL"
            },
            1,
            0
        );

        // Skip cooldown for minor and verify it works
        await time.increase(time.duration.days(30));
        await versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode2,
                sourceURL: "NEW_URL2"
            },
            1
        );

        // Skip cooldown for major and verify it works
        await time.increase(time.duration.days(90));
        await versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: TestBytecode1,
            sourceURL: "NEW_URL3"
        });
    });

    it("Should enforce cooldown after releaseMajorVersion() - can't release new major versions for given contract type", async () => {
        const { WOOF, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Release initial bytecode and skip cooldown
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        await time.increase(time.duration.days(90)); // Skip initial cooldown

        // Release major version
        await versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometExtInitCode,
            sourceURL: "NEW_URL"
        });

        // Try to release another major version before cooldown passes
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
                contractType: WOOF.contractTypes[0],
                initCode: CometWithExtendedAssetListInitCode,
                sourceURL: "NEW_URL2"
            })
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Skip cooldown and verify it works
        await time.increase(time.duration.days(90)); // 3 months
        await versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometWithExtendedAssetListInitCode,
            sourceURL: "NEW_URL2"
        });

        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.major).to.equal(3);
    });

    it("Should enforce cooldown after releaseMinorVersion() - can't release new minor version for specified major version, but can release for other major versions", async () => {
        const { WOOF, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Setup: Release initial bytecode and create major version 2
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        await time.increase(time.duration.days(90)); // Skip cooldown
        await versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometExtInitCode,
            sourceURL: "NEW_URL"
        });

        // Skip cooldown for minor version release for major version 1
        await time.increase(time.duration.days(30));

        // Release minor version for major version 1
        await versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode1,
                sourceURL: "NEW_URL2"
            },
            1
        );

        // Try to release another minor version for major version 1 before cooldown passes
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: TestBytecode2,
                    sourceURL: "NEW_URL3"
                },
                1
            )
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // But should be able to release minor version for major version 2 (no cooldown for different major)
        await versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode3,
                sourceURL: "NEW_URL4"
            },
            2
        );

        // Verify both versions exist
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: { version: { major: 1, minor: 1, patch: 0 }, alternative: "" }
            })
        ).to.be.true;

        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: { version: { major: 2, minor: 1, patch: 0 }, alternative: "" }
            })
        ).to.be.true;

        // Skip cooldown and verify we can release for major version 1 again
        await time.increase(time.duration.days(30));
        await versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode2,
                sourceURL: "NEW_URL5"
            },
            1
        );

        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: { version: { major: 1, minor: 2, patch: 0 }, alternative: "" }
            })
        ).to.be.true;
    });

    it("Should enforce cooldown after releasePatchVersion() - can't release new patch versions for given contract type", async () => {
        const { WOOF, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Setup: Release initial bytecode
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });

        // Skip cooldown and release patch version for 1.0.0 -> 1.0.1
        await time.increase(time.duration.hours(1));
        await versionController.connect(WOOF.keyDeveloper).releasePatchVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode1,
                sourceURL: "NEW_URL"
            },
            1,
            0
        );

        // Try to release another patch version before cooldown passes
        await expect(
            versionController.connect(WOOF.keyDeveloper).releasePatchVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: TestBytecode2,
                    sourceURL: "NEW_URL2"
                },
                1,
                0
            )
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Skip cooldown and verify it works (1.0.1 -> 1.0.2)
        await time.increase(time.duration.hours(1));
        await versionController.connect(WOOF.keyDeveloper).releasePatchVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode2,
                sourceURL: "NEW_URL2"
            },
            1,
            0
        );

        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.patch).to.equal(2);
    });

    it("Cooldown doesn't affect other contract types", async () => {
        const { WOOF, devTeam2, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Release bytecode for WOOF contract type
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });

        // Should still be able to release bytecode for devTeam2 contract type (different contract type)
        await versionController.connect(devTeam2.subDevelopers[0]).releaseBytecode({
            contractType: devTeam2.contractTypes[0],
            initCode: TestBytecode1,
            sourceURL: URL
        });

        // Verify both were released
        expect(await versionController.getLatestVersion(WOOF.contractTypes[0])).to.equal("1.0.0");
        expect(await versionController.getLatestVersion(devTeam2.contractTypes[0])).to.equal("1.0.0");

        // Try to release major version for WOOF before cooldown (should fail)
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode2,
                sourceURL: "NEW_URL"
            })
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Should be able to release major version for devTeam2 (no cooldown for different contract type)
        await time.increase(time.duration.days(90)); // Skip cooldown
        await versionController.connect(devTeam2.keyDeveloper).releaseMajorVersion({
            contractType: devTeam2.contractTypes[0],
            initCode: TestBytecode3,
            sourceURL: "NEW_URL"
        });

        // Verify devTeam2 released major version while WOOF still can't (if we reset time)
        expect(await versionController.getLatestVersion(devTeam2.contractTypes[0])).to.equal("2.0.0");

        // Now WOOF should also be able to release (cooldown passed)
        await versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: TestBytecode2,
            sourceURL: "NEW_URL2"
        });
        expect(await versionController.getLatestVersion(WOOF.contractTypes[0])).to.equal("2.0.0");
    });

    /* Cooldown Reset Tests */

    it("Should allow admin to reset major cooldown and enable immediate major version release", async () => {
        const { WOOF, versionController, guardian } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Release initial bytecode
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });

        // Try to release major version before cooldown passes (should fail)
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode1,
                sourceURL: "NEW_URL"
            })
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Admin resets major cooldown (VersionType.Major = 0)
        await expect(versionController.connect(guardian).resetCooldown(0, WOOF.contractTypes[0], 0))
            .to.emit(versionController, "CooldownReset")
            .withArgs(WOOF.contractTypes[0], 0, 0);

        // Now major version release should work immediately
        await versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: TestBytecode1,
            sourceURL: "NEW_URL"
        });

        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.major).to.equal(2);
    });

    it("Should allow admin to reset minor cooldown and enable immediate minor version release", async () => {
        const { guardian, WOOF, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Setup: Release initial bytecode and skip major cooldown
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        await time.increase(time.duration.days(30)); // Skip minor cooldown for major version 1

        // Release first minor version (1.1.0)
        await versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode1,
                sourceURL: "NEW_URL"
            },
            1
        );

        // Try to release another minor version for same major before cooldown passes (should fail)
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: TestBytecode2,
                    sourceURL: "NEW_URL2"
                },
                1
            )
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Admin resets minor cooldown for major version 1 (VersionType.Minor = 1)
        await expect(versionController.connect(guardian).resetCooldown(1, WOOF.contractTypes[0], 1))
            .to.emit(versionController, "CooldownReset")
            .withArgs(WOOF.contractTypes[0], 1, 1);

        // Now minor version release should work immediately
        await versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode2,
                sourceURL: "NEW_URL2"
            },
            1
        );

        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.minor).to.equal(2);
    });

    it("Should allow admin to reset patch cooldown and enable immediate patch version release", async () => {
        const { guardian, WOOF, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Setup: Release initial bytecode and skip patch cooldown
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });
        await time.increase(time.duration.hours(1));

        // Release first patch version (1.0.1)
        await versionController.connect(WOOF.keyDeveloper).releasePatchVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode1,
                sourceURL: "NEW_URL"
            },
            1,
            0
        );

        // Try to release another patch version before cooldown passes (should fail)
        await expect(
            versionController.connect(WOOF.keyDeveloper).releasePatchVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: TestBytecode2,
                    sourceURL: "NEW_URL2"
                },
                1,
                0
            )
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Admin resets patch cooldown (VersionType.Patch = 2)
        await expect(versionController.connect(guardian).resetCooldown(2, WOOF.contractTypes[0], 0))
            .to.emit(versionController, "CooldownReset")
            .withArgs(WOOF.contractTypes[0], 2, 0);

        // Now patch version release should work immediately
        await versionController.connect(WOOF.keyDeveloper).releasePatchVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode2,
                sourceURL: "NEW_URL2"
            },
            1,
            0
        );

        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.patch).to.equal(2);
    });

    it("Should revert when admin tries to pass invalid enum value (3) for version type", async () => {
        const { guardian, WOOF, versionController } = await restore();

        // Try to call resetCooldown with invalid enum value 3 (should revert)
        await expect(versionController.connect(guardian).resetCooldown(3, WOOF.contractTypes[0], 0)).to.be.reverted;
    });

    it("Should allow guarding to reset cooldown for specific major version without affecting others", async () => {
        const { WOOF, versionController, guardian } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Setup: Release initial bytecode, create major version 2, and release minor versions
        await versionController.connect(WOOF.subDevelopers[0]).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });

        // Skip cooldown and release major version 2
        await time.increase(time.duration.days(90));
        await versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometExtInitCode,
            sourceURL: "NEW_URL"
        });

        // Skip cooldown and release minor versions for both majors
        await time.increase(time.duration.days(30));
        await versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode1,
                sourceURL: "NEW_URL2"
            },
            1
        );
        await versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode2,
                sourceURL: "NEW_URL3"
            },
            2
        );

        // Now both major versions should have cooldown for minor releases
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: TestBytecode3,
                    sourceURL: "NEW_URL4"
                },
                1
            )
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: TestBytecode4,
                    sourceURL: "NEW_URL5"
                },
                2
            )
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Admin resets minor cooldown only for major version 1
        await versionController.connect(guardian).resetCooldown(1, WOOF.contractTypes[0], 1);

        // Now major version 1 should allow minor release, but major version 2 should still be blocked
        await versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: TestBytecode3,
                sourceURL: "NEW_URL4"
            },
            1
        );

        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMinorVersion(
                {
                    contractType: WOOF.contractTypes[0],
                    initCode: TestBytecode4,
                    sourceURL: "NEW_URL5"
                },
                2
            )
        ).revertedWithCustomError(versionController, "CantReleaseYet");

        // Verify version 1.2.0 exists but version 2.2.0 doesn't
        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: { version: { major: 1, minor: 2, patch: 0 }, alternative: "" }
            })
        ).to.be.true;

        expect(
            await versionController["versionExists((bytes32,((uint64,uint64,uint64),string)))"]({
                contractType: WOOF.contractTypes[0],
                version: { version: { major: 2, minor: 2, patch: 0 }, alternative: "" }
            })
        ).to.be.false;
    });

    /* Developer Assignment and Transfer Tests */

    it("Should allow admin to change key developer for existing contract type", async () => {
        const { governor, WOOF, devTeam2, versionController } = await restore();

        // Change WOOF contract type to devTeam2 key developer
        await expect(
            versionController
                .connect(governor)
                .assignDeveloperForContractTypes([WOOF.contractTypes[0]], devTeam2.keyDeveloper)
        )
            .to.emit(versionController, "KeyDeveloperAssigned")
            .withArgs([WOOF.contractTypes[0]], devTeam2.keyDeveloper);

        // Verify assignment changed
        expect(await versionController.contractTypeKeyDeveloper(WOOF.contractTypes[0])).to.equal(devTeam2.keyDeveloper);
        // Both should still have key developer role
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), WOOF.keyDeveloper)).to.be
            .true;
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), devTeam2.keyDeveloper)).to
            .be.true;
    });

    it("Should allow admin to reset contract type ownership with zero address", async () => {
        const { governor, WOOF, versionController } = await restore();

        // Reset ownership by assigning zero address
        await expect(
            versionController
                .connect(governor)
                .assignDeveloperForContractTypes([WOOF.contractTypes[0]], ethers.ZeroAddress)
        )
            .to.emit(versionController, "KeyDeveloperAssigned")
            .withArgs([WOOF.contractTypes[0]], ethers.ZeroAddress);

        // Verify assignment was reset
        expect(await versionController.contractTypeKeyDeveloper(WOOF.contractTypes[0])).to.equal(ethers.ZeroAddress);
        // Original key developer should still have the role (not revoked)
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), WOOF.keyDeveloper)).to.be
            .true;
    });

    it("Should not grant role when admin assigns zero address", async () => {
        const { governor, users, versionController } = await restore();
        const newContractType = ethers.encodeBytes32String("NewContractType");

        // First assign a real developer
        await versionController.connect(governor).assignDeveloperForContractTypes([newContractType], users[0]);
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), users[0])).to.be.true;

        // Then reset with zero address - should not affect role
        await versionController
            .connect(governor)
            .assignDeveloperForContractTypes([newContractType], ethers.ZeroAddress);
        expect(await versionController.contractTypeKeyDeveloper(newContractType)).to.equal(ethers.ZeroAddress);
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), ethers.ZeroAddress)).to.be
            .false;
    });

    it("Should allow key developer to transfer contract type ownership to another key developer", async () => {
        const { WOOF, devTeam2, versionController } = await restore();

        // WOOF key developer transfers ownership to devTeam2 key developer
        await expect(
            versionController
                .connect(WOOF.keyDeveloper)
                .transferContractTypesOwnership([WOOF.contractTypes[0]], devTeam2.keyDeveloper)
        )
            .to.emit(versionController, "KeyDeveloperAssigned")
            .withArgs([WOOF.contractTypes[0]], devTeam2.keyDeveloper);

        // Verify ownership transferred
        expect(await versionController.contractTypeKeyDeveloper(WOOF.contractTypes[0])).to.equal(devTeam2.keyDeveloper);

        // Verify both still have key developer roles (no role changes)
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), WOOF.keyDeveloper)).to.be
            .true;
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), devTeam2.keyDeveloper)).to
            .be.true;
    });

    it("Should revert when non-key-developer tries to transfer contract type ownership", async () => {
        const { WOOF, users, versionController } = await restore();

        await expect(
            versionController.connect(users[0]).transferContractTypesOwnership([WOOF.contractTypes[0]], users[1])
        )
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(users[0], await versionController.KEY_DEVELOPER_ROLE());
    });

    it("Should revert when key developer tries to transfer ownership of contract type they don't own", async () => {
        const { WOOF, devTeam2, versionController } = await restore();

        // devTeam2 key developer tries to transfer WOOF's contract type
        await expect(
            versionController
                .connect(devTeam2.keyDeveloper)
                .transferContractTypesOwnership([WOOF.contractTypes[0]], devTeam2.keyDeveloper)
        )
            .revertedWithCustomError(versionController, "NotAuthorizedForContractType")
            .withArgs(WOOF.contractTypes[0], devTeam2.keyDeveloper);
    });

    it("Should revert when trying to transfer to same key developer", async () => {
        const { WOOF, versionController } = await restore();

        await expect(
            versionController
                .connect(WOOF.keyDeveloper)
                .transferContractTypesOwnership([WOOF.contractTypes[0]], WOOF.keyDeveloper)
        )
            .revertedWithCustomError(versionController, "SameKeyDeveloper")
            .withArgs(WOOF.keyDeveloper);
    });

    it("Should revert when transferring to address without key developer role", async () => {
        const { WOOF, users, versionController } = await restore();

        // Verify user doesn't have key developer role
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), users[0])).to.be.false;

        await expect(
            versionController
                .connect(WOOF.keyDeveloper)
                .transferContractTypesOwnership([WOOF.contractTypes[0]], users[0])
        )
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(users[0], await versionController.KEY_DEVELOPER_ROLE());
    });

    it("Should allow key developer to transfer ownership after admin reset", async () => {
        const { governor, WOOF, devTeam2, users, versionController } = await restore();

        // Admin resets ownership
        await versionController
            .connect(governor)
            .assignDeveloperForContractTypes([WOOF.contractTypes[0]], ethers.ZeroAddress);
        expect(await versionController.contractTypeKeyDeveloper(WOOF.contractTypes[0])).to.equal(ethers.ZeroAddress);

        // Admin reassigns to a different key developer
        await versionController
            .connect(governor)
            .assignDeveloperForContractTypes([WOOF.contractTypes[0]], devTeam2.keyDeveloper);

        // New owner should be able to transfer
        await versionController.connect(governor).grantRole(await versionController.KEY_DEVELOPER_ROLE(), users[0]);
        await versionController
            .connect(devTeam2.keyDeveloper)
            .transferContractTypesOwnership([WOOF.contractTypes[0]], users[0]);

        expect(await versionController.contractTypeKeyDeveloper(WOOF.contractTypes[0])).to.equal(users[0]);
    });

    it("Should maintain functionality after ownership transfer", async () => {
        const { WOOF, devTeam2, versionController } = await restore();
        const URL = "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol";

        // Original key developer releases bytecode
        await versionController.connect(WOOF.keyDeveloper).releaseBytecode({
            contractType: WOOF.contractTypes[0],
            initCode: CometInitCode,
            sourceURL: URL
        });

        // Transfer ownership
        await versionController
            .connect(WOOF.keyDeveloper)
            .transferContractTypesOwnership([WOOF.contractTypes[0]], devTeam2.keyDeveloper);

        // New owner should be able to manage the contract type
        await time.increase(time.duration.days(90)); // Skip cooldown
        await versionController.connect(devTeam2.keyDeveloper).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometExtInitCode,
            sourceURL: "NEW_URL"
        });

        const latestVersion = await versionController.latestVersions(WOOF.contractTypes[0]);
        expect(latestVersion.major).to.equal(2);

        // Old owner should no longer be able to manage the contract type - try to release another major version
        await time.increase(time.duration.days(90)); // Skip cooldown
        await expect(
            versionController.connect(WOOF.keyDeveloper).releaseMajorVersion({
                contractType: WOOF.contractTypes[0],
                initCode: CometWithExtendedAssetListInitCode,
                sourceURL: "ANOTHER_URL"
            })
        )
            .revertedWithCustomError(versionController, "WrongDeveloper")
            .withArgs(WOOF.contractTypes[0], WOOF.keyDeveloper);
    });

    it("Should allow complex ownership transfer chain", async () => {
        const { governor, WOOF, devTeam2, devTeam3, versionController } = await restore();
        const contractType = WOOF.contractTypes[0];

        // Initial: WOOF owns contract type
        expect(await versionController.contractTypeKeyDeveloper(contractType)).to.equal(WOOF.keyDeveloper);

        // Transfer: WOOF -> devTeam2
        await versionController
            .connect(WOOF.keyDeveloper)
            .transferContractTypesOwnership([contractType], devTeam2.keyDeveloper);
        expect(await versionController.contractTypeKeyDeveloper(contractType)).to.equal(devTeam2.keyDeveloper);

        // Transfer: devTeam2 -> devTeam3
        await versionController
            .connect(devTeam2.keyDeveloper)
            .transferContractTypesOwnership([contractType], devTeam3.keyDeveloper);
        expect(await versionController.contractTypeKeyDeveloper(contractType)).to.equal(devTeam3.keyDeveloper);

        // Admin override: devTeam3 -> WOOF
        await versionController.connect(governor).assignDeveloperForContractTypes([contractType], WOOF.keyDeveloper);
        expect(await versionController.contractTypeKeyDeveloper(contractType)).to.equal(WOOF.keyDeveloper);

        // Verify all still have key developer roles
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), WOOF.keyDeveloper)).to.be
            .true;
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), devTeam2.keyDeveloper)).to
            .be.true;
        expect(await versionController.hasRole(await versionController.KEY_DEVELOPER_ROLE(), devTeam3.keyDeveloper)).to
            .be.true;
    });
});
