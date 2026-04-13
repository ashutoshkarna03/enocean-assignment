import { loadConfig, type DeviceHistoryDoc } from '@enocean/common';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Collection, Db, MongoClient } from 'mongodb';

import { ApiModule } from '../api.module';

describe('Devices API Integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  let mongoClient: MongoClient;
  let db: Db;
  let history: Collection<DeviceHistoryDoc>;

  beforeAll(async () => {
    const config = loadConfig();
    mongoClient = new MongoClient(config.mongo.uri);
    await mongoClient.connect();
    db = mongoClient.db(config.mongo.dbName);
    history = db.collection<DeviceHistoryDoc>('devices.history');

    app = await NestFactory.create(ApiModule, { logger: false });
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? 3000 : address.port;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await mongoClient?.close();
  }, 15000);

  beforeEach(async () => {
    await db.collection('devices.history').deleteMany({});
    await db.collection('devices.latest').deleteMany({});
  });

  it('returns filtered, paginated, ts-desc history response', async () => {
    await history.insertMany([
      {
        deviceId: 'device-api-1',
        ts: 1000,
        sensor: 'temperature',
        value: 20,
        ingestedAt: new Date(),
      },
      {
        deviceId: 'device-api-1',
        ts: 2000,
        sensor: 'temperature',
        value: 21,
        ingestedAt: new Date(),
      },
      {
        deviceId: 'device-api-1',
        ts: 3000,
        sensor: 'humidity',
        value: 40,
        ingestedAt: new Date(),
      },
      {
        deviceId: 'device-api-2',
        ts: 2500,
        sensor: 'temperature',
        value: 99,
        ingestedAt: new Date(),
      },
    ]);

    const res = await fetch(
      `${baseUrl}/devices/device-api-1/history?sensor=temperature&from=900&to=2500&page=1&limit=1`,
    );
    const body = (await res.json()) as {
      data: DeviceHistoryDoc[];
      total: number;
      page: number;
      limit: number;
    };

    expect(res.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.deviceId).toBe('device-api-1');
    expect(body.data[0]?.sensor).toBe('temperature');
    expect(body.data[0]?.ts).toBe(2000);
  });

  it('returns 400 for invalid query combinations', async () => {
    const res = await fetch(`${baseUrl}/devices/device-api-1/history?from=500&to=100&page=1&limit=50`);
    expect(res.status).toBe(400);
  });

  it('returns sensor aggregates with numeric-only values and bucket metrics', async () => {
    await history.insertMany([
      {
        deviceId: 'device-agg-1',
        ts: 1000,
        sensor: 'temperature',
        value: 10,
        ingestedAt: new Date(),
      },
      {
        deviceId: 'device-agg-1',
        ts: 20000,
        sensor: 'temperature',
        value: 20,
        ingestedAt: new Date(),
      },
      {
        deviceId: 'device-agg-1',
        ts: 65000,
        sensor: 'temperature',
        value: 30,
        ingestedAt: new Date(),
      },
      {
        deviceId: 'device-agg-1',
        ts: 70000,
        sensor: 'temperature',
        value: 'not-a-number',
        ingestedAt: new Date(),
      },
      {
        deviceId: 'device-agg-1',
        ts: 5000,
        sensor: 'humidity',
        value: 99,
        ingestedAt: new Date(),
      },
    ]);

    const res = await fetch(
      `${baseUrl}/devices/device-agg-1/sensors/temperature/aggregate?from=0&to=120000&interval=1m`,
    );
    const body = (await res.json()) as Array<{
      ts: number;
      min: number;
      max: number;
      avg: number;
      count: number;
    }>;

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ ts: 0, min: 10, max: 20, avg: 15, count: 2 });
    expect(body[1]).toEqual({ ts: 60000, min: 30, max: 30, avg: 30, count: 1 });
  });

  it('returns empty array for aggregate when no numeric data exists in range', async () => {
    await history.insertMany([
      {
        deviceId: 'device-agg-empty',
        ts: 1000,
        sensor: 'temperature',
        value: 'bad',
        ingestedAt: new Date(),
      },
      {
        deviceId: 'device-agg-empty',
        ts: 2000,
        sensor: 'temperature',
        value: null,
        ingestedAt: new Date(),
      },
    ]);

    const res = await fetch(
      `${baseUrl}/devices/device-agg-empty/sensors/temperature/aggregate?from=0&to=120000&interval=1m`,
    );
    const body = (await res.json()) as Array<{
      ts: number;
      min: number;
      max: number;
      avg: number;
      count: number;
    }>;

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });
});
