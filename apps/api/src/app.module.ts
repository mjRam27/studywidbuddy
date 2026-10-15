import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivityModule } from './activity/activity.module';
import { AiModule } from './ai/ai.module';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { AppConfigModule } from './common/config/config.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { PrismaModule } from './common/prisma/prisma.module';
import { CoursesModule } from './courses/courses.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { HealthController } from './health.controller';
import { InterviewsModule } from './interviews/interviews.module';
import { MailModule } from './mail/mail.module';
import { PlanningModule } from './planning/planning.module';
import { GithubModule } from './github/github.module';
import { PmModule } from './pm/pm.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StudyModule } from './study/study.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ProjectsModule } from './projects/projects.module';
import { QueueModule } from './queue/queue.module';
import { SkillsModule } from './skills/skills.module';
import { TasksModule } from './tasks/tasks.module';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    MailModule,
    JwtModule.register({ global: true }),
    // Default: 120 requests/minute per IP. Credential and AI routes set stricter limits.
    // Disabled under NODE_ENV=test, where the e2e suite registers many users per minute.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    AuthModule,
    SkillsModule,
    ProfilesModule,
    CoursesModule,
    EnrollmentsModule,
    ProjectsModule,
    ApplicationsModule,
    AiModule,
    QueueModule,
    InterviewsModule,
    TeamsModule,
    ActivityModule,
    TasksModule,
    PlanningModule,
    StudyModule,
    RealtimeModule,
    PmModule,
    GithubModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit, then authenticate, then check roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
