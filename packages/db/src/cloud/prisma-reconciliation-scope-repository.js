export class PrismaReconciliationScopeRepository {
  #prisma;

  constructor({ prisma }) {
    if (!prisma?.providerConnection) throw new Error("A reconciliation scope client is required");
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

  async listAthleteIds(limit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error("Reconciliation athlete limit is invalid");
    if (!this.#prisma.athlete) return Object.freeze([]);
    const rows = await this.#prisma.athlete.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: limit });
    return Object.freeze(rows.map((row) => row.id));
  }
}
