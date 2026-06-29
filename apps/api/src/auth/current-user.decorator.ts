import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedRequest } from './jwt.guard';

/** Injects the authenticated user's id (set by JwtGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.userId;
  },
);
