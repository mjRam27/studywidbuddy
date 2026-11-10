import { Module } from '@nestjs/common';
import { DebugController } from './debug.controller';
import { DebugService } from './debug.service';

/** Debug: fix-the-bugs exercises, attempts, reviews and the Gemini coach. */
@Module({
  controllers: [DebugController],
  providers: [DebugService],
  exports: [DebugService],
})
export class DebugModule {}
