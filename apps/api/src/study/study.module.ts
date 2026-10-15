import { Module } from '@nestjs/common';
import { AssessmentProcessor } from './assessment.processor';
import { AssessmentsService } from './assessments.service';
import { StudyController } from './study.controller';
import { StudyService } from './study.service';
import { TranscriptsService } from './transcripts.service';
import { VideoMetadata, YoutubeOEmbed } from './video-metadata';
import { GeminiTranscriber, VideoTranscriber } from './video-transcriber';

/** Study Workspace: lesson player data, private notes, the AI Buddy and voice checks. */
@Module({
  controllers: [StudyController],
  providers: [
    StudyService,
    AssessmentsService,
    AssessmentProcessor,
    TranscriptsService,
    { provide: VideoMetadata, useClass: YoutubeOEmbed },
    { provide: VideoTranscriber, useClass: GeminiTranscriber },
  ],
  exports: [StudyService],
})
export class StudyModule {}
