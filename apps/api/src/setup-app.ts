import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CSRF_HEADER } from '@studywidbuddy/shared';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ENV, Env } from './common/config/env';
import { SocketAdapter } from './realtime/socket-adapter';

/**
 * Everything that turns a Nest application into the StudywidBuddy API.
 * Shared by main.ts and the e2e tests so tests exercise the real pipeline.
 */
export function setupApp(app: INestApplication): INestApplication {
  const env = app.get<Env>(ENV);

  app.use(helmet());
  // GitHub webhook payloads (e.g. large pushes) can exceed the 100 kB default.
  (app as NestExpressApplication).useBodyParser('json', { limit: '2mb' });
  app.useWebSocketAdapter(new SocketAdapter(app, env.WEB_ORIGIN));
  app.use(cookieParser());
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', CSRF_HEADER],
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields
      forbidNonWhitelisted: true, // …and reject requests that send them (mass-assignment guard)
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('StudywidBuddy API')
      .setDescription('REST API. Errors are `{ error: { code, message, details? } }`.')
      .setVersion('1')
      .addBearerAuth()
      .addCookieAuth('sb_refresh')
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config));
  }
  return app;
}
