import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { LearningInsightsService } from './learning-insights.service';
import { StudyTimeService } from './study-time.service';

@Module({
  imports: [CoursesModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, LearningInsightsService, StudyTimeService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
