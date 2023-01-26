import * as fs from "fs";
import Web3 from "web3";
import BN from "bn.js";
const { promisify } = require('util');
import { AttesterClient } from "../../../src/attester/AttesterClient";
import { AttestationClientConfig } from "../../../src/attester/AttestationClientConfig";
import { readSecureConfig } from "../../../src/utils/configSecure";
import { getWeb3, relativeContractABIPathForContractName } from "../../../src/utils/utils";
import { BitVoting } from "../../../typechain-web3-v1/BitVoting";
import { StateConnectorTempTran } from "../../../typechain-web3-v1/StateConnectorTempTran";
import { readJSONfromFile } from "../../../src/utils/json";
import { AttLogger, getGlobalLogger } from "../../../src/utils/logger";
import { INestApplication } from "@nestjs/common";
import { ServerConfigurationService } from "../../../src/servers/web-server/src/services/server-configuration.service";
import { WebServerModule } from "../../../src/servers/web-server/src/web-server.module";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import { EntityManager } from "typeorm";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";

// CONFIG_PATH should be set correctly
export async function bootstrapAttestationClient(n: number): Promise<AttesterClient> {
   process.env.TEST_CREDENTIALS = "1";
   // Reading configuration
   const config = await readSecureConfig(new AttestationClientConfig(), `attester_${n}`);

   // Create and start Attester Client
   return new AttesterClient(config);
   // await attesterClient.runAttesterClient();
}

export async function deployTestContracts(web3Rpc: string = "http://127.0.0.1:8545", accountPrivateKey = "0xc5e8f61d1ab959b397eecc0a37a6517b8e67a0e7cf1f4bce5591f3ed80199122", verbose = false) {
   const web3 = getWeb3(web3Rpc);
   const artifacts = "artifacts";
   let abiPathStateConnector = await relativeContractABIPathForContractName("StateConnectorTempTran", artifacts);
   let abiPathBitVoting = await relativeContractABIPathForContractName("BitVoting", artifacts);
   let stateConnectorABI = JSON.parse(fs.readFileSync(`${artifacts}/${abiPathStateConnector}`).toString());
   let bitVotingABI = JSON.parse(fs.readFileSync(`${artifacts}/${abiPathBitVoting}`).toString());
   let stateConnector = new web3.eth.Contract(stateConnectorABI.abi) as any as StateConnectorTempTran;
   let bitVoting = new web3.eth.Contract(bitVotingABI.abi) as any as BitVoting;
   const wallet = web3.eth.accounts.privateKeyToAccount(accountPrivateKey);
   let nonce = await web3.eth.getTransactionCount(wallet.address);
   let chainId = await web3.eth.getChainId();

   const stateConnectorData = stateConnector
      .deploy({
         data: stateConnectorABI.bytecode,
         arguments: [wallet.address],
      })
      .encodeABI();

   const bitVotingData = bitVoting
      .deploy({
         data: bitVotingABI.bytecode
      })
      .encodeABI();

   const txStateConnector = {
      from: wallet.address,
      gas: "0x" + web3.utils.toBN(1500000).toString(16),
      gasPrice: "0x" + web3.utils.toBN("25000000000").toString(16),
      chainId,
      nonce,
      data: stateConnectorData,
   };

   const txBitVoting = {
      from: wallet.address,
      gas: "0x" + web3.utils.toBN(1500000).toString(16),
      gasPrice: "0x" + web3.utils.toBN("25000000000").toString(16),
      chainId: chainId,
      nonce: nonce + 1,
      data: bitVotingData,
   };


   try {
      const signed = await wallet.signTransaction(txStateConnector);
      const rec = await web3.eth.sendSignedTransaction(signed.rawTransaction);
      if (verbose) console.log(`${rec.contractAddress} (StateConnector)`);
   } catch (e) {
      console.log("Transaction failed.");
      console.log(e);
   }

   try {
      const signed = await wallet.signTransaction(txBitVoting);
      const rec = await web3.eth.sendSignedTransaction(signed.rawTransaction);
      if (verbose) console.log(`${rec.contractAddress} (BitVoting)`);
   } catch (e) {
      console.log("Transaction failed.");
      console.log(e);
   }

}

