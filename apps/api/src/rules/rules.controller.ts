import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RulesService } from './rules.service';

@ApiTags('rules')
@Controller('repositories/:repoId/rules')
@UseGuards(JwtGuard)
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  list(@CurrentUser() userId: string, @Param('repoId') repoId: string) {
    return this.rules.listForRepo(userId, repoId);
  }

  @Post()
  create(
    @CurrentUser() userId: string,
    @Param('repoId') repoId: string,
    @Body() dto: CreateRuleDto,
  ) {
    return this.rules.create(userId, repoId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.rules.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.rules.remove(userId, id);
  }
}
