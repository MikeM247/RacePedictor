export class PrismaActivityReviewRepository {
  constructor(args: { prisma: any });
  claim(scope: any, deviceId: string, limit?: number, activityId?: string | null, configuration?: any): Promise<{ items: Array<{ requestId: string; activityId: string; leaseToken: string; status: "processing"; provider?: "openai" | "openrouter"; requestedModel?: string | null; configurationRevision?: number | null; forceRegenerate?: boolean; expectedReviewRevision?: number | null }> }>;
  get(scope: any, activityId: string): Promise<any>;
  recordInputSnapshot(scope: any, requestId: string, deviceId: string, input: any): Promise<void>;
  recordProviderResult(scope: any, requestId: string, deviceId: string, metadata: any): Promise<void>;
  markFailure(scope: any, requestId: string, deviceId: string, code: string, retry?: boolean): Promise<void>;
  markReady(scope: any, requestId: string, deviceId: string): Promise<void>;
  publish(scope: any, artifact: any, deviceId: string): Promise<any>;
}
