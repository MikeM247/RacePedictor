export class PrismaCalendarSessionAmendmentRepository {
  constructor(args: { prisma: any });
  listActiveCalendar(scope: any, range: { from: string; to: string }): Promise<any[]>;
}
