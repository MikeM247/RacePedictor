import { PrismaClient } from "@prisma/client";
import { runContractReadinessValidation } from "../src/contracts-readiness.ts";

const prisma = new PrismaClient();

const run = async () => {
  const summary = await runContractReadinessValidation(prisma);

  for (const area of summary.areas) {
    const marker = area.passed ? "PASS" : "FAIL";
    const checkCount = area.checks.length;
    console.log(`[${marker}] ${area.area} (${checkCount} checks)`);
    for (const check of area.checks) {
      if (!check.passed) {
        for (const error of check.errors) {
          console.log(`  - ${check.name} :: ${error.path} :: ${error.message}`);
        }
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.passed) {
    process.exitCode = 1;
    return;
  }

  console.log("DB5_CONTRACT_READINESS=PASS");
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
