import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { LearningInsightsService } from './learning-insights.service';

@Module({
  imports: [CoursesModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, LearningInsightsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
