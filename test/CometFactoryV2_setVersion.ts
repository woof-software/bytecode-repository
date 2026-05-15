import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("CometFactoryV2 setVersion()", function () {
    const fixture = async () => {
        const signers = await ethers.getSigners();
        const timelock = signers[0];
        const bytecodeProviderMock = await (await ethers.getContractFactory("BytecodeProviderMock")).deploy();

        return { timelock, bytecodeProviderMock };
    };

    const restore = async () => await loadFixture(fixture);

    describe("Same major, minor increases, patch any", function () {
        const fixture2 = async () => {
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: ""
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);
            return cometFactoryV2;
        };

        it("1.2.3 => 1.3.0", async () => {
            const cometFactoryV2 = await loadFixture(fixture2);
            const newVersion = {
                version: { major: 1n, minor: 3n, patch: 0n },
                alternative: ""
            };
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });

        it("1.2.3 => 1.3.5", async () => {
            const cometFactoryV2 = await loadFixture(fixture2);
            const newVersion = {
                version: { major: 1n, minor: 3n, patch: 5n },
                alternative: ""
            };
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });

        it("1.2.3 => 1.3.5", async () => {
            const cometFactoryV2 = await loadFixture(fixture2);
            const newVersion = {
                version: { major: 1n, minor: 5n, patch: 1n },
                alternative: ""
            };
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });
    });

    describe("Same major and minor, patch increases", function () {
        const fixture2 = async () => {
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: ""
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);
            return cometFactoryV2;
        };

        it("1.2.3 => 1.2.4", async () => {
            const cometFactoryV2 = await loadFixture(fixture2);
            const newVersion = {
                version: { major: 1n, minor: 2n, patch: 4n },
                alternative: ""
            };
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });

        it("1.2.3 => 1.2.10", async () => {
            const cometFactoryV2 = await loadFixture(fixture2);
            const newVersion = {
                version: { major: 1n, minor: 2n, patch: 10n },
                alternative: ""
            };
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });
    });

    describe("Same major and minor, patch decreases (rollback)", function () {
        it("1.2.5 => 1.2.3", async () => {
            // Setup
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 2n, patch: 5n },
                alternative: ""
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);
            // Check
            const newVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: ""
            };
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });

        it("1.2.10 => 1.2.1", async () => {
            // Setup
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 2n, patch: 10n },
                alternative: ""
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);

            const newVersion = {
                version: { major: 1n, minor: 2n, patch: 1n },
                alternative: ""
            };
            // Check
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });
    });

    describe("Major version upgrade (+1), minor and patch can be any", function () {
        it("1.2.3 => 2.0.0", async () => {
            // Setup
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: ""
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);
            // Check
            const newVersion = {
                version: { major: 2n, minor: 0n, patch: 0n },
                alternative: ""
            };
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });

        it("1.2.3 => 2.5.7", async () => {
            // Setup
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: ""
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);

            const newVersion = {
                version: { major: 2n, minor: 5n, patch: 7n },
                alternative: ""
            };
            // Check
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });

        it("1.9.15 => 2.0.1", async () => {
            // Setup
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 9n, patch: 15n },
                alternative: ""
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);

            const newVersion = {
                version: { major: 2n, minor: 0n, patch: 1n },
                alternative: ""
            };
            // Check
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });
    });

    describe("Alternative string can change with valid version update", function () {
        it("1.2.3-alpha => 1.3.0-beta", async () => {
            // Setup
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: "-alpha"
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);
            // Check
            const newVersion = {
                version: { major: 1n, minor: 3n, patch: 0n },
                alternative: "-beta"
            };
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });

        it("1.2.3-alpha => 1.3.0-beta", async () => {
            // Setup
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: "-rc1"
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);
            // Check
            const newVersion = {
                version: { major: 2n, minor: 0n, patch: 0n },
                alternative: "-stable"
            };
            await cometFactoryV2.setVersion(newVersion);
            const result = await cometFactoryV2.version();
            expect(result.version.major).to.equal(newVersion.version.major);
            expect(result.version.minor).to.equal(newVersion.version.minor);
            expect(result.version.patch).to.equal(newVersion.version.patch);
            expect(result.alternative).to.equal(newVersion.alternative);
        });
    });

    describe("Revert cases", function () {
        it("Can't set the exact same version 1.2.3 => 1.2.3", async () => {
            // Setup
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: ""
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);
            // Check
            const newVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: ""
            };
            await expect(cometFactoryV2.setVersion(newVersion)).revertedWithCustomError(cometFactoryV2, "SameVersion");
        });

        it("Can't set the exact same version with different alternative 1.2.3-alpha => 1.2.3-beta", async () => {
            // Setup
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: "-alpha"
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);
            // Check
            const newVersion = {
                version: { major: 1n, minor: 2n, patch: 3n },
                alternative: "-beta"
            };
            await expect(cometFactoryV2.setVersion(newVersion)).revertedWithCustomError(cometFactoryV2, "SameVersion");
        });

        describe("Same major, minor decrease", function () {
            const fixture2 = async () => {
                const { timelock, bytecodeProviderMock } = await restore();
                const initialVersion = {
                    version: { major: 1n, minor: 5n, patch: 3n },
                    alternative: ""
                };
                const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                    .connect(timelock)
                    .deploy(initialVersion, bytecodeProviderMock, timelock);
                return cometFactoryV2;
            };

            it("1.5.3 => 1.4.9", async () => {
                const cometFactoryV2 = await loadFixture(fixture2);
                const newVersion = {
                    version: { major: 1n, minor: 4n, patch: 9n },
                    alternative: ""
                };
                await expect(cometFactoryV2.setVersion(newVersion)).revertedWithCustomError(
                    cometFactoryV2,
                    "InvalidMinorVersion"
                );
            });

            it("1.5.3 => 1.2.0", async () => {
                const cometFactoryV2 = await loadFixture(fixture2);
                const newVersion = {
                    version: { major: 1n, minor: 2n, patch: 0n },
                    alternative: ""
                };
                await expect(cometFactoryV2.setVersion(newVersion)).revertedWithCustomError(
                    cometFactoryV2,
                    "InvalidMinorVersion"
                );
            });
        });

        describe("Major version skips (not +1)", function () {
            const fixture2 = async () => {
                const { timelock, bytecodeProviderMock } = await restore();
                const initialVersion = {
                    version: { major: 1n, minor: 2n, patch: 3n },
                    alternative: ""
                };
                const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                    .connect(timelock)
                    .deploy(initialVersion, bytecodeProviderMock, timelock);
                return cometFactoryV2;
            };

            it("1.2.3 => 3.0.0", async () => {
                const cometFactoryV2 = await loadFixture(fixture2);
                const newVersion = {
                    version: { major: 3n, minor: 0n, patch: 0n },
                    alternative: ""
                };
                await expect(cometFactoryV2.setVersion(newVersion)).revertedWithCustomError(
                    cometFactoryV2,
                    "OnlyIterativeUpdate"
                );
            });

            it("1.2.3 => 5.1.2", async () => {
                const cometFactoryV2 = await loadFixture(fixture2);
                const newVersion = {
                    version: { major: 5n, minor: 1n, patch: 2n },
                    alternative: ""
                };
                await expect(cometFactoryV2.setVersion(newVersion)).revertedWithCustomError(
                    cometFactoryV2,
                    "OnlyIterativeUpdate"
                );
            });
        });

        it("Should not let decrease major version 2.5.3 => 1.9.9", async () => {
            // Setup
            const { timelock, bytecodeProviderMock } = await restore();
            const initialVersion = {
                version: { major: 2n, minor: 5n, patch: 3n },
                alternative: ""
            };
            const cometFactoryV2 = await (await ethers.getContractFactory("CometFactoryV2"))
                .connect(timelock)
                .deploy(initialVersion, bytecodeProviderMock, timelock);
            // Check
            const newVersion = {
                version: { major: 1n, minor: 9n, patch: 9n },
                alternative: ""
            };
            await expect(cometFactoryV2.setVersion(newVersion)).revertedWithCustomError(
                cometFactoryV2,
                "OnlyIterativeUpdate"
            );
        });
    });
});
