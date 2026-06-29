import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { GithubAppService } from '../src/github/github-app.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_SECRET: 'test-secret',
              SESSION_COOKIE_NAME: 'gha_session',
              WEB_ORIGIN: 'http://localhost:3000',
              API_BASE_URL: 'http://localhost:4000',
              GITHUB_APP_CLIENT_ID: 'Iv1.test',
            }),
          ],
        }),
        PrismaModule,
        AuthModule,
      ],
    })
      .overrideProvider(GithubAppService)
      .useValue({})
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/me without a session cookie returns 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/github/login redirects to the GitHub authorize URL', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/github/login')
      .expect(302);
    expect(res.headers.location).toContain('github.com/login/oauth/authorize');
    expect(res.headers.location).toContain('client_id=Iv1.test');
  });
});
