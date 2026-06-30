import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Rule } from '@prisma/client';
import { AiService, Triage } from '../ai/ai.service';
import { EventsEmitter } from '../events/events.emitter';
import { GithubWritebackService } from '../github/github-writeback.service';
import { extractFields, ruleMatches } from '../rules/rule-matcher';
import { RuleActions } from '../rules/rule.types';
import { SlackService } from '../slack/slack.service';
import { PrismaService } from '../prisma/prisma.service';

interface ProcessPayload {
  issue?: { number?: number };
  pull_request?: { number?: number };
  [key: string]: unknown;
}

interface ActionContext {
  installationId: number;
  fullName: string;
  eventType: string;
  title: string;
  issueNumber: number | null;
  triage: Triage | null;
}

@Injectable()
export class EventProcessor {
  private readonly logger = new Logger(EventProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly writeback: GithubWritebackService,
    private readonly slack: SlackService,
    private readonly emitter: EventsEmitter,
    private readonly ai: AiService,
  ) {}

  /**
   * Processes one event: evaluate rules, run their actions idempotently, and
   * mark the event done. Throws on failure so BullMQ retries; the worker marks
   * the event dead_letter once retries are exhausted.
   */
  async process(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { repository: { include: { installation: true } } },
    });
    if (!event) {
      this.logger.warn(`Event ${eventId} not found; skipping`);
      return;
    }

    await this.prisma.event.update({
      where: { id: eventId },
      data: { status: 'processing', attempts: { increment: 1 } },
    });
    this.emitter.emitChange(eventId);

    try {
      const payload = event.payload as ProcessPayload;
      const fields = extractFields(event.eventType, payload);

      const triage = await this.runTriage(
        eventId,
        event.eventType,
        event.aiTriage as Triage | null,
        fields,
      );

      const repo = event.repository;
      if (repo?.installation) {
        const rules = await this.prisma.rule.findMany({
          where: { repositoryId: repo.id, enabled: true },
        });
        const matched = rules.filter((r) =>
          ruleMatches(r, event.eventType, fields),
        );
        if (matched.length > 0) {
          await this.runActions(event.id, matched, {
            installationId: Number(repo.installation.githubInstallationId),
            fullName: repo.fullName,
            eventType: event.eventType,
            title: fields.title,
            issueNumber: this.issueNumber(event.eventType, payload),
            triage,
          });
        }
      }

      await this.prisma.event.update({
        where: { id: eventId },
        data: { status: 'done', processedAt: new Date(), error: null },
      });
      this.emitter.emitChange(eventId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.event.update({
        where: { id: eventId },
        data: { status: 'failed', error: message },
      });
      this.emitter.emitChange(eventId);
      throw err;
    }
  }

  private async runActions(
    eventId: string,
    rules: Rule[],
    ctx: ActionContext,
  ): Promise<void> {
    // Build the set of actions already completed (idempotency across retries).
    const prior = await this.prisma.actionLog.findMany({
      where: { eventId, status: 'success' },
    });
    const done = new Set(
      prior.map((l) =>
        this.key(l.type, (l.detail as { dedupeKey?: string })?.dedupeKey),
      ),
    );
    const [owner, repoName] = ctx.fullName.split('/');

    for (const rule of rules) {
      const actions = rule.actions as RuleActions;

      if (actions.addLabel && actions.labelName && ctx.issueNumber) {
        const label = actions.labelName;
        await this.once(
          eventId,
          'label_added',
          label,
          done,
          { rule: rule.id, label },
          () =>
            this.writeback.addLabel(
              ctx.installationId,
              owner,
              repoName,
              ctx.issueNumber as number,
              label,
            ),
        );
      }

      if (actions.postComment && actions.commentBody && ctx.issueNumber) {
        const body = actions.commentBody;
        await this.once(
          eventId,
          'comment_posted',
          rule.id,
          done,
          { rule: rule.id },
          () =>
            this.writeback.postComment(
              ctx.installationId,
              owner,
              repoName,
              ctx.issueNumber as number,
              body,
            ),
        );
      }

      if (actions.slackNotify) {
        await this.once(
          eventId,
          'slack_sent',
          rule.id,
          done,
          { rule: rule.id },
          () => this.slack.notify({ text: this.slackText(ctx, rule.name) }),
        );
      }
    }
  }

  /** Runs an action once: skips if already succeeded, records success/failure. */
  private async once(
    eventId: string,
    type: string,
    dedupeKey: string,
    done: Set<string>,
    detail: Record<string, unknown>,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (done.has(this.key(type, dedupeKey))) {
      return;
    }
    try {
      await fn();
      await this.prisma.actionLog.create({
        data: {
          eventId,
          type,
          status: 'success',
          detail: { ...detail, dedupeKey },
        },
      });
      done.add(this.key(type, dedupeKey));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.actionLog.create({
        data: {
          eventId,
          type,
          status: 'failed',
          detail: { ...detail, dedupeKey, error: message },
        },
      });
      throw err;
    }
  }

  private key(type: string, dedupeKey?: string): string {
    return `${type}:${dedupeKey ?? ''}`;
  }

  private issueNumber(
    eventType: string,
    payload: ProcessPayload,
  ): number | null {
    if (eventType === 'issues') {
      return payload.issue?.number ?? null;
    }
    if (eventType === 'pull_request') {
      return payload.pull_request?.number ?? null;
    }
    return null;
  }

  /**
   * Runs AI triage once per event (idempotent via the stored aiTriage), for
   * issues/PRs only. Non-fatal: a null result leaves the event untouched.
   */
  private async runTriage(
    eventId: string,
    eventType: string,
    existing: Triage | null,
    fields: { title: string; body: string },
  ): Promise<Triage | null> {
    if (existing) {
      return existing;
    }
    if (eventType !== 'issues' && eventType !== 'pull_request') {
      return null;
    }
    const triage = await this.ai.triage({
      title: fields.title,
      body: fields.body,
    });
    if (triage) {
      await this.prisma.event.update({
        where: { id: eventId },
        data: { aiTriage: triage as unknown as Prisma.InputJsonValue },
      });
      await this.prisma.actionLog.create({
        data: {
          eventId,
          type: 'ai_triage',
          status: 'success',
          detail: { ...triage },
        },
      });
      this.emitter.emitChange(eventId);
    }
    return triage;
  }

  private slackText(ctx: ActionContext, ruleName: string): string {
    const ai = ctx.triage
      ? `\nAI: ${ctx.triage.summary} (label: ${ctx.triage.suggestedLabel}, priority: ${ctx.triage.priority})`
      : '';
    return `:robot_face: *${ctx.eventType}* on \`${ctx.fullName}\`\n> ${ctx.title}\nMatched rule: *${ruleName}*${ai}`;
  }
}
