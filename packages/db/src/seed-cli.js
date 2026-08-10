import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "./seed.js";

const prisma = new PrismaClient();

const run = async () => {
  const summary = await seedDatabase(prisma);
  console.log(JSON.stringify(summary, null, 2));
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });