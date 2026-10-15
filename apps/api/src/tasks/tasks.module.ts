import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { WorkspaceAccess } from './workspace-access.service';
import { WorkspaceService } from './workspace.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, WorkspaceService, WorkspaceAccess],
  exports: [TasksService, WorkspaceService, WorkspaceAccess],
})
export class TasksModule {}
