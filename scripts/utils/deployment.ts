import hre from "hardhat";
import { ethers, upgrades } from "hardhat";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { Contract, BaseContract, ContractTransactionReceipt } from "ethers";

/**
 * Deployment utilities following OpenZeppelin and Hardhat best practices
 *
 * Features:
 * - Automatic network detection and directory structure
 * - Compatible with hardhat-deploy format
 * - Stores deployment artifacts and metadata
 * - Supports upgradeable and non-upgradeable contracts
 * - Provides deployment verification and loading
 */

export interface DeploymentArtifact {
    address: string;
    abi: any[];
    transactionHash: string;
    receipt: any;
    args: any[];
    numDeployments: number;
    solcInputHash: string;
    metadata: string;
    bytecode: string;
    deployedBytecode: string;
    libraries: Record<string, string>;
    facets: any[];
    storageLayout?: any;
    implementationAddress?: string; // For upgradeable contracts
    adminAddress?: string; // For transparent proxies
}

export interface NetworkDeployments {
    name: string;
    chainId: number;
    contracts: Record<string, DeploymentArtifact>;
    deploymentBlock?: number;
    timestamp: string;
}

/**
 * Resolve the `deployments/<dir>/` directory label to read from or write to.
 *
 * Deployment artifacts live in `deployments/<network>/` by default. Setting the `DEPLOYMENT_LABEL`
 * environment variable appends a suffix, isolating a stack in its own directory — e.g.
 * `DEPLOYMENT_LABEL=light` on network `ethereum` resolves to `ethereum-light`. This lets a test
 * stack (see scripts/deployLight.ts) be deployed and then read by upload/config scripts without
 * touching the production `deployments/<network>/` records.
 *
 * @param networkName - Base network name (e.g. from `ethers.provider.getNetwork().name`).
 * @param defaultLabel - Fallback label when `DEPLOYMENT_LABEL` is unset (e.g. "light" for deployLight).
 * @returns The directory name under `deployments/` to use.
 */
export function resolveDeploymentDir(networkName: string, defaultLabel = ""): string {
    const label = (process.env.DEPLOYMENT_LABEL ?? defaultLabel).trim();
    return label ? `${networkName}-${label}` : networkName;
}

export class DeploymentManager {
    private networkName: string;
    private chainId: number;
    private deploymentsDir: string;
    private networkDir: string;

    constructor(networkName: string, chainId: number) {
        this.networkName = networkName;
        this.chainId = chainId;
        this.deploymentsDir = join(process.cwd(), "deployments");
        this.networkDir = join(this.deploymentsDir, networkName);

        // Ensure directories exist
        this.ensureDirectoriesExist();
    }

    private ensureDirectoriesExist() {
        mkdirSync(this.deploymentsDir, { recursive: true });
        mkdirSync(this.networkDir, { recursive: true });

        // Create .chainId file for hardhat-deploy compatibility
        const chainIdFile = join(this.networkDir, ".chainId");
        if (!existsSync(chainIdFile)) {
            writeFileSync(chainIdFile, this.chainId.toString());
        }
    }

