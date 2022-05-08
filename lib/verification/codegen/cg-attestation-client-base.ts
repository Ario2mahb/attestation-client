import fs from "fs";
import { AttestationTypeScheme, ATT_BYTES, SOURCE_ID_BYTES } from "../attestation-types/attestation-types";
import { ATTESTATION_CLIENT_BASE, DEFAULT_GEN_FILE_HEADER, SOLIDITY_CODEGEN_TAB, SOLIDITY_GEN_CONTRACTS_ROOT } from "./cg-constants";
import { constantize, indentText } from "./cg-utils";

function genConstant(definition: AttestationTypeScheme) {
   return (
      `
uint${ATT_BYTES * 8} public constant ${constantize(definition.name)} = ${definition.id};
`.trim()
   )
}

function genProofFunctions(definition: AttestationTypeScheme): any {
   return `
function prove${definition.name}(uint${SOURCE_ID_BYTES*8} _chainId, ${definition.name} calldata _data) 
    external
{
    _proofs[_hash${definition.name}(_chainId, _data)] = true;
}
`.trim()
}

// function genVerifyFunctions(definition: AttestationTypeScheme): any {
//    return `
// function verify${definition.name}(uint${CHAIN_ID_BYTES*8} _chainId, ${definition.name} calldata _data) 
//     external view override
//     returns (bool _proved)
// {
//     return _proofs[_hash${definition.name}(_chainId, _data)];
// }
// `.trim();
// }

function genVerifyFunctions(definition: AttestationTypeScheme): any {
   return `
function verify${definition.name}(uint${SOURCE_ID_BYTES*8} _chainId, ${definition.name} calldata _data) 
    external view override
    returns (bool _proved)
{
    return _verifyMerkleProof(
        _data.merkleProof,         
        merkleRootForRound(_data.stateConnectorRound),
        _hash${definition.name}(_chainId, _data)            
    );
}
`.trim();
}


function genHashFunctions(definition: AttestationTypeScheme): any {
   let paramsArr = [
      constantize(definition.name),
      '_chainId',
      ...definition.dataHashDefinition.map(item => `_data.${item.key}`),
   ];
   let encodedParams: string;
   if (paramsArr.length <= 10) {
      const paramsText = indentText(paramsArr.join(",\n"), SOLIDITY_CODEGEN_TAB * 2);
      encodedParams = `abi.encode(\n${paramsText}\n    )`;
   } else {
      // to avoid horrible "stack too deep" solidity errors, split abi.encode and then combine with bytes.concat
      const chunk = 8;
      const parts: string[] = [];
      const comment = indentText(`// split into parts of length ${chunk} to avoid 'stack too deep' errors`, SOLIDITY_CODEGEN_TAB * 2);
      for (let start = 0; start < paramsArr.length; start += chunk) {
         const partArr = paramsArr.slice(start, Math.min(start + chunk, paramsArr.length));
         const partText = indentText(partArr.join(",\n"), SOLIDITY_CODEGEN_TAB);
         parts.push(indentText(`abi.encode(\n${partText}\n)`, SOLIDITY_CODEGEN_TAB * 2));
      }
      encodedParams = `bytes.concat(\n${comment}\n${parts.join(",\n")}\n    )`;
   }
   return `
function _hash${definition.name}(uint${SOURCE_ID_BYTES*8} _chainId, ${definition.name} calldata _data) 
    private pure
    returns (bytes32)
{
    return keccak256(${encodedParams});
}
`.trim();
}

function getSolidityAttestationClientBase(definitions: AttestationTypeScheme[]) {
   let constants = definitions.map(definitions => genConstant(definitions)).join("\n")
//    let proofFunctions = definitions.map(definition => genProofFunctions(definition)).join("\n\n");
   let verifyFunctions = definitions.map(definition => genVerifyFunctions(definition)).join("\n\n");
//    let verifyFunctionsForRound = definitions.map(definition => genVerifyFunctionsForRound(definition)).join("\n\n");
   let hashFunctions = definitions.map(definition => genHashFunctions(definition)).join("\n\n");
   
   return (
      `// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "../interface/IAttestationClient.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol"; 

abstract contract AttestationClientBase is IAttestationClient {
    using MerkleProof for bytes32[];

    // possible attestationType values
${indentText(constants, SOLIDITY_CODEGEN_TAB)}

${indentText(verifyFunctions, SOLIDITY_CODEGEN_TAB)}

    function merkleRootForRound(uint256 _stateConnectorRound) public view virtual returns (bytes32 _merkleRoot);

${indentText(hashFunctions, SOLIDITY_CODEGEN_TAB)}

    function _verifyMerkleProof(
        bytes32[] memory proof,
        bytes32 merkleRoot,
        bytes32 leaf
    ) internal pure returns (bool) {
        return proof.verify(merkleRoot, leaf);
    }

}
`
   )
}

export function createSolidityAttestationClientBase(definitions: AttestationTypeScheme[]) {
   let content = `${DEFAULT_GEN_FILE_HEADER}
${getSolidityAttestationClientBase(definitions)}`
   if (!fs.existsSync(SOLIDITY_GEN_CONTRACTS_ROOT)) {
      fs.mkdirSync(SOLIDITY_GEN_CONTRACTS_ROOT, { recursive: true });
   }

   fs.writeFileSync(`${SOLIDITY_GEN_CONTRACTS_ROOT}/${ATTESTATION_CLIENT_BASE}`, content, "utf8");
}
