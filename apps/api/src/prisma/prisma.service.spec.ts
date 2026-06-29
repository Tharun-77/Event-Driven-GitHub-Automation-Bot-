import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('constructs and exposes the expected model delegates', () => {
    const service = new PrismaService();
    expect(service).toBeDefined();
    expect(service.user).toBeDefined();
    expect(service.installation).toBeDefined();
    expect(service.repository).toBeDefined();
    expect(service.rule).toBeDefined();
    expect(service.event).toBeDefined();
    expect(service.actionLog).toBeDefined();
    expect(typeof service.$connect).toBe('function');
    expect(typeof service.$disconnect).toBe('function');
  });
});
