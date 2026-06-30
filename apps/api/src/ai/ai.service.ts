import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const triageSchema = z.object({
  summary: z.string(),
  suggestedLabel: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
});

export type Triage = z.infer<typeof triageSchema>;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Summarizes and triages an issue/PR via Groq. Returns null on any failure
   * (missing key, HTTP error, bad JSON) so the worker degrades gracefully and
   * still performs labels/comments/Slack without AI.
   */
  async triage(input: {
    title: string;
    body: string;
  }): Promise<Triage | null> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      return null;
    }
    const model =
      this.config.get<string>('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You triage GitHub issues and pull requests. Respond ONLY with ' +
                'JSON of the form {"summary": string (<=200 chars), ' +
                '"suggestedLabel": string, "priority": "low"|"medium"|"high"}.',
            },
            {
              role: 'user',
              content: `Title: ${input.title}\n\nBody: ${input.body || '(no body)'}`,
            },
          ],
        }),
      });

      if (!res.ok) {
        this.logger.warn(`Groq returned ${res.status}`);
        return null;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return null;
      }

      const parsed = triageSchema.safeParse(JSON.parse(content));
      return parsed.success ? parsed.data : null;
    } catch (err) {
      this.logger.warn(`AI triage failed: ${String(err)}`);
      return null;
    }
  }
}
