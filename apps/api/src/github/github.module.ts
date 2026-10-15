import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../common/config/env';
import { TasksModule } from '../tasks/tasks.module';
import { GithubClient, HttpGithubClient } from './github-client';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { SmeeRelay } from './smee-relay';
import { WebhookService } from './webhook.service';

/** GitHub App integration: linked accounts, team repos, webhooks (PR ↔ task, CI status). */
@Global()
@Module({
  imports: [TasksModule],
  controllers: [GithubController],
  providers: [
    { provide: GithubClient, inject: [ENV], useFactory: (env: Env) => new HttpGithubClient(env) },
    GithubService,
    WebhookService,
    SmeeRelay,
  ],
  exports: [GithubService],
})
export class GithubModule {}
