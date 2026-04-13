import { BadRequestException } from '@nestjs/common';

import { DevicesController } from '../devices.controller';
import { MongoReaderService } from '../mongo-reader.service';

describe('DevicesController', () => {
  it('returns paginated device history with filters (happy path)', async () => {
    const expectedData = [
      {
        deviceId: 'device-1',
        ts: 2000,
        sensor: 'temperature',
        value: 22.5,
        ingestedAt: new Date(),
      },
    ];

    const toArray = jest.fn().mockResolvedValue(expectedData);
    const limit = jest.fn().mockReturnValue({ toArray });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    const find = jest.fn().mockReturnValue({ sort });
    const countDocuments = jest.fn().mockResolvedValue(1);

    const mongoReader = {
      getHistoryCollection: () => ({
        countDocuments,
        find,
      }),
    } as unknown as MongoReaderService;

    const controller = new DevicesController(mongoReader);

    const result = await controller.getDeviceHistory('device-1', 'temperature', '1000', '3000', '2', '10');

    expect(countDocuments).toHaveBeenCalledWith({
      deviceId: 'device-1',
      sensor: 'temperature',
      ts: { $gte: 1000, $lte: 3000 },
    });
    expect(find).toHaveBeenCalledWith({
      deviceId: 'device-1',
      sensor: 'temperature',
      ts: { $gte: 1000, $lte: 3000 },
    });
    expect(sort).toHaveBeenCalledWith({ ts: -1 });
    expect(skip).toHaveBeenCalledWith(10); // (page 2 - 1) * limit 10
    expect(limit).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      data: expectedData,
      total: 1,
      page: 2,
      limit: 10,
    });
  });

  it('throws bad request when limit exceeds max', async () => {
    const mongoReader = {
      getHistoryCollection: () => ({
        countDocuments: jest.fn(),
        find: jest.fn(),
      }),
    } as unknown as MongoReaderService;

    const controller = new DevicesController(mongoReader);

    await expect(controller.getDeviceHistory('device-1', undefined, undefined, undefined, '1', '201')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uses default pagination when page/limit are not provided', async () => {
    const toArray = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ toArray });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    const find = jest.fn().mockReturnValue({ sort });
    const countDocuments = jest.fn().mockResolvedValue(0);

    const mongoReader = {
      getHistoryCollection: () => ({
        countDocuments,
        find,
      }),
    } as unknown as MongoReaderService;

    const controller = new DevicesController(mongoReader);
    const result = await controller.getDeviceHistory('device-defaults');

    expect(find).toHaveBeenCalledWith({ deviceId: 'device-defaults' });
    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(50);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('throws bad request when page is invalid', async () => {
    const mongoReader = {
      getHistoryCollection: () => ({
        countDocuments: jest.fn(),
        find: jest.fn(),
      }),
    } as unknown as MongoReaderService;

    const controller = new DevicesController(mongoReader);
    await expect(controller.getDeviceHistory('device-1', undefined, undefined, undefined, '0', '50')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws bad request when timestamp is invalid', async () => {
    const mongoReader = {
      getHistoryCollection: () => ({
        countDocuments: jest.fn(),
        find: jest.fn(),
      }),
    } as unknown as MongoReaderService;

    const controller = new DevicesController(mongoReader);
    await expect(controller.getDeviceHistory('device-1', undefined, 'not-a-number', undefined, '1', '50')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws bad request when from is greater than to', async () => {
    const mongoReader = {
      getHistoryCollection: () => ({
        countDocuments: jest.fn(),
        find: jest.fn(),
      }),
    } as unknown as MongoReaderService;

    const controller = new DevicesController(mongoReader);
    await expect(controller.getDeviceHistory('device-1', undefined, '200', '100', '1', '50')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
