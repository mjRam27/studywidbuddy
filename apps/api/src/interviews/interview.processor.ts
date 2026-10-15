import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { AiError } from '../ai/ai-provider';
import { JOB_CV_SCREEN } from '../applications/applications.service';
import { INTERVIEW_QUEUE } from '../queue/queue.module';
import { type InterviewJob, InterviewsService, JOB_EVALUATE } from './interviews.service';

/**
 * CV screening and interview evaluation, off the request path. Transient AI failures are
 * retried with backoff; when a job gives up, the screening or interview is marked FAILED so
 * the candidate sees a retry option instead of a spinner. (The live call itself runs on the
 * request path, on the fast model, and falls back to the plan if the AI is unavailable.)
 */
@Processor(INTERVIEW_QUEUE, { concurrency: 2 })
export class InterviewProcessor extends WorkerHost {
  private readonly logger = new Logger(InterviewProcessor.name);

  constructor(private readonly interviews: InterviewsService) {
    super();
  }

  async process(job: Job<InterviewJob>): Promise<void> {
    try {
      if (job.name === JOB_CV_SCREEN) return await this.interviews.screenCv(job.data.applicationId!);
      if (job.name === JOB_EVALUATE) return await this.interviews.evaluate(job.data.sessionId!);
      throw new UnrecoverableError(`Unknown job ${job.name}`);
    } catch (e) {
      if (e instanceof AiError && !e.retryable) throw new UnrecoverableError(`${e.kind}: ${e.message}`);
      throw e;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<InterviewJob> | undefined, error: Error) {
    if (!job) return;
    const exhausted =
      error instanceof UnrecoverableError ||
      error.name === 'UnrecoverableError' ||
      job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!exhausted) {
      this.logger.warn(`Job ${job.id} attempt ${job.attemptsMade} failed, will retry: ${error.message}`);
      return;
    }
    if (job.name === JOB_CV_SCREEN && job.data.applicationId) {
      await this.interviews.markScreenFailed(job.data.applicationId, error);
    } else if (job.data.sessionId) {
      await this.interviews.markFailed(job.data.sessionId, error);
    }
  }
}
