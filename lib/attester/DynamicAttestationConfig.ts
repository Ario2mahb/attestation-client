import { ChainType } from "flare-mcc";
import { AttLogger, getGlobalLogger } from "../utils/logger";
import { JSONMapParser } from "../utils/utils";
import { AttestationType } from "../verification/attestation-types";
import { AttestationRoundManager } from "./AttestationRoundManager";
import { AttesterClientConfiguration } from "./AttesterClientConfiguration";

const fs = require("fs");

export enum Source {
  // from ChainType (must match)
  invalid = -1,
  BTC = 0,
  LTC = 1,
  DOGE = 2,
  XRP = 3,
  ALGO = 4,

  // ... make sure IDs are the same as in Flare node
  TEST1,
  TEST2,
}

export class SourceHandlerConfig {
  attestationType!: AttestationType;
  source!: Source;

  maxCallsPerRound!: number;

  avgCalls!: number;

  requiredBlocks: number = 1;

  getId(): number {
    return ((this.attestationType as number) << 16) + (this.source as number);
  }
}

export class AttestationConfig {
  startEpoch!: number;

  sourceHandlers = new Map<number, SourceHandlerConfig>();
}

export class AttestationConfigManager {
  config: AttesterClientConfiguration;
  logger: AttLogger;

  attestationConfig = new Array<AttestationConfig>();

  constructor(config: AttesterClientConfiguration, logger: AttLogger) {
    this.config = config;
    this.logger = logger;

    this.validateEnumNames();
  }

  validateEnumNames() {
    const logger = getGlobalLogger();

    for (let value in ChainType) {
      if (typeof ChainType[value] === "number") {
        if (ChainType[value] !== Source[value]) {
          logger.error2(
            `ChainType and Source value mismatch ChainType.${ChainType[ChainType[value] as any]}=${ChainType[value]}, Source.${Source[Source[value] as any]}=${
              Source[value]
            }`
          );
        }

        if (ChainType[ChainType[value] as any] !== Source[Source[value] as any]) {
          logger.error2(
            `ChainType and Source key mismatch ChainType.${ChainType[ChainType[value] as any]}=${ChainType[value]}, Source.${Source[Source[value] as any]}=${
              Source[value]
            }`
          );
        }
      }
    }
  }

  async initialize() {
    await this.loadAll();

    this.dynamicLoadInitialize();
  }

  dynamicLoadInitialize() {
    fs.watch(this.config.dynamicAttestationConfigurationFolder, (event: string, filename: string) => {
      if (filename && event === "rename") {
        // todo: check why on the fly report JSON error
        this.logger.debug(`DAC directory watch '${filename}' (event ${event})`);
        if (this.load(this.config.dynamicAttestationConfigurationFolder + filename)) {
          this.orderConfigurations();
        }
      }
    });
  }

  async loadAll() {
    try {
      await fs.readdir(this.config.dynamicAttestationConfigurationFolder, (err: number, files: string[]) => {
        if (files) {
          files.forEach((filename) => {
            this.load(this.config.dynamicAttestationConfigurationFolder + filename);
          });
          this.orderConfigurations();
        } else {
          this.logger.warning(`DAC: no configuration files`);
        }
      });
    } catch (error) {
      this.logger.exception(`error: ${error}`);
    }
  }

  load(filename: string, disregardObsolete: boolean = false): boolean {
    this.logger.info(`^GDAC load '${filename}'`);

    const fileConfig = JSON.parse(fs.readFileSync(filename), JSONMapParser);

    // check if loading current epoch (or next one)
    if (fileConfig.startEpoch == AttestationRoundManager.activeEpochId || fileConfig.startEpoch == AttestationRoundManager.activeEpochId + 1) {
      this.logger.warning(`DAC almost alive (epoch ${fileConfig.startEpoch})`);
    }

    // convert from file structure
    const config = new AttestationConfig();
    config.startEpoch = fileConfig.startEpoch;

    fileConfig.sources.forEach((source: { attestationTypes: any[]; source: number; requiredBlocks: number; maxCallsPerRound: number }) => {
      source.attestationTypes.forEach((attestationType) => {
        const sourceHandler = new SourceHandlerConfig();

        sourceHandler.attestationType = (<any>AttestationType)[attestationType.type] as AttestationType;
        sourceHandler.source = (<any>Source)[source.source] as Source;

        sourceHandler.maxCallsPerRound = source.maxCallsPerRound;
        sourceHandler.requiredBlocks = source.requiredBlocks;

        sourceHandler.avgCalls = attestationType.avgCalls;

        config.sourceHandlers.set(sourceHandler.getId(), sourceHandler);
      });
    });

    this.attestationConfig.push(config);

    return true;
  }

  orderConfigurations() {
    this.attestationConfig.sort((a: AttestationConfig, b: AttestationConfig) => {
      if (a.startEpoch < b.startEpoch) return 1;
      if (a.startEpoch > b.startEpoch) return -1;
      return 0;
    });

    // cleanup
    for (let a = 1; a < this.attestationConfig.length; a++) {
      if (this.attestationConfig[a].startEpoch < AttestationRoundManager.activeEpochId) {
        this.logger.debug(`DAC cleanup #${a} (epoch ${this.attestationConfig[a].startEpoch})`);
        this.attestationConfig.slice(a);
        return;
      }
    }
  }

  getSourceHandlerConfig(source: number, epoch: number): SourceHandlerConfig {
    // configs must be ordered by decreasing epoch number
    for (let a = 0; a < this.attestationConfig.length; a++) {
      if (this.attestationConfig[a].startEpoch < epoch) {
        return this.attestationConfig[a].sourceHandlers.get(source)!;
      }
    }

    this.logger.error(`DAC for source ${source} epoch ${epoch} does not exist (using default)`);

    return new SourceHandlerConfig();
  }
}
