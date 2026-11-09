import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { AiError } from '../../ai/ai-provider';
import { REVIEW_QUEUE } from '../../queue/queue.module';
import { GithubApiError } from '../github-client';
import { JOB_REVIEW, type ReviewJob, ReviewService } from './review.service';

/**
 * Runs AI code reviews off the request path. Transient AI and GitHub failures are retried
 * with backoff; when a job gives up, the review is marked FAILED and can be re-run.
 */
@Processor(REVIEW_QUEUE, { concurrency: 2 })
export class ReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewProcessor.name);

  constructor(private readonly reviews: ReviewService) {
    super();
  }

  async process(job: Job<ReviewJob>): Promise<void> {
    if (job.name !== JOB_REVIEW) throw new UnrecoverableError(`Unknown job ${job.name}`);
    try {
      await this.reviews.run(job.data.reviewId);
    } catch (e) {
      if (e instanceof AiError && !e.retryable) throw new UnrecoverableError(`${e.kind}: ${e.message}`);
      // 4xx from GitHub (other than rate limits) won't fix themselves on retry.
      if (e instanceof GithubApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
        throw new UnrecoverableError(`GitHub ${e.status}: ${e.message}`);
      }
      throw e;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ReviewJob> | undefined, error: Error) {
    if (!job) return;
    const exhausted =
      error instanceof UnrecoverableError ||
      error.name === 'UnrecoverableError' ||
      job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!exhausted) {
      this.logger.warn(`Review job ${job.id} attempt ${job.attemptsMade} failed, will retry: ${error.message}`);
      return;
    }
    await this.reviews.markFailed(job.data.reviewId, error);
  }
}
