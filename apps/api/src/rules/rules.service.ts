import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForRepo(userId: string, repoId: string) {
    await this.assertRepoOwned(userId, repoId);
    return this.prisma.rule.findMany({
      where: { repositoryId: repoId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, repoId: string, dto: CreateRuleDto) {
    await this.assertRepoOwned(userId, repoId);
    return this.prisma.rule.create({
      data: {
        repositoryId: repoId,
        name: dto.name,
        eventType: dto.eventType,
        matchField: dto.matchField,
        matchOp: dto.matchOp,
        matchValue: dto.matchValue,
        actions: dto.actions as unknown as Prisma.InputJsonValue,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async update(userId: string, ruleId: string, dto: UpdateRuleDto) {
    await this.assertRuleOwned(userId, ruleId);
    const data: Prisma.RuleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.eventType !== undefined) data.eventType = dto.eventType;
    if (dto.matchField !== undefined) data.matchField = dto.matchField;
    if (dto.matchOp !== undefined) data.matchOp = dto.matchOp;
    if (dto.matchValue !== undefined) data.matchValue = dto.matchValue;
    if (dto.actions !== undefined) {
      data.actions = dto.actions as unknown as Prisma.InputJsonValue;
    }
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    return this.prisma.rule.update({ where: { id: ruleId }, data });
  }

  async remove(userId: string, ruleId: string): Promise<{ ok: true }> {
    await this.assertRuleOwned(userId, ruleId);
    await this.prisma.rule.delete({ where: { id: ruleId } });
    return { ok: true };
  }

  private async assertRepoOwned(userId: string, repoId: string): Promise<void> {
    const repo = await this.prisma.repository.findUnique({
      where: { id: repoId },
      select: { userId: true },
    });
    if (!repo) {
      throw new NotFoundException('Repository not found');
    }
    if (repo.userId !== userId) {
      throw new ForbiddenException();
    }
  }

  private async assertRuleOwned(userId: string, ruleId: string): Promise<void> {
    const rule = await this.prisma.rule.findUnique({
      where: { id: ruleId },
      select: { repository: { select: { userId: true } } },
    });
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    if (rule.repository.userId !== userId) {
      throw new ForbiddenException();
    }
  }
}
