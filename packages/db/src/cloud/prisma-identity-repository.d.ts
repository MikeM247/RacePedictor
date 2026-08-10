import type { IdentityRepository } from "../../../core/src/ports/cloud-sync.ts";

export class PrismaIdentityRepository implements IdentityRepository {
  constructor(input: { prisma: unknown });
  findByAuthSubject: IdentityRepository["findByAuthSubject"];
  provisionOwner(input: {
    authSubject: string;
    athleteId: string;
    displayName?: string | null;
  }): Promise<{ userId: string; athleteId: string }>;
}
