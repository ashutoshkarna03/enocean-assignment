import { AppConfig, SensorEvent } from '@enocean/common';

import { BufferService } from '../buffer.service';
import { MongoWriterService } from '../mongo-writer.service';

function makeConfig(overrides?: Partial<AppConfig['flush']>): AppConfig {
  return {
    kafka: {
      brokers: ['localhost:9092'],
      groupId: 'test-group',
      topic: 'device.events',
      dlqTopic: 'device.events.dlq',
    },
    mongo: {
      uri: 'mongodb://localhost:27017',
      dbName: 'enocean',
    },
    flush: {
      intervalMs: overrides?.intervalMs ?? 1000,
      maxBufferSize: overrides?.maxBufferSize ?? 2,
      debugDelayMs: overrides?.debugDelayMs ?? 0,
    },
    port: 3000,
  };
}

function makeEvent(deviceId: string, ts: number): SensorEvent {
  return {
    deviceId,
    ts,
    sensor: 'temperature',
    value: ts,
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Condition not met in time');
}

describe('BufferService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('flushes all events exactly once when new events arrive during an in-flight flush', async () => {
    let resolveFirstFlush: (value: void | PromiseLike<void>) => void = () => {
      throw new Error('First flush resolver not initialized');
    };
    const writeEvents = jest
      .fn<Promise<void>, [string, SensorEvent[]]>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstFlush = resolve;
          }),
      )
      .mockResolvedValue(undefined);

    const mongoWriter = {
      writeEvents,
    } as unknown as MongoWriterService;

    const bufferService = new BufferService(makeConfig({ maxBufferSize: 2 }), mongoWriter);
    const deviceId = 'device-001';

    bufferService.addEvent(makeEvent(deviceId, 1));
    bufferService.addEvent(makeEvent(deviceId, 2)); // triggers first flush
    await waitFor(() => writeEvents.mock.calls.length === 1);

    bufferService.addEvent(makeEvent(deviceId, 3));
    bufferService.addEvent(makeEvent(deviceId, 4)); // queued while flushing

    resolveFirstFlush();
    await waitFor(() => writeEvents.mock.calls.length === 2);

    const allFlushedTs = writeEvents.mock.calls.flatMap(([, events]) => events.map((e) => e.ts));
    expect(allFlushedTs).toEqual([1, 2, 3, 4]);
    expect(bufferService.getBufferSize(deviceId)).toBe(0);
  });

  it('requeues failed flush batch at the front and retries', async () => {
    const writeEvents = jest
      .fn<Promise<void>, [string, SensorEvent[]]>()
      .mockRejectedValueOnce(new Error('temporary mongo error'))
      .mockResolvedValue(undefined);

    const mongoWriter = {
      writeEvents,
    } as unknown as MongoWriterService;

    const bufferService = new BufferService(makeConfig({ maxBufferSize: 2 }), mongoWriter);
    const deviceId = 'device-002';

    bufferService.addEvent(makeEvent(deviceId, 10));
    bufferService.addEvent(makeEvent(deviceId, 11)); // triggers first (failing) flush

    await waitFor(() => writeEvents.mock.calls.length === 2);

    expect(writeEvents.mock.calls[0]?.[1].map((e) => e.ts)).toEqual([10, 11]);
    expect(writeEvents.mock.calls[1]?.[1].map((e) => e.ts)).toEqual([10, 11]);
    expect(bufferService.getBufferSize(deviceId)).toBe(0);
  });

  it('clears active timer when size threshold triggers immediate flush', async () => {
    jest.useFakeTimers();

    const writeEvents = jest.fn<Promise<void>, [string, SensorEvent[]]>().mockResolvedValue(undefined);
    const mongoWriter = {
      writeEvents,
    } as unknown as MongoWriterService;

    const bufferService = new BufferService(
      makeConfig({ intervalMs: 50, maxBufferSize: 2, debugDelayMs: 0 }),
      mongoWriter,
    );
    const deviceId = 'device-003';

    bufferService.addEvent(makeEvent(deviceId, 20)); // starts timer
    bufferService.addEvent(makeEvent(deviceId, 21)); // threshold flush should clear timer

    await Promise.resolve();
    await Promise.resolve();
    expect(writeEvents).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    expect(writeEvents).toHaveBeenCalledTimes(1);
  });

  it('honors debug flush delay before writing', async () => {
    jest.useFakeTimers();

    const writeEvents = jest.fn<Promise<void>, [string, SensorEvent[]]>().mockResolvedValue(undefined);
    const mongoWriter = {
      writeEvents,
    } as unknown as MongoWriterService;

    const bufferService = new BufferService(
      makeConfig({ maxBufferSize: 1, debugDelayMs: 200 }),
      mongoWriter,
    );

    bufferService.addEvent(makeEvent('device-004', 30)); // immediate flush path
    await Promise.resolve();

    expect(writeEvents).not.toHaveBeenCalled();

    jest.advanceTimersByTime(199);
    await Promise.resolve();
    expect(writeEvents).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(writeEvents).toHaveBeenCalledTimes(1);
  });
});
