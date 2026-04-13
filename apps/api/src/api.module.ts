import { loadConfig } from '@enocean/common';
import { Module } from '@nestjs/common';

import { DevicesController } from './devices.controller';
import { HealthController } from './health.controller';
import { MongoReaderService } from './mongo-reader.service';

const config = loadConfig();

@Module({
  controllers: [HealthController, DevicesController],
  providers: [
    {
      provide: 'APP_CONFIG',
      useValue: config,
    },
    MongoReaderService,
  ],
})
export class ApiModule {}
