import 'dotenv/config';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const path = process.argv[2];
if (!path) {
  console.error('Pakai: npm run import:csv -- ./data/deklarasi.csv');
  process.exit(1);
}

function value(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && String(row[name]).trim() !== '') return String(row[name]).trim();
  }
  return null;
}

function numberValue(row, names) {
  const v = value(row, names);
  if (!v) return 0;
  return Number(String(v).replace(/[^0-9.-]/g, '')) || 0;
}

function normalizeBenefit(v) {
  const t = String(v || '').trim().toUpperCase();
  if (t.includes('PINJAMAN')) return 'PINJAMAN';
  if (t.includes('SIMPANAN')) return 'SIMPANAN';
  return 'SOLDUKA';
}

async function main() {
  const csv = fs.readFileSync(path, 'utf8');
  const rows = parse(csv, { columns: true, skip_empty_lines: true, bom: true });

  for (const row of rows) {
    const membershipNo = value(row, ['No. Keaggotaan Koperasi', 'No. Keanggotaan Koperasi', 'membershipNo']);
    if (!membershipNo) continue;

    const member = await prisma.member.upsert({
      where: { membershipNo },
      update: {
        nik: value(row, ['No NIK', 'NIK']),
        name: value(row, ['Nama Anggota', 'name']) || membershipNo,
        gender: value(row, ['Jenis Kelamin', 'gender']),
        secondaryName: value(row, ['Nama Sekunder']),
        primaryCuName: value(row, ['Nama CU Primer']),
        tpName: value(row, ['Nama TP'])
      },
      create: {
        membershipNo,
        nik: value(row, ['No NIK', 'NIK']),
        name: value(row, ['Nama Anggota', 'name']) || membershipNo,
        gender: value(row, ['Jenis Kelamin', 'gender']),
        secondaryName: value(row, ['Nama Sekunder']),
        primaryCuName: value(row, ['Nama CU Primer']),
        tpName: value(row, ['Nama TP'])
      }
    });

    await prisma.benefit.create({
      data: {
        memberId: member.id,
        type: normalizeBenefit(value(row, ['Nama Benefit', 'type'])),
        coverageAmount: numberValue(row, ['Uang Pertanggungan', 'coverageAmount']),
        premium: numberValue(row, ['Premi', 'premium']),
        insuranceName: value(row, ['Nama Asuransi']),
        submittedAtText: value(row, ['Klaim Pengajuan']),
        analyzedAtText: value(row, ['Klaim Analisa']),
        pendingAtText: value(row, ['Klaim Pending']),
        rejectedAtText: value(row, ['Klaim Ditolak']),
        approvedAtText: value(row, ['Klaim Disetujui']),
        paidAtText: value(row, ['Klaim Dibayar']),
        claimStatus: 'BELUM_DIAJUKAN'
      }
    });
  }

  console.log(`Import selesai: ${rows.length} baris diproses.`);
}

main().finally(async () => prisma.$disconnect());
