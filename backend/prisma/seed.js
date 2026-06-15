import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // create minimal users with non-sensitive placeholder passwords
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: await bcrypt.hash('password', 10),
      role: 'ADMIN'
    }
  });

  await prisma.user.upsert({
    where: { username: 'viewer' },
    update: {},
    create: {
      username: 'viewer',
      passwordHash: await bcrypt.hash('password', 10),
      role: 'VIEWER'
    }
  });

  // create 10 masked member records only (no real PII)
  for (let i = 1; i <= 10; i++) {
    const membershipNo = `REDACTED-${String(i).padStart(3, '0')}`;
    await prisma.member.upsert({
      where: { membershipNo },
      update: {},
      create: {
        membershipNo,
        nik: `REDACTED-${i}`,
        name: `REDACTED ${i}`,
        gender: i % 2 === 0 ? 'WANITA' : 'PRIA',
        primaryCuName: 'REDACTED CU',
        documents: JSON.stringify({}),
        benefits: {
          create: [
            {
              type: 'SIMPANAN',
              insuranceName: 'REDACTED',
              coverageAmount: 0,
              premium: 0,
              claimStatus: 'BELUM_DIAJUKAN'
            }
          ]
        }
      }
    });
  }

  console.log('Seed selesai: 10 masked members created');
}

main().finally(async () => prisma.$disconnect());
