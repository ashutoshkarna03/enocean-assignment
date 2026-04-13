import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';

import { MongoReaderService } from './mongo-reader.service';

@Controller('devices')
export class DevicesController {
  constructor(private readonly mongoReader: MongoReaderService) {}

  @Get(':deviceId/history')
  async getDeviceHistory(
    @Param('deviceId') deviceId: string,
    @Query('sensor') sensor?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = this.parsePositiveInt(page, 'page', 1);
    const limitNum = this.parsePositiveInt(limit, 'limit', 50);
    if (limitNum > 200) {
      throw new BadRequestException('limit must be <= 200');
    }

    const fromTs = this.parseOptionalTimestamp(from, 'from');
    const toTs = this.parseOptionalTimestamp(to, 'to');
    if (fromTs !== undefined && toTs !== undefined && fromTs > toTs) {
      throw new BadRequestException('from must be <= to');
    }

    const history = this.mongoReader.getHistoryCollection();
    const filter: Record<string, any> = { deviceId };

    if (sensor) {
      filter.sensor = sensor;
    }

    if (fromTs !== undefined || toTs !== undefined) {
      filter.ts = {};
      if (fromTs !== undefined) filter.ts.$gte = fromTs;
      if (toTs !== undefined) filter.ts.$lte = toTs;
    }

    const total = await history.countDocuments(filter);
    const data = await history
      .find(filter)
      .sort({ ts: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .toArray();

    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }

  @Get(':deviceId/sensors/:sensor/aggregate')
  async getSensorAggregate(
    @Param('deviceId') deviceId: string,
    @Param('sensor') sensor: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('interval') interval?: string,
  ) {
    const fromTs = this.parseRequiredTimestamp(from, 'from');
    const toTs = this.parseRequiredTimestamp(to, 'to');
    if (fromTs > toTs) {
      throw new BadRequestException('from must be <= to');
    }

    const intervalMs = this.intervalToMs(this.parseInterval(interval));
    const history = this.mongoReader.getHistoryCollection();

    const data = await history
      .aggregate<{ ts: number; min: number; max: number; avg: number; count: number }>([
        {
          $match: {
            deviceId,
            sensor,
            ts: { $gte: fromTs, $lte: toTs },
          },
        },
        {
          $match: {
            $expr: { $isNumber: '$value' },
          },
        },
        {
          $addFields: {
            bucketTs: {
              $multiply: [{ $floor: { $divide: ['$ts', intervalMs] } }, intervalMs],
            },
          },
        },
        {
          $group: {
            _id: '$bucketTs',
            min: { $min: '$value' },
            max: { $max: '$value' },
            avg: { $avg: '$value' },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            ts: '$_id',
            min: 1,
            max: 1,
            avg: 1,
            count: 1,
          },
        },
        {
          $sort: { ts: 1 },
        },
      ])
      .toArray();

    return data;
  }

  private parsePositiveInt(value: string | undefined, field: string, defaultValue: number): number {
    if (value === undefined) return defaultValue;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return parsed;
  }

  private parseOptionalTimestamp(value: string | undefined, field: string): number | undefined {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`${field} must be a valid timestamp`);
    }
    return parsed;
  }

  private parseRequiredTimestamp(value: string | undefined, field: string): number {
    if (value === undefined) {
      throw new BadRequestException(`${field} is required`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`${field} must be a valid timestamp`);
    }
    return parsed;
  }

  private parseInterval(value: string | undefined): '1m' | '5m' | '1h' | '1d' {
    if (value === '1m' || value === '5m' || value === '1h' || value === '1d') {
      return value;
    }
    throw new BadRequestException('interval must be one of: 1m, 5m, 1h, 1d');
  }

  private intervalToMs(interval: '1m' | '5m' | '1h' | '1d'): number {
    if (interval === '1m') return 60_000;
    if (interval === '5m') return 300_000;
    if (interval === '1h') return 3_600_000;
    return 86_400_000;
  }
}