    /**
     * Save deployment artifact for a contract
     */
    async saveDeployment(
        contractName: string,
        contract: BaseContract,
        deploymentTx: any,
        constructorArgs: any[] = [],
        isUpgradeable: boolean = false
    ): Promise<void> {
        const address = await contract.getAddress();
        const receipt: ContractTransactionReceipt = await deploymentTx.wait();

        // Get contract artifact for ABI and bytecode using Hardhat Runtime Environment
        const contractArtifact = await hre.artifacts.readArtifact(contractName);

        let implementationAddress: string | undefined;
        let adminAddress: string | undefined;

        if (isUpgradeable) {
            // Get implementation address for upgradeable contracts
            try {
                implementationAddress = await upgrades.erc1967.getImplementationAddress(address);
                // Try to get admin address (for transparent proxies)
                try {
                    adminAddress = await upgrades.erc1967.getAdminAddress(address);
                } catch {
                    // UUPS proxies don't have admin address
                }
            } catch (error) {
                console.warn(`Warning: Could not get implementation address for ${contractName}:`, error);
            }
        }

        const deploymentArtifact: DeploymentArtifact = {
            address,
            abi: contractArtifact.abi,
            transactionHash: receipt.hash,
            receipt: {
                blockHash: receipt.blockHash,
                blockNumber: receipt.blockNumber,
                contractAddress: receipt.contractAddress || address,
                cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
                from: receipt.from,
                gasUsed: receipt.gasUsed.toString(),
                to: receipt.to || null,
                transactionHash: receipt.hash,
                transactionIndex: receipt.index,
                logs: receipt.logs,
                status: receipt.status
            },
            args: this.serializeBigInts(constructorArgs),
            numDeployments: 1,
            solcInputHash: this.getSolcInputHash(contractArtifact),
            metadata: JSON.stringify({
                deployedAt: new Date().toISOString(),
                network: this.networkName,
                chainId: this.chainId,
                isUpgradeable,
                compiler: {
                    version: contractArtifact.metadata?.compiler?.version || "unknown"
                }
            }),
            bytecode: contractArtifact.bytecode,
            deployedBytecode: contractArtifact.deployedBytecode,
            libraries: {},
            facets: [],
            implementationAddress,
            adminAddress
        };

        // Save to individual contract file
        const contractFile = join(this.networkDir, `${contractName}.json`);
        writeFileSync(contractFile, JSON.stringify(deploymentArtifact, null, 2));

        console.log(`   💾 Saved deployment artifact: ${contractFile}`);
    }

    /**
     * Load deployment for a contract
     */
    loadDeployment(contractName: string): DeploymentArtifact | null {
        const contractFile = join(this.networkDir, `${contractName}.json`);

        if (!existsSync(contractFile)) {
            return null;
        }

        try {
            const content = readFileSync(contractFile, "utf8");
            return JSON.parse(content) as DeploymentArtifact;
        } catch (error) {
            console.error(`Error loading deployment for ${contractName}:`, error);
            return null;
        }
    }

    /**
     * Get contract instance from deployment
     */
    async getContract(contractName: string): Promise<Contract | null> {
        const deployment = this.loadDeployment(contractName);
        if (!deployment) {
            return null;
        }

        return ethers.getContractAt(deployment.abi, deployment.address);
    }

    /**
     * Check if contract is deployed
     */
    isDeployed(contractName: string): boolean {
        return this.loadDeployment(contractName) !== null;
    }

    /**
     * Save network-wide deployment summary
     */
    saveNetworkSummary(deployedContracts: Record<string, string>): void {
        const networkDeployment: NetworkDeployments = {
            name: this.networkName,
            chainId: this.chainId,
            contracts: {},
            timestamp: new Date().toISOString()
        };

        // Load all contract deployments
        for (const contractName of Object.keys(deployedContracts)) {
            const deployment = this.loadDeployment(contractName);
            if (deployment) {
                networkDeployment.contracts[contractName] = deployment;
            }
        }

        // Save network summary
        const summaryFile = join(this.networkDir, "deployments.json");
        writeFileSync(summaryFile, JSON.stringify(networkDeployment, null, 2));

        console.log(`   💾 Saved network summary: ${summaryFile}`);
    }

