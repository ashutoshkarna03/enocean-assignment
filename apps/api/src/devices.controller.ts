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
}
