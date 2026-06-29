import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { CookieOptions, Request, Response } from 'express';
import { AuthService, SessionUser } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtGuard } from './jwt.guard';

const STATE_COOKIE = 'gha_oauth_state';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get cookieName(): string {
    return this.config.get<string>('SESSION_COOKIE_NAME') ?? 'gha_session';
  }

  private get isProd(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /** Cross-site cookies in prod (Vercel UI -> Render API) need SameSite=None+Secure. */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isProd,
      sameSite: this.isProd ? 'none' : 'lax',
      path: '/',
    };
  }

  @Get('github/login')
  login(@Res() res: Response): void {
    const state = randomBytes(16).toString('hex');
    res.cookie(STATE_COOKIE, state, {
      ...this.cookieOptions(),
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(this.auth.buildAuthorizeUrl(state));
  }

  @Get('github/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const expected = (req.cookies as Record<string, string> | undefined)?.[
      STATE_COOKIE
    ];
    if (!code || !state || !expected || state !== expected) {
      throw new BadRequestException('Invalid OAuth state');
    }

    const { token } = await this.auth.handleCallback(code);
    res.clearCookie(STATE_COOKIE, this.cookieOptions());
    res.cookie(this.cookieName, token, {
      ...this.cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${this.config.get<string>('WEB_ORIGIN')}/dashboard`);
  }

  @Post('logout')
  logout(@Res() res: Response): void {
    res.clearCookie(this.cookieName, this.cookieOptions());
    res.json({ ok: true });
  }

  @Get('me')
  @UseGuards(JwtGuard)
  @ApiOkResponse({ description: 'The authenticated user.' })
  async me(@CurrentUser() userId: string): Promise<SessionUser> {
    const user = await this.auth.getUserById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
