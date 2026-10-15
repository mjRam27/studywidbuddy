import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { InterviewProcessor } from './interview.processor';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [ApplicationsModule],
  controllers: [InterviewsController],
  providers: [InterviewsService, InterviewProcessor],
  exports: [InterviewsService],
})
export class InterviewsModule {}
