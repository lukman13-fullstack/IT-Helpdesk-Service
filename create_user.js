const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const userRole = await prisma.role.findFirst({ where: { name: 'User' } });
  const hashedPassword = await bcrypt.hash('user123', 10);
  
  // Check if user already exists
  const exists = await prisma.user.findFirst({ where: { username: 'user' } });
  if (exists) {
    console.log('User already exists');
    return;
  }
  
  await prisma.user.create({
    data: {
      fullName: 'Karyawan Biasa',
      username: 'user',
      email: 'user@example.com',
      password: hashedPassword,
      roleId: userRole.id,
      position: 'Staff'
    }
  });
  console.log('User created');
}
main().finally(() => prisma.$disconnect());
