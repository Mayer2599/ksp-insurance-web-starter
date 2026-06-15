import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { username: 'akib' },
    update: {},
    create: {
      username: 'akib',
      passwordHash: await bcrypt.hash('Akib_CUPK@2025', 10),
      role: 'CORPORATE'
    }
  });

  await prisma.user.upsert({
    where: { username: 'cupk' },
    update: {},
    create: {
      username: 'cupk',
      passwordHash: await bcrypt.hash('CUPK@2025', 10),
      role: 'PUSKOP'
    }
  });

  const member = await prisma.member.upsert({
    where: { membershipNo: '030003000346272' },
    update: {},
    create: {
      membershipNo: '030003000346272',
      nik: '9506010706820001',
      name: 'Gerry Benny Hasudungan',
      gender: 'PRIA',
      secondaryName: 'KSP CU PANCUR KASIH',
      primaryCuName: 'KSP CU PANCUR KASIH',
      documents: JSON.stringify({
        fotokopiKartuAnggota: false,
        kartuKeluarga: false,
        identitasPeserta: false,
        formulirCkaCup: false,
        suratSakitPuskesmas: false,
        suratKematian: false,
        suratKepolisian: false,
        suratKeteranganKronologis: false,
        suratKuasa: false,
        bukuTabungan: false
      }),
      benefits: {
        create: [
          {
            type: 'SOLDUKA',
            insuranceName: 'RAMAYANA',
            coverageAmount: 11000000,
            premium: 105000,
            claimStatus: 'BELUM_DIAJUKAN'
          }
        ]
      }
    }
  });

  await prisma.member.upsert({
    where: { membershipNo: '1204352203221101' },
    update: {},
    create: {
      membershipNo: '1204352203221101',
      nik: '6171011205800002',
      name: 'Dede Sanjaya',
      gender: 'PRIA',
      primaryCuName: 'KSP CU PANCUR KASIH',
      tpName: 'TP Siantan',
      documents: JSON.stringify({}),
      benefits: {
        create: [
          {
            type: 'PINJAMAN',
            insuranceName: 'RAMAYANA',
            coverageAmount: 25000000,
            premium: 190000,
            claimStatus: 'PENGAJUAN',
            submittedAtText: '25000000'
          },
          {
            type: 'SIMPANAN',
            insuranceName: 'RAMAYANA',
            coverageAmount: 5000000,
            premium: 35000
          }
        ]
      }
    }
  });

  await prisma.member.upsert({
    where: { membershipNo: '1204352203221123' },
    update: {},
    create: {
      membershipNo: '1204352203221123',
      nik: '6171011205820003',
      name: 'Kalis Agustin',
      gender: 'WANITA',
      primaryCuName: 'KSP CU BONAVENTURA',
      tpName: 'TP Pusat',
      documents: JSON.stringify({}),
      benefits: {
        create: [
          {
            type: 'SOLDUKA',
            insuranceName: 'RAMAYANA',
            coverageAmount: 11000000,
            premium: 105000
          }
        ]
      }
    }
  });

  console.log('Seed selesai:', member.membershipNo);
}

main().finally(async () => prisma.$disconnect());
