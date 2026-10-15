import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../common/config/env';

export const INTERVIEW_QUEUE = 'interviews';
export const PLANNING_QUEUE = 'planning';
export const ASSESSMENT_QUEUE = 'assessments';
export const PM_QUEUE = 'pm';

/** Translates REDIS_URL into ioredis options. `maxRetriesPerRequest: null` is required by BullMQ workers. */
export function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Background jobs (BullMQ on Redis). Introduced for AI work that must not hold an HTTP
 * request open. Workers run in the API process for now; they can move to a separate process
 * without code changes because they only talk to Postgres and the queue.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        connection: redisConnection(env.REDIS_URL),
        prefix: env.QUEUE_PREFIX,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: INTERVIEW_QUEUE },
      { name: PLANNING_QUEUE },
      { name: ASSESSMENT_QUEUE },
      { name: PM_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
