import { AppConfig, Logger, SensorEvent } from '@enocean/common';
import { Inject, Injectable } from '@nestjs/common';
import { Consumer, Kafka, Producer } from 'kafkajs';

import { BufferService } from './buffer.service';

const logger = new Logger('kafka-consumer');

/**
 * Consumes sensor events from Kafka and feeds them to the buffer.
 * We run with partitionsConsumedConcurrently > 1 for throughput.
 */
@Injectable()
export class KafkaConsumerService {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly producer: Producer;

  constructor(
    @Inject('APP_CONFIG') private readonly config: AppConfig,
    private readonly bufferService: BufferService,
  ) {
    this.kafka = new Kafka({
      clientId: 'enocean-worker',
      brokers: config.kafka.brokers,
    });
    this.consumer = this.kafka.consumer({
      groupId: config.kafka.groupId,
    });
    this.producer = this.kafka.producer();
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.producer.connect();
    await this.consumer.subscribe({
      topic: this.config.kafka.topic,
      fromBeginning: true,
    });

    await this.consumer.run({
      // Multiple partitions consumed concurrently — this increases
      // the chance of concurrent flushes happening
      partitionsConsumedConcurrently: 3,
      eachMessage: async ({ partition, message }) => {
        const rawValue = message.value?.toString();

        try {
          if (!rawValue) return;

          const event: SensorEvent = JSON.parse(rawValue);
          this.bufferService.addEvent(event);
        } catch (err) {
          logger.error('Failed to process message', { error: String(err) });
          await this.publishToDlq(partition, message.offset, message.key?.toString(), rawValue, err);
        }
      },
    });

    logger.info(`Consuming from topic: ${this.config.kafka.topic} (DLQ: ${this.config.kafka.dlqTopic})`);
  }

  async stop(): Promise<void> {
    await this.bufferService.flushAll();
    await this.consumer.disconnect();
    await this.producer.disconnect();
    logger.info('Kafka consumer disconnected');
  }

  private async publishToDlq(
    partition: number,
    offset: string,
    key: string | undefined,
    rawValue: string | undefined,
    err: unknown,
  ): Promise<void> {
    const payload = {
      sourceTopic: this.config.kafka.topic,
      sourcePartition: partition,
      sourceOffset: offset,
      receivedAt: Date.now(),
      error: String(err),
      value: rawValue ?? null,
    };

    try {
      await this.producer.send({
        topic: this.config.kafka.dlqTopic,
        messages: [
          {
            key,
            value: JSON.stringify(payload),
          },
        ],
      });
    } catch (dlqErr) {
      logger.error('Failed to publish message to DLQ', {
        error: String(dlqErr),
        dlqTopic: this.config.kafka.dlqTopic,
      });
    }
  }
}
