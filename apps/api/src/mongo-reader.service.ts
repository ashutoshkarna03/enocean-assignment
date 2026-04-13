import { AppConfig, DeviceHistoryDoc, Logger } from '@enocean/common';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Collection, Db, MongoClient } from 'mongodb';

const logger = new Logger('mongo-reader');

@Injectable()
export class MongoReaderService implements OnModuleInit, OnModuleDestroy {
  private client!: MongoClient;
  private db!: Db;
  private historyCol!: Collection<DeviceHistoryDoc>;

  constructor(@Inject('APP_CONFIG') private readonly config: AppConfig) {}

  async onModuleInit() {
    this.client = new MongoClient(this.config.mongo.uri);
    await this.client.connect();
    this.db = this.client.db(this.config.mongo.dbName);
    this.historyCol = this.db.collection('devices.history');
    logger.info('MongoDB reader connected');
  }

  async onModuleDestroy() {
    await this.client?.close();
    logger.info('MongoDB reader disconnected');
  }

  getHistoryCollection(): Collection<DeviceHistoryDoc> {
    return this.historyCol;
  }
}
