import { PrismaClient } from "@prisma/client";
import { PrismaIdentityRepository } from "../src/cloud/prisma-identity-repository.js";

const directUrl = process.env.DIRECT_URL?.trim();
if (!directUrl) throw new Error("DIRECT_URL is required for explicit owner provisioning");

const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });
try {
  const repository = new PrismaIdentityRepository({ prisma });
  await repository.provisionOwner({
    authSubject: process.env.RACEPREDICTOR_OWNER_AUTH_SUBJECT,
    athleteId: process.env.RACEPREDICTOR_OWNER_ATHLETE_ID,
    displayName: process.env.RACEPREDICTOR_OWNER_DISPLAY_NAME,
  });
  console.log("RacePredictor owner identity provisioned.");
} finally {
  await prisma.$disconnect();
}
