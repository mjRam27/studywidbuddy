import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { type Job, UnrecoverableError } from 'bullmq';
import { AiError } from '../ai/ai-provider';
import { PLANNING_QUEUE } from '../queue/queue.module';
import { JOB_PLAN, PlanningService } from './planning.service';

@Processor(PLANNING_QUEUE, { concurrency: 1 })
export class PlanningProcessor extends WorkerHost {
  constructor(private readonly planning: PlanningService) {
    super();
  }

  async process(job: Job<{ proposalId: string }>): Promise<void> {
    if (job.name !== JOB_PLAN) throw new UnrecoverableError(`Unknown job ${job.name}`);
    try {
      await this.planning.generate(job.data.proposalId);
    } catch (e) {
      if (e instanceof AiError && !e.retryable) throw new UnrecoverableError(`${e.kind}: ${e.message}`);
      throw e;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ proposalId: string }> | undefined, error: Error) {
    if (!job) return;
    if (error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.planning.markFailed(job.data.proposalId, error);
    }
  }
}