    /**
     * Generate deployment report
     */
    generateReport(): void {
        const deployments = this.getAllDeployments();

        console.log("\n📊 DEPLOYMENT REPORT");
        console.log("═".repeat(60));
        console.log(`Network: ${this.networkName} (Chain ID: ${this.chainId})`);
        console.log(`Total contracts: ${Object.keys(deployments).length}`);
        console.log("");

        for (const [contractName, deployment] of Object.entries(deployments)) {
            console.log(`📋 ${contractName}:`);
            console.log(`   Address: ${deployment.address}`);

            if (deployment.implementationAddress) {
                console.log(`   Implementation: ${deployment.implementationAddress}`);
            }

            if (deployment.adminAddress) {
                console.log(`   Admin: ${deployment.adminAddress}`);
            }

            const metadata = JSON.parse(deployment.metadata);
            console.log(`   Deployed: ${metadata.deployedAt}`);
            console.log(`   Upgradeable: ${metadata.isUpgradeable ? "Yes" : "No"}`);
            console.log(`   Gas Used: ${deployment.receipt.gasUsed}`);
            console.log("");
        }
    }

    /**
     * Get all deployments for the network
     */
    getAllDeployments(): Record<string, DeploymentArtifact> {
        const deployments: Record<string, DeploymentArtifact> = {};

        try {
            const files = require("fs").readdirSync(this.networkDir);

            for (const file of files) {
                if (file.endsWith(".json") && file !== "deployments.json") {
                    const contractName = file.replace(".json", "");
                    const deployment = this.loadDeployment(contractName);
                    if (deployment) {
                        deployments[contractName] = deployment;
                    }
                }
            }
        } catch (error) {
            console.warn("Warning: Could not read deployments directory:", error);
        }

        return deployments;
    }

    /**
     * Verify deployment on Etherscan
     */
    async verifyContract(contractName: string): Promise<void> {
        const deployment = this.loadDeployment(contractName);
        if (!deployment) {
            throw new Error(`Deployment not found for ${contractName}`);
        }

        try {
            await hre.run("verify:verify", {
                address: deployment.address,
                constructorArguments: deployment.args
            });

            console.log(`✅ Verified ${contractName} on Etherscan`);
        } catch (error) {
            console.error(`❌ Verification failed for ${contractName}:`, error);
        }
    }

    private getSolcInputHash(artifact: any): string {
        // Generate a hash from the solc input for reproducible builds
        // In a real implementation, this would be the hash of the solc input JSON
        try {
            const crypto = require("crypto");
            const input = JSON.stringify(artifact.metadata || {});
            return crypto.createHash("sha256").update(input).digest("hex");
        } catch {
            return "unknown";
        }
    }

    /**
     * Recursively serialize BigInt values to strings for JSON compatibility
     */
    private serializeBigInts(obj: any): any {
        if (obj === null || obj === undefined) {
            return obj;
        }

        if (typeof obj === "bigint") {
            return obj.toString();
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this.serializeBigInts(item));
        }

        if (typeof obj === "object") {
            const serialized: any = {};
            for (const [key, value] of Object.entries(obj)) {
                serialized[key] = this.serializeBigInts(value);
            }
            return serialized;
        }

        return obj;
    }

    /**
     * Create deployment manager instance from current network.
     * Honors the DEPLOYMENT_LABEL env var (see {@link resolveDeploymentDir}).
     */
    static async create(): Promise<DeploymentManager> {
        const network = await ethers.provider.getNetwork();
        return new DeploymentManager(resolveDeploymentDir(network.name), Number(network.chainId));
    }
}

/**
 * Utility function to wait for confirmations with progress
 */
export async function waitForConfirmations(
    tx: any,
    confirmations: number = 1,
    contractName: string = "Contract"
): Promise<any> {
    console.log(`   ⏳ Waiting for ${confirmations} confirmation(s) for ${contractName}...`);

    const receipt = await tx.wait(confirmations);

    console.log(`   ✅ ${contractName} confirmed in block ${receipt.blockNumber}`);
    console.log(`   ⛽ Gas used: ${receipt.gasUsed.toString()}`);

    return receipt;
}

/**
 * Utility function to display deployment progress
 */
export function logDeploymentStep(step: number, total: number, message: string): void {
    const progress = `${step}/${total}`;
    const emoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"][step - 1] || "📋";
    console.log(`${emoji} [${progress}] ${message}`);
}
