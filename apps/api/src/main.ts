import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

// GitHub numeric IDs are stored as BigInt; make them JSON-serializable as strings
// so any response containing them does not throw "Do not know how to serialize a BigInt".
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  // rawBody: true exposes req.rawBody for webhook HMAC verification.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Behind Render's proxy; required for Secure cookies to be honored.
  app.set('trust proxy', 1);

  // Helmet for security headers. CSP is disabled so the Swagger UI loads; the API
  // serves JSON, not user-facing HTML, so CSP adds little here.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GitHub Automation Bot API')
    .setDescription(
      'Event-driven GitHub automation: webhooks, write-back, Slack, AI triage.',
    )
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  app.enableShutdownHooks();

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
}

void bootstrap();
