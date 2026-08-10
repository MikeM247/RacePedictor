import { PrismaClient } from "@prisma/client";
import { normalizeImportBatch } from "./normalize.js";

const parseArgs = (argv) => {
  const args = { importId: null, cursor: null, batchSize: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--importId") {
      args.importId = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--cursor") {
      args.cursor = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--batchSize") {
      args.batchSize = argv[i + 1] ?? undefined;
      i += 1;
    }
  }
  return args;
};

const main = async () => {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.importId) {
    throw new Error("Missing required --importId argument");
  }

  const prisma = new PrismaClient();
  try {
    const result = await normalizeImportBatch(
      {
        importId: parsed.importId,
        cursor: parsed.cursor,
        batchSize: parsed.batchSize,
      },
      prisma,
    );
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unexpected normalize error";
  console.error(message);
  process.exit(1);
});
