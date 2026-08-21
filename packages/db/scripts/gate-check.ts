import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { runContractReadinessValidation } from "../src/contracts-readiness.ts";
import { runIntegrityAndOperationalGate } from "../src/integrity-gate.ts";
import { seedDatabase } from "../src/seed.js";

type GateIssue = {
  path: string;
  message: string;
};

type GateCheck = {
  name: string;
  critical: boolean;
  passed: boolean;
  issues: GateIssue[];
};

type GateArea = {
  area: string;
  passed: boolean;
  checks: GateCheck[];
  sample?: Record<string, string | number | boolean | null>;
};

type Db6GateSummary = {
  gate: "DB-6";
  schema: string;
  timestamp: string;
  passed: boolean;
  areas: GateArea[];
  criticalFailures: Array<{
    area: string;
    check: string;
    path: string;
    message: string;
  }>;
};

const buildDisposableSchemaName = () => {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const random = Math.random().toString(36).slice(2, 8);
  return `db6_gate_${stamp}_${random}`;
};

const withSchema = (databaseUrl: string, schema: string) => {
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
};

const runPrismaCommand = (name: string, command: string, env: NodeJS.ProcessEnv, critical = true): GateCheck => {
  try {
    execSync(command, {
      cwd: process.cwd(),
      env,
      shell: true,
      stdio: "pipe",
      encoding: "utf8",
    });
    return {
      name,
      critical,
      passed: true,
      issues: [],
    };
  } catch (error) {
    const issue = (() => {
      if (error && typeof error === "object") {
        const fromMessage = "message" in error && typeof error.message === "string" ? error.message : "";
        const stderr =
          "stderr" in error && typeof error.stderr === "string" && error.stderr.length > 0
            ? error.stderr
            : "No stderr output";
        return `${fromMessage}${stderr ? ` | ${stderr}` : ""}`.trim().slice(0, 1200);
      }
      return "Unknown prisma command failure";
    })();
    return {
      name,
      critical,
      passed: false,
      issues: [{ path: "<command>", message: issue }],
    };
  }
};

const printArea = (area: GateArea) => {
  const marker = area.passed ? "PASS" : "FAIL";
  console.log(`[${marker}] ${area.area} (${area.checks.length} checks)`);
  for (const check of area.checks) {
    if (!check.passed) {
      for (const issue of check.issues) {
        console.log(`  - ${check.name} :: ${issue.path} :: ${issue.message}`);
      }
    }
  }
};

const run = async () => {
  const baseDatabaseUrl = process.env.DATABASE_URL;
  if (!baseDatabaseUrl) {
    console.error("DATABASE_URL is required for DB-6 gate");
    process.exitCode = 1;
    return;
  }

  const disposableSchema = buildDisposableSchemaName();
  const disposableDatabaseUrl = withSchema(baseDatabaseUrl, disposableSchema);
  const commandEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: disposableDatabaseUrl,
    DIRECT_URL: disposableDatabaseUrl,
  };

  const lifecycleChecks: GateCheck[] = [
    runPrismaCommand(
      "prisma migrate reset --force --skip-generate --skip-seed",
      "npx prisma migrate reset --force --skip-generate --skip-seed --schema prisma/schema.prisma",
      commandEnv,
      true,
    ),
    runPrismaCommand(
      "prisma migrate deploy",
      "npx prisma migrate deploy --schema prisma/schema.prisma",
      commandEnv,
      true,
    ),
    runPrismaCommand(
      "prisma migrate status",
      "npx prisma migrate status --schema prisma/schema.prisma",
      commandEnv,
      true,
    ),
  ];

  const lifecycleArea: GateArea = {
    area: "migration_lifecycle",
    passed: lifecycleChecks.every((check) => check.passed),
    checks: lifecycleChecks,
    sample: {
      schema: disposableSchema,
    },
  };

  const areas: GateArea[] = [lifecycleArea];
  const criticalFailures: Db6GateSummary["criticalFailures"] = [];

  const pushCriticalFailures = (area: GateArea) => {
    for (const check of area.checks) {
      if (!check.passed && check.critical) {
        for (const issue of check.issues) {
          criticalFailures.push({
            area: area.area,
            check: check.name,
            path: issue.path,
            message: issue.message,
          });
        }
      }
    }
  };

  pushCriticalFailures(lifecycleArea);

  let prisma: PrismaClient | null = null;

  if (criticalFailures.length === 0) {
    prisma = new PrismaClient({
      datasources: { db: { url: disposableDatabaseUrl } },
    });

    await seedDatabase(prisma);
    const contractSummary = await runContractReadinessValidation(prisma);
    const contractArea: GateArea = {
      area: "contract_readiness",
      passed: contractSummary.passed,
      checks: [
        {
          name: "DB-5 contract readiness passes",
          critical: true,
          passed: contractSummary.passed,
          issues: contractSummary.failures.map((failure) => ({
            path: `${failure.area}.${failure.path}`,
            message: `${failure.check}: ${failure.message}`,
          })),
        },
      ],
      sample: {
        db5Areas: contractSummary.areas.length,
      },
    };
    areas.push(contractArea);
    pushCriticalFailures(contractArea);

    const integritySummary = await runIntegrityAndOperationalGate(prisma);
    areas.push(...integritySummary.areas);
    for (const failure of integritySummary.criticalFailures) {
      criticalFailures.push({
        area: failure.area,
        check: failure.check,
        path: failure.path,
        message: failure.message,
      });
    }
  }

  const summary: Db6GateSummary = {
    gate: "DB-6",
    schema: disposableSchema,
    timestamp: new Date().toISOString(),
    passed: criticalFailures.length === 0,
    areas,
    criticalFailures,
  };

  for (const area of areas) {
    printArea(area);
  }

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.passed) {
    process.exitCode = 1;
  } else {
    console.log("DB6_INTEGRITY_OPERATIONAL_GATE=PASS");
  }

  if (prisma) {
    await prisma.$disconnect();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
