import { Global, Module } from '@nestjs/common';
import { ChatController } from '../chat/chat.controller';
import { ChatService } from '../chat/chat.service';
import { TasksModule } from '../tasks/tasks.module';
import { RealtimeGateway } from './realtime.gateway';

/** Socket gateway plus team chat. Global so meetings and the AI PM can post and broadcast. */
@Global()
@Module({
  imports: [TasksModule],
  controllers: [ChatController],
  providers: [RealtimeGateway, ChatService],
  exports: [RealtimeGateway, ChatService],
})
export class RealtimeModule {}
