import { Module } from '@nestjs/common';
import { DebugModule } from '../debug/debug.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { ContributionsController } from './contributions.controller';
import { ContributionsService } from './contributions.service';

/** The profile's activity graph and Debugging card. */
@Module({
  imports: [ProfilesModule, DebugModule],
  controllers: [ContributionsController],
  providers: [ContributionsService],
})
export class ContributionsModule {}
