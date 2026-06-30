import { AiService } from './ai.service';

function configWith(key: string | undefined) {
  return {
    get: (k: string) =>
      k === 'GROQ_API_KEY' ? key : k === 'GROQ_MODEL' ? 'test-model' : undefined,
  };
}

function groqResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200 },
  );
}

describe('AiService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns parsed triage on valid JSON content', async () => {
    const service = new AiService(configWith('key') as never);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        groqResponse(
          JSON.stringify({
            summary: 'login crash',
            suggestedLabel: 'bug',
            priority: 'high',
          }),
        ),
      );

    const result = await service.triage({ title: 'crash', body: 'on login' });

    expect(result).toEqual({
      summary: 'login crash',
      suggestedLabel: 'bug',
      priority: 'high',
    });
  });

  it('returns null on unparseable content (non-fatal)', async () => {
    const service = new AiService(configWith('key') as never);
    jest.spyOn(global, 'fetch').mockResolvedValue(groqResponse('not json'));

    expect(await service.triage({ title: 't', body: 'b' })).toBeNull();
  });

  it('returns null and does not call Groq when no API key is set', async () => {
    const service = new AiService(configWith(undefined) as never);
    const fetchSpy = jest.spyOn(global, 'fetch');

    expect(await service.triage({ title: 't', body: 'b' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
