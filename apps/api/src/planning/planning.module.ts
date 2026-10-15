import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { PlanningController } from './planning.controller';
import { PlanningProcessor } from './planning.processor';
import { PlanningService } from './planning.service';

@Module({
  imports: [TasksModule],
  controllers: [PlanningController],
  providers: [PlanningService, PlanningProcessor],
})
export class PlanningModule {}
