import { AlgoBlock, AlgoTransaction, ChainType, Managed, UtxoBlock, UtxoTransaction, XrpBlock, XrpTransaction } from "@flarenetwork/mcc";
import { LimitingProcessor } from "../../caching/LimitingProcessor";
import { DBTransactionBase } from "../../entity/indexer/dbTransaction";
import { logException } from "../../utils/logger";
import { retryMany } from "../../utils/PromiseTimeout";
import { augmentBlock } from "./augmentBlock";
import { augmentTransactionAlgo, augmentTransactionUtxo, augmentTransactionXrp } from "./augmentTransaction";
import { getFullTransactionUtxo } from "./readTransaction";
import { onSaveSig } from "./types";


export function BlockProcessor(chainType: ChainType) {
  switch (chainType) {
    case ChainType.XRP:
      return XrpBlockProcessor
    case ChainType.BTC:
    case ChainType.LTC:
      return UtxoBlockProcessor
    case ChainType.DOGE:
      return DogeBlockProcessor
    case ChainType.ALGO:
      return AlgoBlockProcessor
    default:
      return null;
  }
}

@Managed()
export class UtxoBlockProcessor extends LimitingProcessor {
  async initializeJobs(block: UtxoBlock, onSave: onSaveSig) {
    try {
      this.block = block;

      // let txPromises = block.data.tx.map((txObject) => {
      //   const getTxObject = {
      //     blockhash: block.hash,
      //     time: block.unixTimestamp,
      //     confirmations: 1, // This is the block 
      //     blocktime: block.unixTimestamp,
      //     ...txObject,
      //   };
      //   let processed = new UtxoTransaction(getTxObject);
      //   return this.call(() => getFullTransactionUtxo(this.client, processed, this)) as Promise<UtxoTransaction>;
      // });

      // const transDbPromisses = txPromises.map(processed => augmentTransactionUtxo(this.client, block, processed));


      let txPromises = block.data.tx.map((txObject) => {
        const getTxObject = {
          blockhash: block.stdBlockHash,
          time: block.unixTimestamp,
          confirmations: 1, // This is the block 
          blocktime: block.unixTimestamp,
          ...txObject,
        };
        let processed = new UtxoTransaction(getTxObject);
        return this.call(() => getFullTransactionUtxo(this.client, processed, this)) as Promise<UtxoTransaction>;
      });

      const transDbPromisses = txPromises.map((processed) => async () => { return await augmentTransactionUtxo(this.client, block, processed); });

      const transDb = await retryMany(`UtxoBlockProcessor::initializeJobs`, transDbPromisses ) as DBTransactionBase[];

      if (!transDb) {
        return;
      }

      const blockDb = await augmentBlock(block);

      this.stop();

      onSave(blockDb, transDb);
    }
    catch (error) {
      logException(error, `UtxoBlockProcessor::initializeJobs`);
    }
  }
}

@Managed()
export class DogeBlockProcessor extends LimitingProcessor {
  async initializeJobs(block: UtxoBlock, onSave: onSaveSig) {
    this.registerTopLevelJob();
    this.block = block;


    let preprocesedTxPromises = block.stdTransactionIds.map((txid: string) => {
          // the in-transactions are prepended to queue in order to process them earlier
          return (() => (this.call(() => this.client.getTransaction(txid), true)) as Promise<UtxoTransaction>);    
    });

    const awaitedTxIds = await retryMany(`DogeBlockProcessor::preprocess all transactions`, preprocesedTxPromises, this.settings.timeout, this.settings.retry) as UtxoTransaction[];

    let txPromises = awaitedTxIds.map((processed) => {
      return this.call(() => getFullTransactionUtxo(this.client, processed, this)) as Promise<UtxoTransaction>;
    });

    const transDbPromisses = txPromises.map((processed) => async () => { return await augmentTransactionUtxo(this.client, block, processed); });

    const transDb = await retryMany(`DogeBlockProcessor::initializeJobs`, transDbPromisses, this.settings.timeout, this.settings.retry) as DBTransactionBase[];

    if (!transDb) {
      return;
    }

    this.markTopLevelJobDone();

    const blockDb = await augmentBlock(block);

    this.stop();

    onSave(blockDb, transDb);
  }
}

@Managed()
export class AlgoBlockProcessor extends LimitingProcessor {
  async initializeJobs(block: AlgoBlock, onSave: onSaveSig) {
    try {
      this.block = block;
      let txPromises = block.transactions.map((algoTrans) => {
        return async () => { return await augmentTransactionAlgo(this.client, block, algoTrans); };
        // return augmentTransactionAlgo(this.client, block, processed);
      });
      const transDb = await retryMany(`AlgoBlockProcessor::initializeJobs`, txPromises, this.settings.timeout, this.settings.retry) as DBTransactionBase[];
      this.pause();
      const blockDb = await augmentBlock(block);

      onSave(blockDb, transDb);
    }
    catch (error) {
      logException(error, `AlgoBlockProcessor::initializeJobs`);
    }
  }
}

@Managed()
export class XrpBlockProcessor extends LimitingProcessor {
  async initializeJobs(block: XrpBlock, onSave: onSaveSig) {
    try {
      this.block = block;
      let txPromises = block.data.result.ledger.transactions.map((txObject) => {
        const newObj = {
          result: txObject
        }
        // @ts-ignore
        let processed = new XrpTransaction(newObj);
        //return augmentTransactionXrp(this.client, block, processed);
        return async () => { return await augmentTransactionXrp(this.client, block, processed); };
      });
      const transDb = await retryMany(`XrpBlockProcessor::initializeJobs`, txPromises, this.settings.timeout, this.settings.retry) as DBTransactionBase[];
      this.stop();
      const blockDb = await augmentBlock(block);

      onSave(blockDb, transDb);
    }
    catch (error) {
      logException(error, `XrpBlockProcessor::initializeJobs`);
    }
  }
}