export async function submitAttestationRequest(stateConnector: StateConnectorTempTran, web3: Web3, wallet: any, request: string) {
   const data = stateConnector.methods.requestAttestations(request).encodeABI();
   let nonce = await web3.eth.getTransactionCount(wallet.address);
   let chainId = await web3.eth.getChainId();

   const txStateConnector = {
      from: wallet.address,
      to: stateConnector.options.address,
      gas: "0x" + web3.utils.toBN(1500000).toString(16),
      gasPrice: "0x" + web3.utils.toBN("25000000000").toString(16),
      chainId,
      nonce,
      data,
   };

   const signed = await wallet.signTransaction(txStateConnector);
   return await web3.eth.sendSignedTransaction(signed.rawTransaction);
}
// process.env.TEST_CREDENTIALS = "1"
// process.env.CONFIG_PATH = CONFIG_PATH;


export async function bootstrapAttestationWebServer(
   externalLogger?: AttLogger
): Promise<INestApplication> {
   // assumes process.env.CONFIG_PATH that is already set for attester client.
   // Do not try to change it here!

   const logger = externalLogger ?? getGlobalLogger("web");
   const module = await Test.createTestingModule({
      imports: [WebServerModule]
   }).compile();
   let app: INestApplication = module.createNestApplication();

   let configurationService: ServerConfigurationService;

   app.use(
      helmet({
         contentSecurityPolicy: false,
      })
   );
   // app.use(compression()); // Compress all routes

   app.use(cookieParser());
   app.use(bodyParser.json({ limit: "50mb" }));
   // Use body parser to read sent json payloads
   app.use(
      bodyParser.urlencoded({
         limit: "50mb",
         extended: true,
         parameterLimit: 50000,
      })
   );

   const config = new DocumentBuilder()
      .setTitle('Attestation Client Public Server')
      .setDescription('Public server for attestation client providing data about attestations by round, and attestation status metrics.')
      .setVersion('1.0')
      .build();
   const document = SwaggerModule.createDocument(app, config);
   SwaggerModule.setup('api-doc', app, document);

   await app.init();

   configurationService = app.get("SERVER_CONFIG") as ServerConfigurationService;

   let port = configurationService.serverCredentials.port;
   await app.listen(port, undefined, () =>
      // tslint:disable-next-line:no-console
      // console.log(`Server started listening at http://localhost:${ port }`)
      logger.info(`Server started listening at http://localhost:${configurationService.serverCredentials.port}`));

   return app;
}


////////////////////////////////////////////////////////////////
// Adopted from @openzepplin/test-helper
////////////////////////////////////////////////////////////////

export function advanceBlock(web3: Web3) {
   return promisify((web3.currentProvider as any).send.bind(web3.currentProvider))({
      jsonrpc: '2.0',
      method: 'evm_mine',
      id: new Date().getTime(),
   });
}

// Advance the block to the passed height
export async function advanceBlockTo(web3: Web3, target: string | number | BN) {
   if (!BN.isBN(target)) {
      target = new BN(target);
   }

   const currentBlock = (await latestBlock(web3));
   const start = Date.now();
   let notified;
   if (target.lt(currentBlock)) throw Error(`Target block #(${target}) is lower than current block #(${currentBlock})`);
   while ((await latestBlock(web3)).lt(target)) {
      if (!notified && Date.now() - start >= 5000) {
         notified = true;
         console.log(`advanceBlockTo: Advancing too many blocks is causing this test to be slow.`);
      }
      await advanceBlock(web3);
   }
}

// Returns the time of the last mined block in seconds
export async function latest(web3: Web3) {
   const block = await web3.eth.getBlock('latest');
   return new BN(block.timestamp);
}

export async function latestBlock(web3: Web3) {
   const block = await web3.eth.getBlock('latest');
   return new BN(block.number);
}

// Increases ganache time by the passed duration in seconds
async function increase(web3: Web3, duration: string | number | BN) {
   if (!BN.isBN(duration)) {
      duration = new BN(duration);
   }

   if (duration.isNeg()) throw Error(`Cannot increase time by a negative amount (${duration})`);

   await promisify((web3.currentProvider as any).send.bind(web3.currentProvider))({
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [duration.toNumber()],
      id: new Date().getTime(),
   });

   await advanceBlock(web3);
}

/**
 * Beware that due to the need of calling two separate ganache methods and rpc calls overhead
 * it's hard to increase time precisely to a target point so design your test to tolerate
 * small fluctuations from time to time.
 *
 * @param target time in seconds
 */
