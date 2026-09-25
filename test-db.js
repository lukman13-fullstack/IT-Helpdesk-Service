const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('Successfully connected to the database!');
    
    // Check if the user table exists by querying it
    const users = await prisma.user.findMany({ take: 1 });
    console.log('User table exists, found users:', users.length);
  } catch (e) {
    console.error('Error connecting to database:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
