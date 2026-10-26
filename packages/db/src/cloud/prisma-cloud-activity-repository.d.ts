export class PrismaCloudActivityRepository {
  constructor(args: { prisma: any });
  findById(scope: any, activityId: string): Promise<any>;
  currentRevision(scope: any, activityId: string): Promise<number>;
}