export async function increaseTo(web3: Web3, target: string | number | BN) {
   if (!BN.isBN(target)) {
      target = new BN(target);
   }

   const now = (await latest(web3));

   if (target.lt(now)) throw Error(`Cannot increase current time (${now}) to a moment in the past (${target})`);
   const diff = target.sub(now);
   return increase(web3, diff);
}

//////////////////////////////////////////
// Mining type control
//////////////////////////////////////////

export async function setIntervalMining(web3: Web3, interval: number = 1000) {
   await promisify((web3.currentProvider as any).send.bind(web3.currentProvider))({
      jsonrpc: '2.0',
      method: 'evm_setAutomine',
      params: [false],
      id: new Date().getTime(),
   });

   await promisify((web3.currentProvider as any).send.bind(web3.currentProvider))({
      jsonrpc: '2.0',
      method: 'evm_setIntervalMining',
      params: [interval],
      id: new Date().getTime(),
   });
}




//////////////////////////////////////////
// Misc
//////////////////////////////////////////

export async function getVoterAddresses(n = 9) {
   let voters = [];
   if (n < 1 || n > 9 || n !== Math.floor(n)) {
      throw new Error(`Value of 'n' should be between 1 and 9, integer`);
   }
   const web3 = new Web3();
   for (let i = 0; i < n; i++) {
      // console.log("XXX", fs.readFileSync(`./test/attestationClient/test-data/attester/attester_${i}-config.json`).toString())
      let json = readJSONfromFile<any>(`./test/attestationClient/test-data/attester/attester_${i}-config.json`);
      let account = web3.eth.accounts.privateKeyToAccount(json.web.accountPrivateKey);
      voters.push(account.address);
   }
   return voters;
}


export async function startSimpleSpammer(
   stateConnector: StateConnectorTempTran,
   web3: Web3,
   spammerWallet: any,
   bufferWindowDurationSec: number,
   requests: string[],
   frequencies: number[]
) {

   for (let request of requests) {
      await submitAttestationRequest(stateConnector, web3, spammerWallet, request);
   }

   let counter = 0;
   setInterval(async () => {
      for (let [index, request] of requests.entries()) {
         let mod = frequencies[index] ?? 1;
         if (counter % mod == 0) {
            await submitAttestationRequest(stateConnector, web3, spammerWallet, request);
         }
      }
      counter++;
   }, bufferWindowDurationSec * 1000);
}

export async function assignAttestationProvider(stateConnector: StateConnectorTempTran, web3: Web3, wallet: any, assignTo?: string) {
   const data = stateConnector.methods.updateAttestorAddressMapping(assignTo ?? wallet.address).encodeABI();
   let nonce = await web3.eth.getTransactionCount(wallet.address);
   let chainId = await web3.eth.getChainId();

   const txStateConnector = {
      from: wallet.address,
      to: stateConnector.options.address,
      gas: "0x" + web3.utils.toBN(1500000).toString(16),
      gasPrice: "0x" + web3.utils.toBN("25000000000").toString(16),
      chainId,
      nonce,
      data,
   };

   const signed = await wallet.signTransaction(txStateConnector);
   return await web3.eth.sendSignedTransaction(signed.rawTransaction);

}

export async function selfAssignAttestationProviders(logger: AttLogger, stateConnector: StateConnectorTempTran, web3: Web3, privateKeys: string[]) {
   let promises = [];
   let wallets = [];
   for (let privateKey of privateKeys) {
      const wallet = web3.eth.accounts.privateKeyToAccount(privateKey);
      wallets.push(wallet);
      promises.push(assignAttestationProvider(stateConnector, web3, wallet));
   }
   await Promise.all(promises);
   logger.info(`Active voters:`)
   for (let wallet of wallets) {
      logger.info(`${wallet.address} -> ${await stateConnector.methods.attestorAddressMapping(wallet.address).call()}`)
   }
}


export function assertAddressesMatchPrivateKeys(web3: Web3, addresses: string[], privateKeys: string[]) {
   if (addresses.length != privateKeys.length) {
      throw new Error("Lengths do not match");
   }
   for (let [index, address] of addresses.entries()) {
      const wallet = web3.eth.accounts.privateKeyToAccount(privateKeys[index]);
      if (wallet.address.toLowerCase() !== address.toLowerCase()) {
         throw new Error(`Matching error at index ${index}: ${wallet.address} !== ${address}`);
      }
   }
}
