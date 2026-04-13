import { Controller, Get, Param, Query } from '@nestjs/common';

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
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;

    const history = this.mongoReader.getHistoryCollection();
    const filter: Record<string, any> = { deviceId };

    if (sensor) {
      filter.sensor = sensor;
    }

    if (from || to) {
      filter.ts = {};
      if (from) filter.ts.$gte = parseInt(from, 10);
      if (to) filter.ts.$lte = parseInt(to, 10);
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
}
