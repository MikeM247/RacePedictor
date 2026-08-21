export class PrismaReconciliationScopeRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.providerConnection) throw new Error("A Prisma provider connection client is required");
    this.#prisma = prisma;
  }

  async listConnectedAthleteIds(limit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error("Reconciliation athlete limit is invalid");
    const rows = await this.#prisma.providerConnection.findMany({
      where: { provider: "strava", status: "connected" },
      select: { athleteId: true },
      orderBy: { athleteId: "asc" },
      take: limit,
    });
    return Object.freeze(rows.map((row) => row.athleteId));
  }
}
