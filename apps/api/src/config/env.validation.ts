import { z } from 'zod';

/**
 * Environment schema. Grown incrementally per phase so the app can boot at each
 * stage without every secret being present yet. Required secrets are added as the
 * modules that need them land.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),

  // Session
  JWT_SECRET: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().default('gha_session'),

  // Redis (BullMQ queue)
  REDIS_URL: z.string().optional(),

  // GitHub App (one app: user OAuth sign-in + installation tokens).
  // Optional during local build; required at deploy. Services guard at call time.
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY_BASE64: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Used by ConfigModule.forRoot({ validate }). Fails fast with a readable message
 * if any required variable is missing or malformed.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
