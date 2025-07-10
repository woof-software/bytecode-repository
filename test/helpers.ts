import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { network } from "hardhat";

interface EIP712Domain {
    fields: string;
    name: string;
    version: string;
    chainId: bigint;
    verifyingContract: string;
    salt: string;
    extensions: string[]; // or BytesLike[] if using from ethers
}

interface Developers {
    keyDeveloper: HardhatEthersSigner;
    subDevelopers: HardhatEthersSigner[];
    contractTypes: string[];
}

function domainResultToPlainObject(result: EIP712Domain) {
    return {
        fields: result.fields,
        name: result.name,
        version: result.version,
        chainId: result.chainId,
        verifyingContract: result.verifyingContract,
        salt: result.salt,
        extensions: result.extensions
    };
}

async function prepareAuditReportSignature(
    bytecodeHash: string,
    auditReport: string,
    verifyingContract: string,
    auditor: HardhatEthersSigner
): Promise<string> {
    const domain = {
        name: "VersionController",
        version: "1",
        chainId: network.config.chainId,
        verifyingContract
    };
    const auditReportType = {
        AuditReport: [
            { name: "bytecodeHash", type: "bytes32" },
            { name: "auditReport", type: "string" }
        ]
    };
    const auditReportValues = { bytecodeHash, auditReport };
    return auditor.signTypedData(domain, auditReportType, auditReportValues);
}

export { EIP712Domain, Developers, domainResultToPlainObject, prepareAuditReportSignature };
