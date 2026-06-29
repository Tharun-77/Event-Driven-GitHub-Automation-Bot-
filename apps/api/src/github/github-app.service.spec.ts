import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { GithubAppService } from './github-app.service';

describe('GithubAppService', () => {
  let service: GithubAppService;
  let publicKey: string;
  const appId = '123456';

  beforeAll(() => {
    const { publicKey: pub, privateKey: priv } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    publicKey = pub;
    const privateKeyBase64 = Buffer.from(priv).toString('base64');

    const config = {
      get: (key: string): string | undefined =>
        ({
          GITHUB_APP_ID: appId,
          GITHUB_APP_PRIVATE_KEY_BASE64: privateKeyBase64,
        })[key],
    } as unknown as ConfigService;

    service = new GithubAppService(config);
  });

  it('creates an RS256 App JWT signed with the private key', () => {
    const token = service.createAppJwt();
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
    }) as jwt.JwtPayload;

    expect(decoded.iss).toBe(appId);
    expect(decoded.exp).toBeGreaterThan(decoded.iat as number);
  });

  it('throws a clear error when required config is missing', () => {
    const emptyConfig = {
      get: (): string | undefined => undefined,
    } as unknown as ConfigService;
    const bare = new GithubAppService(emptyConfig);

    expect(() => bare.createAppJwt()).toThrow(/Missing required configuration/);
  });
});
