const authSubjectPattern = /^github:[1-9][0-9]{0,19}$/u;
const scopedIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/u;

function requireAuthSubject(value) {
  const subject = value?.trim();
  if (!subject || !authSubjectPattern.test(subject)) {
    throw new Error("Owner auth subject must be a stable GitHub subject");
  }
  return subject;
}

function requireAthleteId(value) {
  const athleteId = value?.trim();
  if (!athleteId || !scopedIdPattern.test(athleteId)) {
    throw new Error("Owner athlete id must be a stable scoped identifier");
  }
  return athleteId;
}

function identityEmail(authSubject) {
  return `${authSubject.replace(":", "-")}@identity.racepredictor.invalid`;
}

export class PrismaIdentityRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async findByAuthSubject(value) {
    const authSubject = requireAuthSubject(value);
    const user = await this.prisma.user.findUnique({
      where: { authSubject },
      select: {
        id: true,
        athleteAccess: {
          orderBy: { athleteId: "asc" },
          select: { athleteId: true },
        },
      },
    });
    if (!user || user.athleteAccess.length === 0) return null;
    return Object.freeze({
      userId: user.id,
      permittedAthleteIds: Object.freeze(user.athleteAccess.map((access) => access.athleteId)),
    });
  }

  async provisionOwner(input) {
    const authSubject = requireAuthSubject(input.authSubject);
    const athleteId = requireAthleteId(input.athleteId);
    const displayName = input.displayName?.trim().slice(0, 120) || null;

    return this.prisma.$transaction(async (transaction) => {
      await transaction.athlete.upsert({
        where: { id: athleteId },
        create: { id: athleteId, displayName },
        update: displayName ? { displayName } : {},
      });
      const user = await transaction.user.upsert({
        where: { authSubject },
        create: { authSubject, email: identityEmail(authSubject) },
        update: {},
        select: { id: true },
      });
      await transaction.athleteAccess.upsert({
        where: { userId_athleteId: { userId: user.id, athleteId } },
        create: { userId: user.id, athleteId, role: "owner" },
        update: { role: "owner" },
      });
      return Object.freeze({ userId: user.id, athleteId });
    });
  }
}
