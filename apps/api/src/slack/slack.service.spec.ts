import { SlackService } from './slack.service';

describe('SlackService', () => {
  const config = {
    get: jest.fn().mockReturnValue('https://hooks.slack.com/services/x/y/z'),
  };
  let service: SlackService;

  beforeEach(() => {
    service = new SlackService(config as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts the message JSON to the webhook URL', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await service.notify({ text: 'hello' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/x/y/z',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws when Slack responds with a non-2xx status', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 500 }));

    await expect(service.notify({ text: 'hi' })).rejects.toThrow(/Slack/);
  });
});
