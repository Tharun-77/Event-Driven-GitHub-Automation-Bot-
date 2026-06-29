import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from './auth.service';

export interface AuthedRequest extends Request {
  userId: string;
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const cookieName =
      this.config.get<string>('SESSION_COOKIE_NAME') ?? 'gha_session';
    const token = (req.cookies as Record<string, string> | undefined)?.[
      cookieName
    ];
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }
    try {
      req.userId = this.auth.verifyJwt(token).sub;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
  }
}
