import { ChainType, MCC, toBN } from "flare-mcc";
import { ChainManager } from "../chain/ChainManager";
import { ChainNode } from "../chain/ChainNode";
import { DotEnvExt } from "../utils/DotEnvExt";
import { fetchSecret } from "../utils/GoogleSecret";
import { AttLogger, getGlobalLogger as getGlobalLogger } from "../utils/logger";
import { getRandom, getUnixEpochTimestamp, sleepms } from "../utils/utils";
import { Web3BlockCollector } from "../utils/Web3BlockCollector";
import { AttestationType } from "../verification/generated/attestation-types-enum";
import { AttestationData } from "./AttestationData";
import { AttestationRoundManager } from "./AttestationRoundManager";
import { AttesterClientConfiguration } from "./AttesterClientConfiguration";
import { AttesterWeb3 } from "./AttesterWeb3";
import { Source } from "./DynamicAttestationConfig";

export class AttesterClient {
  conf: AttesterClientConfiguration;
  logger: AttLogger;
  roundMng: AttestationRoundManager;
  attesterWeb3: AttesterWeb3;
  chainManager: ChainManager;
  blockCollector!: Web3BlockCollector;

  constructor(configuration: AttesterClientConfiguration, logger?: AttLogger) {
    if (logger) {
      this.logger = logger;
    } else {
      this.logger = getGlobalLogger();
    }
    this.conf = configuration;
    this.chainManager = new ChainManager(this.logger);
    this.attesterWeb3 = new AttesterWeb3(this.logger, this.conf);
    this.roundMng = new AttestationRoundManager(this.chainManager, this.conf, this.logger, this.attesterWeb3);
  }

  async start() {
    const version = "1000";

    this.logger.title(`starting Flare Attester Client v${version}`);

    // create state connector
    await this.attesterWeb3.initialize();

    // process configuration
    await this.initializeConfiguration();

    await this.roundMng.initialize();

    // initialize time and local time difference
    //const sync = await getInternetTime();
    //this.logger.info(`internet time sync ${sync}ms`);

    // validate configuration chains and create nodes
    await this.initializeChains();

    if( this.conf.simulation ) {
      this.startSimulation();
    }

    // connect to network block callback
    this.blockCollector = new Web3BlockCollector(
      this.logger,
      this.conf.rpcUrl,
      this.conf.stateConnectorContractAddress,
      "StateConnector",
      undefined,
      (event: any) => {
        this.processEvent(event);
      }
    );

    //this.startDisplay();
  }

  async startSimulation(){
    while( true ){

      const attestation = new AttestationData(null);

      attestation.timeStamp = toBN( getUnixEpochTimestamp());
      attestation.request = (await getRandom()).toString();
      
      attestation.type = AttestationType.Payment;
      attestation.source = ChainType.BTC;
  
      // for sorting
      attestation.blockNumber = toBN(await getRandom());
      attestation.logIndex = await getRandom();

      this.roundMng.attestate(attestation);

      await sleepms( 5000 );
    }
  }

  async startDisplay() {
    const tty = require("tty");

    if (!tty.WriteStream.isTTY ) {
      this.logger.warning(`TTY not supported`);
    }

    while (true) {
      // display
      for (let a = 0; a < 3; a++) {
        let y = a * 4;
        tty.WriteStream.cursorTo(0, y++);
        tty.WriteStream.clearLine(0);

        console.info(`R${100}`);

        tty.WriteStream.cursorTo(0, y++);
        tty.WriteStream.clearLine(0);
        console.info(`Attestations ${100}`);

        tty.WriteStream.cursorTo(0, y++);
        tty.WriteStream.clearLine(0);
        console.info(`Done ${100}`);

        tty.WriteStream.cursorTo(0, y++);
        tty.WriteStream.clearLine(0);
        console.info(`Speed ${100}`);
      }
      await sleepms(1000);
    }
  }

  async initializeConfiguration() {
    // read .env
    DotEnvExt();

    const configData: string = "";
    let accountPrivateKey: string = "";

    this.logger.info(`configuration`);

    if (process.env.PROJECT_SECRET === undefined) {
      this.logger.info(`account read from .env`);
      accountPrivateKey = this.conf.accountPrivateKey as string;
    } else if (process.env.USE_GCP_SECRET) {
      this.logger.info(`^Raccount read from secret`);
      accountPrivateKey = (await fetchSecret(process.env.PROJECT_SECRET as string)) as string;
    } else {
      this.logger.info(`^Gaccount read from config`);
      accountPrivateKey = this.conf.accountPrivateKey as string;
    }

    this.logger.info(`network RPC URL from conf '${this.conf.rpcUrl}'`);

    if (accountPrivateKey === "" || accountPrivateKey === undefined) {
      this.logger.error(`private key not set`);
    }
  }

  async initializeChains() {
    this.logger.info("initializing chains");

    for (const chain of this.conf.chains) {
      const chainType = MCC.getChainType(chain.name);

      if (chainType === ChainType.invalid) {
        this.logger.debug(`chain '${chain.name}': undefined chain`);
        continue;
      }

      const node = new ChainNode(this.chainManager, chain.name, chainType, chain.metaData, chain);

      this.logger.info(`chain ${chain.name}:#${chainType} '${chain.url}'`);

      // validate this chain node
      if (!(await node.isHealthy())) {
        // this is just a warning since node can be inaccessible at start and will become healthy later on
        this.logger.error(`chain ${chain.name}:#${chainType} is not healthy`);
        continue;
      }

      this.chainManager.addNode(chainType, node);
    }
  }

  onlyOnce = false;

  processEvent(event: any) {
    if (event.event === "AttestationRequest") {
      const attestation = new AttestationData(event);

      this.roundMng.attestate(attestation);

      // for syntetic trafic test (will not work now because we filter out duplicates)
      // for (let a = 0; a < 150; a++) {
      //   this.attester.attestate(tx);
      //   sleepms(2);
      // }
    }
  }
}
