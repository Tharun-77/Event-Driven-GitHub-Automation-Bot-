import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { SetActiveDto } from './dto/set-active.dto';
import { RepoDto, RepositoriesService } from './repositories.service';

@ApiTags('repositories')
@Controller('repositories')
@UseGuards(JwtGuard)
export class RepositoriesController {
  constructor(
    private readonly repos: RepositoriesService,
    private readonly config: ConfigService,
  ) {}

  @Get('install-url')
  installUrl(): { url: string } {
    return this.repos.getInstallUrl();
  }

  /** GitHub redirects here (Setup URL) after the App is installed/updated. */
  @Get('setup/callback')
  async setupCallback(
    @CurrentUser() userId: string,
    @Query('installation_id') installationId: string,
    @Res() res: Response,
  ): Promise<void> {
    if (installationId) {
      await this.repos.handleSetup(userId, Number(installationId));
    }
    res.redirect(`${this.config.get<string>('WEB_ORIGIN')}/dashboard`);
  }

  @Get()
  list(@CurrentUser() userId: string): Promise<RepoDto[]> {
    return this.repos.listForUser(userId);
  }

  @Patch(':id')
  setActive(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
  ): Promise<RepoDto> {
    return this.repos.setActive(userId, id, dto.active);
  }
}
