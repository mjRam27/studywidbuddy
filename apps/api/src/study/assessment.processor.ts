import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { AiError } from '../ai/ai-provider';
import { ASSESSMENT_QUEUE } from '../queue/queue.module';
import {
  type AssessmentJob,
  AssessmentsService,
  JOB_ASSESSMENT_EVALUATE,
  JOB_ASSESSMENT_QUESTIONS,
} from './assessments.service';
import { JOB_LESSON_TRANSCRIBE, type TranscribeJob, TranscriptsService } from './transcripts.service';
import { TranscriptionError } from './video-transcriber';

type StudyJob = AssessmentJob | TranscribeJob;
const isTranscribe = (j: Job<StudyJob>): j is Job<TranscribeJob> => j.name === JOB_LESSON_TRANSCRIBE;

/** Voice-check AI steps and lesson transcripts, off the request path. Same retry/failure policy as interviews. */
@Processor(ASSESSMENT_QUEUE, { concurrency: 4 })
export class AssessmentProcessor extends WorkerHost {
  private readonly logger = new Logger(AssessmentProcessor.name);

  constructor(
    private readonly assessments: AssessmentsService,
    private readonly transcripts: TranscriptsService,
  ) {
    super();
  }

  async process(job: Job<StudyJob>): Promise<void> {
    try {
      if (isTranscribe(job)) return await this.transcripts.transcribe(job.data.lessonId);
      const data = job.data as AssessmentJob;
      if (job.name === JOB_ASSESSMENT_QUESTIONS) return await this.assessments.generateQuestions(data.assessmentId);
      if (job.name === JOB_ASSESSMENT_EVALUATE) return await this.assessments.evaluate(data.assessmentId);
      throw new UnrecoverableError(`Unknown job ${job.name}`);
    } catch (e) {
      if (e instanceof TranscriptionError && e.message.includes('GEMINI_API_KEY')) {
        throw new UnrecoverableError(e.message);
      }
      if (e instanceof AiError && !e.retryable) throw new UnrecoverableError(`${e.kind}: ${e.message}`);
      throw e;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<StudyJob> | undefined, error: Error) {
    if (!job) return;
    const exhausted =
      error instanceof UnrecoverableError ||
      error.name === 'UnrecoverableError' ||
      job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!exhausted) {
      this.logger.warn(`Job ${job.id} attempt ${job.attemptsMade} failed, will retry: ${error.message}`);
      return;
    }
    if (isTranscribe(job)) await this.transcripts.markFailed(job.data.lessonId, error);
    else await this.assessments.markFailed((job.data as AssessmentJob).assessmentId, job.name, error);
  }
}
