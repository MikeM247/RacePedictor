import assert from "node:assert/strict";
import test from "node:test";
import { PrismaIdentityRepository } from "../src/cloud/prisma-identity-repository.js";

test("identity lookup returns only the persisted user and sorted athlete scopes", async () => {
  const calls = [];
  const repository = new PrismaIdentityRepository({
    prisma: {
      user: {
        async findUnique(input) {
          calls.push(input);
          return {
            id: "user_owner",
            athleteAccess: [{ athleteId: "athlete_001" }, { athleteId: "athlete_002" }],
          };
        },
      },
    },
  });

  assert.deepEqual(await repository.findByAuthSubject("github:59341274"), {
    userId: "user_owner",
    permittedAthleteIds: ["athlete_001", "athlete_002"],
  });
  assert.deepEqual(calls[0], {
    where: { authSubject: "github:59341274" },
    select: {
      id: true,
      athleteAccess: {
        orderBy: { athleteId: "asc" },
        select: { athleteId: true },
      },
    },
  });
});

test("identity lookup fails closed for unknown users, missing access, and malformed subjects", async () => {
  let result = null;
  const repository = new PrismaIdentityRepository({
    prisma: { user: { findUnique: async () => result } },
  });

  assert.equal(await repository.findByAuthSubject("github:59341274"), null);
  result = { id: "user_owner", athleteAccess: [] };
  assert.equal(await repository.findByAuthSubject("github:59341274"), null);
  await assert.rejects(repository.findByAuthSubject("github:attacker"), /stable GitHub subject/);
});

test("owner provisioning is explicit, transactional, idempotent, and grants only one athlete scope", async () => {
  const operations = [];
  const transaction = {
    athlete: { upsert: async (input) => operations.push(["athlete", input]) },
    user: {
      async upsert(input) {
        operations.push(["user", input]);
        return { id: "user_owner" };
      },
    },
    athleteAccess: { upsert: async (input) => operations.push(["access", input]) },
  };
  const repository = new PrismaIdentityRepository({
    prisma: { $transaction: (operation) => operation(transaction) },
  });

  assert.deepEqual(await repository.provisionOwner({
    authSubject: "github:59341274",
    athleteId: "athlete_001",
    displayName: "RacePredictor owner",
  }), { userId: "user_owner", athleteId: "athlete_001" });

  assert.equal(operations.length, 3);
  assert.deepEqual(operations[0], ["athlete", {
    where: { id: "athlete_001" },
    create: { id: "athlete_001", displayName: "RacePredictor owner" },
    update: { displayName: "RacePredictor owner" },
  }]);
  assert.equal(operations[1][1].create.email, "github-59341274@identity.racepredictor.invalid");
  assert.deepEqual(operations[2], ["access", {
    where: { userId_athleteId: { userId: "user_owner", athleteId: "athlete_001" } },
    create: { userId: "user_owner", athleteId: "athlete_001", role: "owner" },
    update: { role: "owner" },
  }]);
});
