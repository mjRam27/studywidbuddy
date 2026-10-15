import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { AgentService } from './agent.service';
import { MeetingsService } from './meetings.service';
import { MemoryService } from './memory.service';
import { PmController } from './pm.controller';
import { PmProcessor } from './pm.processor';
import { ProjectSnapshotService } from './project-snapshot.service';
import { ToolRegistry } from './tool-registry';

/** AI project manager: per-project memory, agent runs with approvals, and AI-led meetings. */
@Module({
  imports: [TasksModule],
  controllers: [PmController],
  providers: [ProjectSnapshotService, MemoryService, ToolRegistry, AgentService, MeetingsService, PmProcessor],
  exports: [MeetingsService, AgentService],
})
export class PmModule {}
