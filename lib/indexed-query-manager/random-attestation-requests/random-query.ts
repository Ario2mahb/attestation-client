import { DBBlockBase } from "../../entity/indexer/dbBlock";
import { DBTransactionBase } from "../../entity/indexer/dbTransaction";
import { logException } from "../../utils/logger";
import { sleepms } from "../../utils/utils";
import { IndexedQueryManager } from "../IndexedQueryManager";


export class RandomDBIterator<T> {
   iqm: IndexedQueryManager;
   cache: Map<number, T>;
   startIndex: number = 0;
   endIndex: number = -1;
   batchSize: number;
   topUpThreshold: number;
   fetch: () => Promise<T[]>;
   label: string;

   constructor(iqm: IndexedQueryManager, fetch: () => Promise<T[]>, batchSize: number, topUpThreshold: number = 0.25, label: string = "default") {
      this.iqm = iqm;
      this.cache = new Map<number, T>();
      this.batchSize = batchSize;
      this.topUpThreshold = topUpThreshold;
      this.fetch = fetch;
      this.label = label;
   }

   public get size() {
      return Math.max(this.endIndex - this.startIndex + 1);
   }

   public async next() {
      try {
         while (this.size <= 0) {
            await this.refresh();
         }
      }
      catch (error) {
         logException(error, `RandomDBIterator::next`);
      }
      await sleepms(100);
      if (this.size / this.batchSize < this.topUpThreshold) {
         this.refresh()  // async call
      }
      let tmp = this.cache.get(this.startIndex);
      this.cache.delete(this.startIndex);
      this.startIndex++;
      return tmp;
   }

   public insert(item: T) {
      this.cache.set(this.endIndex + 1, item);
      this.endIndex++;
   }

   refreshing = false;

   public async initialize() {
      await this.refresh();
   }

   public async refresh() {
      if (this.refreshing) {
         return;
      }
      this.refreshing = true;
      console.time(this.label);
      let items = await this.fetch();
      console.timeEnd(this.label);

      for (let item of items) {
         this.insert(item);
      }
      // console.log(`${this.label} refreshed: ${this.size}`)
      this.refreshing = false;
   }
}

export interface RandomTransactionOptions {
   mustBeNativePayment?: boolean;
   mustNotBeNativePayment?: boolean;
   mustHavePaymentReference?: boolean;
   mustNotHavePaymentReference?: boolean;
   startTime?: number;
}

export async function fetchRandomTransactions(
   iqm: IndexedQueryManager,
   batchSize = 100,
   options: RandomTransactionOptions
): Promise<DBTransactionBase[]> {
   let result: DBTransactionBase[] = [];
   let maxReps = 10;
   while (result.length === 0) {
      let tableId = Math.round(Math.random());
      let table = iqm.transactionTable[tableId];


      let maxQuery = iqm.dbService.connection.manager.createQueryBuilder(table, "transaction")
         .select("MAX(transaction.id)", "max");
      let res = await maxQuery.getRawOne();
      if (!res.max) {
         maxReps--;
         if (maxReps === 0) {
            return []
         }
         continue;
      }
      let randN = Math.floor(Math.random() * res.max);
      let query = iqm.dbService.connection.manager.createQueryBuilder(table, "transaction")
         .andWhere("transaction.id > :max", { max: randN })
      // .andWhere("transaction.id < :upper", {upper: randN + 100000})

      if (options.mustHavePaymentReference) {
         query = query.andWhere("transaction.paymentReference != ''");
      }
      if (options.mustNotHavePaymentReference) {
         query = query.andWhere("transaction.paymentReference == ''");
      }
      if (options.mustBeNativePayment) {
         query = query.andWhere("transaction.isNativePayment = 1")
      }
      if (options.mustNotBeNativePayment) {
         query = query.andWhere("transaction.isNativePayment = 0")
      }
      if (options.startTime) {
         query = query.andWhere("transaction.timestamp >= :startTime", { startTime: options.startTime })
      }
      query = query
         //.orderBy("transaction.id")
         .limit(batchSize)
      result = await query.getMany() as DBTransactionBase[];
   }

   return result;
}


export async function fetchRandomConfirmedBlocks(iqm: IndexedQueryManager, batchSize = 100, startTime?: number): Promise<DBBlockBase[]> {
   let query = iqm.dbService.connection.manager.createQueryBuilder(iqm.blockTable, "block")
      .where("block.confirmed = :confirmed", { confirmed: true });
   if (startTime) {
      query = query.andWhere("block.timestamp >= :startTime", { startTime });
   }
   query = query.orderBy("RAND()")
      .limit(batchSize)
   return await query.getMany() as DBBlockBase[];
}


