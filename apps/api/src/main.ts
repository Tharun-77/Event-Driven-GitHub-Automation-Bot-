import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
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
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

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

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
}

void bootstrap();
