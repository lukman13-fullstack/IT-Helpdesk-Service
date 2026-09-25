const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.$executeRawUnsafe('DROP DATABASE IF EXISTS it_helpdesk');
  await prisma.$executeRawUnsafe('CREATE DATABASE it_helpdesk');
  console.log('Database dropped and recreated');
}
main().catch(console.error).finally(() => prisma.$disconnect());
