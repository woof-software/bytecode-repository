/**
 * Initial Bytecodes Configuration
 *
 * Defines the bytecodes to upload to VersionController as initial releases (v1.0.0)
 * after the first deployment of the BytecodeRepository system.
 *
 * Each entry specifies a contract type and how to load its bytecode:
 * - `artifactName`: loads from Hardhat compilation output (for contracts in this repo)
 * - `bytecodeFile`: loads from an external file (Hardhat/Foundry artifact JSON, custom JSON, or raw hex)
 * - `jsonKey`: optional key to extract from a JSON file (used with `bytecodeFile`)
 *
 * Source URLs should point to the exact source code that produced the bytecode.
 *
 * To add a new entry, append to the INITIAL_BYTECODES array below.
 */

const REPO_BASE_URL = "https://github.com/woof-software/bytecode-repository/blob/main";

export interface InitialBytecodeEntry {
    /** Human-readable contract type name (max 31 chars, encoded to bytes32 on-chain) */
    contractType: string;
    /** Hardhat artifact name — bytecode is loaded via hre.artifacts.readArtifact(). Mutually exclusive with bytecodeFile. */
    artifactName?: string;
    /** Path to a bytecode file (Hardhat/Foundry artifact JSON, custom JSON, or raw .hex/.bin). Mutually exclusive with artifactName. */
    bytecodeFile?: string;
    /** Key to extract bytecode from a JSON file. Only used with bytecodeFile. */
    jsonKey?: string;
    /** URL to the source code repository / file that produced this bytecode */
    sourceURL: string;
}

/**
 * Initial bytecodes to upload after deployment.
 *
 * Core contracts use `artifactName` to load bytecode from this repo's compiled artifacts.
 * External contracts use `bytecodeFile` to load from a file path (relative to project root).
 */
export const INITIAL_BYTECODES: InitialBytecodeEntry[] = [
    // ── Core BytecodeRepository contracts (compiled from this repo) ──────────

    {
        contractType: "VersionController",
        artifactName: "VersionController",
        sourceURL: `${REPO_BASE_URL}/contracts/VersionController.sol`
    },
    {
        contractType: "L1DeployManager",
        artifactName: "L1DeployManager",
        sourceURL: `${REPO_BASE_URL}/contracts/L1DeployManager.sol`
    },
    {
        contractType: "L2DeployManager",
        artifactName: "L2DeployManager",
        sourceURL: `${REPO_BASE_URL}/contracts/L2DeployManager.sol`
    },
    {
        contractType: "CometFactoryV2",
        artifactName: "CometFactoryV2",
        sourceURL: `${REPO_BASE_URL}/contracts/factories/CometFactoryV2.sol`
    },
    {
        contractType: "CometWithAssetList",
        bytecodeFile: "bytecodes/CometWithExtendedAssetList.json",
        sourceURL: "https://github.com/woof-software/comet/blob/main/contracts/CometWithExtendedAssetList.sol"
    },
    {
        contractType: "CometExtWithAssetList",
        bytecodeFile: "bytecodes/CometExtAssetList.json",
        sourceURL: "https://github.com/woof-software/comet/blob/main/contracts/CometExtAssetList.sol"
    }

    // ── External contracts (loaded from bytecode files) ─────────────────────
    //
    // To add an external bytecode, place the artifact or hex file in the project
    // (e.g., under bytecodes/) and add an entry here:
    //
    // {
    //     contractType: "CometWithAssetList",
    //     bytecodeFile: "bytecodes/CometWithAssetList.json",
    //     sourceURL: "https://github.com/compound-finance/comet/blob/main/contracts/Comet.sol"
    // },
    //
    // For custom JSON files where bytecode is not in a standard field:
    //
    // {
    //     contractType: "Streamer",
    //     bytecodeFile: "bytecodes/custom-output.json",
    //     jsonKey: "StreamerInitCode",
    //     sourceURL: "https://github.com/example/streamer/blob/main/contracts/Streamer.sol"
    // },
];
