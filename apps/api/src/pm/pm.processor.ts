import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import { type Job, type Queue, UnrecoverableError } from 'bullmq';
import { AiError } from '../ai/ai-provider';
import { ENV, type Env } from '../common/config/env';
import { PM_QUEUE } from '../queue/queue.module';
import { AgentService, JOB_AGENT_RUN } from './agent.service';
import { JOB_MEETING_PREPARE, JOB_MEETING_SUMMARIZE, JOB_PM_TICK, MeetingsService } from './meetings.service';

/** How often the scheduler looks for due and expired meetings. */
const TICK_MS = 5 * 60_000;

/** AI PM background work: meeting prep/summaries, agent runs, and the meeting scheduler tick. */
@Processor(PM_QUEUE, { concurrency: 2 })
export class PmProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PmProcessor.name);

  constructor(
    private readonly meetings: MeetingsService,
    private readonly agent: AgentService,
    @InjectQueue(PM_QUEUE) private readonly queue: Queue,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  async onModuleInit() {
    // Tests drive the scheduler directly; everywhere else it runs on a repeat.
    if (this.env.NODE_ENV === 'test') return;
    await this.queue.add(JOB_PM_TICK, {}, { repeat: { every: TICK_MS }, jobId: 'pm-tick', attempts: 1 });
  }

  async process(job: Job<{ meetingId?: string; runId?: string }>): Promise<unknown> {
    try {
      switch (job.name) {
        case JOB_PM_TICK:
          return await this.meetings.tick();
        case JOB_MEETING_PREPARE:
          return await this.meetings.prepare(job.data.meetingId!);
        case JOB_MEETING_SUMMARIZE:
          return await this.meetings.summarize(job.data.meetingId!);
        case JOB_AGENT_RUN:
          return await this.agent.execute(job.data.runId!);
        default:
          throw new UnrecoverableError(`Unknown job ${job.name}`);
      }
    } catch (e) {
      if (e instanceof AiError && !e.retryable) throw new UnrecoverableError(`${e.kind}: ${e.message}`);
      throw e;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ meetingId?: string }> | undefined, error: Error) {
    if (!job || !job.data.meetingId) return;
    const exhausted =
      error instanceof UnrecoverableError ||
      error.name === 'UnrecoverableError' ||
      job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!exhausted) {
      this.logger.warn(`Job ${job.id} attempt ${job.attemptsMade} failed, will retry: ${error.message}`);
      return;
    }
    await this.meetings.markFailed(job.data.meetingId, job.name, error);
  }
}
