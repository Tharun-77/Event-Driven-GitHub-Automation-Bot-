import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EVENTS_QUEUE_TOKEN } from '../src/queue/queue.constants';
import { QueueService } from '../src/queue/queue.service';
import { WebhooksModule } from '../src/webhooks/webhooks.module';

const SECRET = 'webhook-secret';
const sign = (body: string): string =>
  'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');

const payload = JSON.stringify({
  action: 'opened',
  repository: { id: 555 },
  issue: {
    number: 1,
    title: 'bug here',
    user: { login: 'octo' },
    html_url: 'http://x/1',
  },
});

describe('Webhooks (e2e)', () => {
  let app: INestApplication;
  const event = { findUnique: jest.fn(), create: jest.fn() };
  const repository = { findUnique: jest.fn() };
  const enqueueEvent = jest.fn();

  beforeAll(async () => {
    // Importing @prisma/client loads apps/api/.env into process.env, which
    // outranks ConfigModule `load`. Set the secret directly for a hermetic test.
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PrismaModule,
        WebhooksModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ event, repository })
      .overrideProvider(QueueService)
      .useValue({ enqueueEvent })
      .overrideProvider(EVENTS_QUEUE_TOKEN)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const send = (signature: string) =>
    request(app.getHttpServer())
      .post('/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-delivery', 'd1')
      .set('x-github-event', 'issues')
      .set('content-type', 'application/json')
      .send(payload);

  it('rejects an invalid signature with 401 and does not enqueue', async () => {
    await send('sha256=deadbeef').expect(401);
    expect(enqueueEvent).not.toHaveBeenCalled();
  });

  it('accepts a valid signature and enqueues exactly once', async () => {
    event.findUnique.mockResolvedValue(null);
    repository.findUnique.mockResolvedValue({ id: 'repo1' });
    event.create.mockResolvedValue({ id: 'e1' });

    await send(sign(payload))
      .expect(200)
      .expect((res) => expect(res.body.duplicate).toBe(false));

    expect(enqueueEvent).toHaveBeenCalledTimes(1);
    expect(enqueueEvent).toHaveBeenCalledWith('e1', 'd1');
  });

  it('treats a redelivered delivery id as a duplicate (processed once)', async () => {
    event.findUnique.mockResolvedValue({ id: 'e1', deliveryId: 'd1' });

    await send(sign(payload))
      .expect(200)
      .expect((res) => expect(res.body.duplicate).toBe(true));

    expect(event.create).not.toHaveBeenCalled();
    expect(enqueueEvent).not.toHaveBeenCalled();
  });
});
