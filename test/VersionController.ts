import { expect } from "chai";
import { network, ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { CometInitCode, CometExtInitCode } from "./testData.json";
import { EIP712Domain, Developers, domainResultToPlainObject, prepareAuditReportSignature } from "./helpers";

describe("VersionController", function () {
    const fixture = async () => {
        const signers = await ethers.getSigners();
        const governor = signers[0];
        const auditors = signers.slice(1, 4); // 3 Auditors
        const WOOF: Developers = {
            keyDeveloper: signers[4],
            subDevelopers: signers.slice(5, 8),
            contractTypes: ["COMET", "VERSION_CONTROLLER"].map((ct: string): string => ethers.encodeBytes32String(ct))
        };
        const devTeam2: Developers = {
            keyDeveloper: signers[8],
            subDevelopers: signers.slice(9, 12),
            contractTypes: ["STAKING", "VESTING"].map((ct: string): string => ethers.encodeBytes32String(ct))
        };
        const devTeam3: Developers = {
            keyDeveloper: signers[12],
            subDevelopers: signers.slice(13, 16),
            contractTypes: ["BRIDGE", "BRAND_NEW_CONTRACT_TYPE"].map((ct: string): string =>
                ethers.encodeBytes32String(ct)
            )
        };
        const users = signers.slice(16);

        const versionController = await upgrades.deployProxy(
            await ethers.getContractFactory("VersionController"),
            [await governor.getAddress()],
            { kind: "uups" }
        );

        const AUDITOR_ROLE = await versionController.AUDITOR_ROLE();
        for (const auditor of auditors) await versionController.connect(governor).grantRole(AUDITOR_ROLE, auditor);

        const KEY_DEVELOPER_ROLE = await versionController.KEY_DEVELOPER_ROLE();
        await versionController.connect(governor).grantRole(KEY_DEVELOPER_ROLE, WOOF.keyDeveloper);
        await versionController.connect(governor).grantRole(KEY_DEVELOPER_ROLE, devTeam2.keyDeveloper);
        await versionController.connect(governor).grantRole(KEY_DEVELOPER_ROLE, devTeam3.keyDeveloper);

        for (const contractType of WOOF.contractTypes)
            await versionController.connect(governor).assignDeveloperForContractType(contractType, WOOF.keyDeveloper);
        for (const contractType of devTeam2.contractTypes)
            await versionController
                .connect(governor)
                .assignDeveloperForContractType(contractType, devTeam2.keyDeveloper);
        for (const contractType of devTeam3.contractTypes)
            await versionController
                .connect(governor)
                .assignDeveloperForContractType(contractType, devTeam3.keyDeveloper);

        for (const subDev of WOOF.subDevelopers)
            await versionController.connect(WOOF.keyDeveloper).addSubDeveloper(subDev);
        for (const subDev of devTeam2.subDevelopers)
            await versionController.connect(devTeam2.keyDeveloper).addSubDeveloper(subDev);
        for (const subDev of devTeam3.subDevelopers)
            await versionController.connect(devTeam3.keyDeveloper).addSubDeveloper(subDev);

        return { governor, auditors, WOOF, devTeam2, devTeam3, users, versionController };
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
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await versionController.connect(auditors[0]).verifyBytecode(bytecodeVersion, auditReport, signature);
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
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await versionController.connect(auditors[0]).verifyBytecode(bytecodeVersion, auditReport, signature);
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
        // Release new major version
        const NEW_URL = "https://github.com/compound-finance/comet/blob/main/contracts/CometExt.sol";
        await versionController.connect(WOOF.subDevelopers[1]).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometExtInitCode,
            sourceURL: NEW_URL
        });
        // Release minor for previous major version
        await versionController.connect(WOOF.subDevelopers[2]).releaseMinorVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: CometExtInitCode,
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
        // Release new major version
        const NEW_URL = "https://github.com/compound-finance/comet/blob/main/contracts/CometExt.sol";
        await versionController.connect(WOOF.subDevelopers[1]).releaseMajorVersion({
            contractType: WOOF.contractTypes[0],
            initCode: CometExtInitCode,
            sourceURL: NEW_URL
        });
        // Release patch for previous version
        await versionController.connect(WOOF.subDevelopers[1]).releasePatchVersion(
            {
                contractType: WOOF.contractTypes[0],
                initCode: CometExtInitCode,
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

    it("Should revert if not auditor tries to verify bytecode", async () => {
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
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await expect(versionController.connect(users[0]).verifyBytecode(bytecodeVersion, auditReport, signature))
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(users[0], await versionController.AUDITOR_ROLE());
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
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await versionController.connect(auditors[0]).verifyBytecode(bytecodeVersion, auditReport, signature);
        // Try to verify again with same report
        await expect(versionController.connect(auditors[0]).verifyBytecode(bytecodeVersion, auditReport, signature))
            .revertedWithCustomError(versionController, "AuditReportAlreadySubmitted")
            .withArgs(auditors[0], auditReport);
    });

    it("Should revert if caller is not the author of report", async () => {
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
            auditReport,
            await versionController.getAddress(),
            auditors[0]
        );
        const bytecodeVersion = { contractType: WOOF.contractTypes[0], version };
        await expect(versionController.connect(auditors[1]).verifyBytecode(bytecodeVersion, auditReport, signature))
            .revertedWithCustomError(versionController, "InvalidAuditor")
            .withArgs(auditors[0]);
    });

    it("Should not let assign dev for contract type if caller is neither admin nor key dev of contract type", async () => {
        const { users, versionController } = await restore();
        const newContractType = ethers.encodeBytes32String("New_Contract_Type");
        await expect(versionController.connect(users[0]).assignDeveloperForContractType(newContractType, users[1]))
            .revertedWithCustomError(versionController, "NotAuthorizedForContractType")
            .withArgs(newContractType, users[0]);
    });

    it("Should not let assign dev for contract type if caller is not key dev of contract type", async () => {
        const { WOOF, devTeam2, devTeam3, versionController } = await restore();
        await expect(
            versionController
                .connect(devTeam2.keyDeveloper)
                .assignDeveloperForContractType(WOOF.contractTypes[0], devTeam3.keyDeveloper)
        )
            .revertedWithCustomError(versionController, "NotAuthorizedForContractType")
            .withArgs(WOOF.contractTypes[0], devTeam2.keyDeveloper);
    });

    it("Should not let assign dev for contract type if caller no longer has a key dev role", async () => {
        const { WOOF, devTeam2, governor, versionController } = await restore();
        // revoke role
        await versionController
            .connect(governor)
            .revokeRole(await versionController.KEY_DEVELOPER_ROLE(), WOOF.keyDeveloper);
        await expect(
            versionController
                .connect(WOOF.keyDeveloper)
                .assignDeveloperForContractType(WOOF.contractTypes[0], devTeam2.keyDeveloper)
        )
            .revertedWithCustomError(versionController, "NotAuthorizedForContractType")
            .withArgs(WOOF.contractTypes[0], WOOF.keyDeveloper);
    });

    it("Should not let assign same key dev for contract type", async () => {
        const { WOOF, governor, versionController } = await restore();
        await expect(
            versionController.connect(governor).assignDeveloperForContractType(WOOF.contractTypes[0], WOOF.keyDeveloper)
        )
            .revertedWithCustomError(versionController, "SameKeyDeveloper")
            .withArgs(WOOF.keyDeveloper);
    });

    it("Should not let assign contract type to not key developer", async () => {
        const { WOOF, governor, users, versionController } = await restore();
        await expect(
            versionController.connect(governor).assignDeveloperForContractType(WOOF.contractTypes[0], users[0])
        )
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(users[0], await versionController.KEY_DEVELOPER_ROLE());
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
        )
            .revertedWithCustomError(versionController, "AccessControlUnauthorizedAccount")
            .withArgs(governor, await versionController.KEY_DEVELOPER_ROLE());
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
                    initCode: CometExtInitCode,
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
});
