import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ENV, Env } from './common/config/env';
import { setupApp } from './setup-app';

/**
 * Local development reads apps/api/.env. Variables already set in the environment win, so
 * hosting platforms and containers (which inject real env vars) are unaffected.
 */
function loadDotEnv() {
  const file = join(process.cwd(), '.env');
  if (process.env.NODE_ENV !== 'production' && existsSync(file)) process.loadEnvFile(file);
}

async function bootstrap() {
  loadDotEnv();
  // rawBody: GitHub webhooks are verified against the exact bytes GitHub signed.
  const app = setupApp(await NestFactory.create(AppModule, { rawBody: true }));
  app.enableShutdownHooks();
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
  Logger.log(`API on http://localhost:${env.PORT}/api/v1 · docs at /api/docs`, 'Bootstrap');
}

void bootstrap();
