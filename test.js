const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const tables = await prisma.$queryRawUnsafe('SHOW TABLES');
  console.log("TABLES IN DATABASE:");
  console.log(tables.map(t => Object.values(t)[0]).join(', '));
}
main().finally(() => prisma.$disconnect());
