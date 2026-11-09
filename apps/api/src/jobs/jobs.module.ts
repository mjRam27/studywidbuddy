import { Module } from '@nestjs/common';
import { ENV, type Env } from '../common/config/env';
import { HttpJobFeedClient, JobFeedClient } from './job-feeds';
import { JobsController } from './jobs.controller';
import { JobsProcessor } from './jobs.processor';
import { JobsService } from './jobs.service';

/** Job listings from public job-board APIs, matched to each person's proven skills. */
@Module({
  controllers: [JobsController],
  providers: [
    { provide: JobFeedClient, inject: [ENV], useFactory: (env: Env) => new HttpJobFeedClient(env) },
    JobsService,
    JobsProcessor,
  ],
})
export class JobsModule {}
