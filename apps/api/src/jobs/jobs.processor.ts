import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { JOBS_QUEUE } from '../queue/queue.module';
import { JOB_SYNC, JobsService, type SyncResult } from './jobs.service';

/** Refreshes job listings (scheduled every JOBS_SYNC_HOURS, or an admin's "Sync now"). One at a time. */
@Processor(JOBS_QUEUE, { concurrency: 1 })
export class JobsProcessor extends WorkerHost {
  constructor(private readonly jobs: JobsService) {
    super();
  }

  async process(job: Job): Promise<SyncResult | void> {
    if (job.name === JOB_SYNC) return this.jobs.sync();
  }
}
