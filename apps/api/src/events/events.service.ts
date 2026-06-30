import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recent events for repositories owned by the user (optionally one repo),
   * with their action logs. Ownership is enforced via the repository relation.
   * The full raw payload is intentionally excluded.
   */
  async listForUser(userId: string, repositoryId?: string) {
    return this.prisma.event.findMany({
      where: {
        repository: repositoryId ? { userId, id: repositoryId } : { userId },
      },
      select: {
        id: true,
        deliveryId: true,
        eventType: true,
        action: true,
        payloadSummary: true,
        status: true,
        attempts: true,
        aiTriage: true,
        error: true,
        receivedAt: true,
        processedAt: true,
        actionLogs: {
          select: {
            id: true,
            type: true,
            status: true,
            detail: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });
  }
}
