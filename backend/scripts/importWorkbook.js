import 'dotenv/config';
import XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { prisma } from '../src/prisma.js';

const workbookPath = process.argv[2];
if (!workbookPath) {
  console.error('Pakai: npm run import:xlsb -- "D:/path/file.xlsb"');
  process.exit(1);
}

const DOCUMENT_COLUMNS = [
  ['AC', 'fotokopiKartuAnggota'],
  ['AD', 'kartuKeluarga'],
  ['AE', 'identitasPeserta'],
  ['AF', 'formulirCkaCup'],
  ['AG', 'suratSakitPuskesmas'],
  ['AH', 'suratKematian'],
  ['AI', 'suratKepolisian'],
  ['AJ', 'suratKeteranganKronologis'],
  ['AK', 'suratKuasa'],
  ['AL', 'bukuTabungan']
];

const DEATH_TYPE_TEXT = {
  'Meninggal Dunia Di Rumah': 'RUMAH',
  'Meninggal Dunia Di Rumah Sakit': 'RUMAH_SAKIT',
  'Meninggal Dunia karena Kecelakaan': 'KECELAKAAN'
};

const DECLARATION_COLUMNS = [
  ['A', 'no'],
  ['B', 'secondaryName'],
  ['C', 'primaryCuName'],
  ['D', 'tpName'],
  ['E', 'membershipNo'],
  ['F', 'nik'],
  ['G', 'name'],
  ['H', 'birthDate'],
  ['I', 'gender'],
  ['J', 'benefitName'],
  ['K', 'startDate'],
  ['L', 'endDate'],
  ['M', 'coverageAmount'],
  ['N', 'premium'],
  ['O', 'insuranceName'],
  ['P', 'infoDate'],
  ['Q', 'deathDate'],
  ['R', 'claimDate'],
  ['S', 'claimSubmitted'],
  ['T', 'claimAnalyzed'],
  ['U', 'claimPending'],
  ['V', 'claimRejected'],
  ['W', 'claimApproved'],
  ['X', 'claimPaid'],
  ['Y', 'approvedDate'],
  ['Z', 'paidDate'],
  ['AA', 'rejectionReason'],
  ['AB', 'deathTypeText'],
  ['AC', 'document1'],
  ['AD', 'document2'],
  ['AE', 'document3'],
  ['AF', 'document4'],
  ['AG', 'document5'],
  ['AH', 'document6'],
  ['AI', 'document7'],
  ['AJ', 'document8'],
  ['AK', 'document9'],
  ['AL', 'document10'],
  ['AM', 'extraAM'],
  ['AN', 'extraAN'],
  ['AO', 'extraAO'],
  ['AP', 'extraAP']
];

function colIndex(col) {
  return XLSX.utils.decode_col(col);
}

function cell(row, col) {
  return row[colIndex(col)];
}

function text(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function numberValue(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  return Number(String(value).replace(/[^0-9.-]/g, '')) || 0;
}

function dateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function rawValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return value === undefined ? null : value;
}

function sourceData(row, sourceRow) {
  const data = { sourceSheet: 'Deklarasi', sourceRow };
  for (const [col, key] of DECLARATION_COLUMNS) data[key] = rawValue(cell(row, col));
  return JSON.stringify(data);
}

function normalizeBenefit(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized.includes('PINJAMAN')) return 'PINJAMAN';
  if (normalized.includes('SIMPANAN')) return 'SIMPANAN';
  if (normalized.includes('SOLDUKA')) return 'SOLDUKA';
  return normalized || 'SOLDUKA';
}

function resolveClaimStatus(row) {
  if (text(cell(row, 'X'))) return 'DIBAYAR';
  if (text(cell(row, 'W'))) return 'DISETUJUI';
  if (text(cell(row, 'V'))) return 'DITOLAK';
  if (text(cell(row, 'U'))) return 'PENDING';
  if (text(cell(row, 'T'))) return 'ANALISA';
  if (text(cell(row, 'S'))) return 'PENGAJUAN';
  return 'BELUM_DIAJUKAN';
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function importUsers(userSheet) {
  if (!userSheet) return;
  const rows = XLSX.utils.sheet_to_json(userSheet, { header: 1, defval: '', blankrows: false });

  for (const row of rows.slice(1)) {
    const username = text(row[0]);
    const password = text(row[1]);
    if (!username || !password) continue;

    const role = username.toLowerCase() === 'akib'
      ? 'CORPORATE'
      : username.toLowerCase() === 'cupk'
        ? 'PUSKOP'
        : null;

    if (!role) continue;

    await prisma.user.upsert({
      where: { username: username.toLowerCase() },
      update: {
        passwordHash: await bcrypt.hash(password, 10),
        role
      },
      create: {
        username: username.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 10),
        role
      }
    });
  }
}

async function main() {
  console.log(`Membaca workbook: ${workbookPath}`);
  const workbook = XLSX.readFile(workbookPath, { cellDates: true });
  const deklarasi = workbook.Sheets.Deklarasi;
  if (!deklarasi) throw new Error('Sheet "Deklarasi" tidak ditemukan.');

  await importUsers(workbook.Sheets['User Login']);

  const rows = XLSX.utils.sheet_to_json(deklarasi, {
    header: 1,
    defval: '',
    blankrows: false,
    range: 6
  });

  const membersByNo = new Map();
  const benefits = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const sourceRow = index + 7;
    const membershipNo = text(cell(row, 'E'));
    if (!membershipNo) continue;
    const rowSourceData = sourceData(row, sourceRow);

    if (!membersByNo.has(membershipNo)) {
      const documents = {};
      for (const [col, key] of DOCUMENT_COLUMNS) {
        documents[key] = String(cell(row, col) || '').trim().toLowerCase() === 'lengkap';
      }

      const deathTypeText = text(cell(row, 'AB'));
      membersByNo.set(membershipNo, {
        id: randomUUID(),
        membershipNo,
        nik: text(cell(row, 'F')),
        name: text(cell(row, 'G')) || membershipNo,
        birthDate: dateValue(cell(row, 'H')),
        gender: text(cell(row, 'I')),
        secondaryName: text(cell(row, 'B')),
        primaryCuName: text(cell(row, 'C')),
        tpName: text(cell(row, 'D')),
        infoDate: dateValue(cell(row, 'P')),
        deathDate: dateValue(cell(row, 'Q')),
        claimDate: dateValue(cell(row, 'R')),
        deathType: DEATH_TYPE_TEXT[deathTypeText] || null,
        documents: JSON.stringify(documents),
        sourceData: rowSourceData
      });
    }

    const member = membersByNo.get(membershipNo);
    benefits.push({
      memberId: member.id,
      declarationNo: Number.isFinite(numberValue(cell(row, 'A'))) ? numberValue(cell(row, 'A')) : null,
      sourceRow,
      type: normalizeBenefit(cell(row, 'J')),
      insurerName: null,
      startDate: dateValue(cell(row, 'K')),
      endDate: dateValue(cell(row, 'L')),
      coverageAmount: numberValue(cell(row, 'M')),
      premium: numberValue(cell(row, 'N')),
      insuranceName: text(cell(row, 'O')),
      claimStatus: resolveClaimStatus(row),
      submittedAtText: text(cell(row, 'S')),
      analyzedAtText: text(cell(row, 'T')),
      pendingAtText: text(cell(row, 'U')),
      rejectedAtText: text(cell(row, 'V')),
      approvedAtText: text(cell(row, 'W')),
      paidAtText: text(cell(row, 'X')),
      approvedDate: dateValue(cell(row, 'Y')),
      paidDate: dateValue(cell(row, 'Z')),
      rejectionReason: text(cell(row, 'AA')),
      sourceData: rowSourceData
    });
  }

  console.log(`Menyiapkan import: ${membersByNo.size} anggota, ${benefits.length} benefit.`);
  console.log('Menghapus data deklarasi lama...');
  await prisma.auditLog.deleteMany();
  await prisma.benefit.deleteMany();
  await prisma.member.deleteMany();

  console.log('Menyimpan anggota...');
  for (const group of chunk([...membersByNo.values()], 1000)) {
    await prisma.member.createMany({ data: group });
  }

  console.log('Menyimpan benefit...');
  for (const group of chunk(benefits, 1000)) {
    await prisma.benefit.createMany({ data: group });
  }

  console.log(`Import selesai: ${membersByNo.size} anggota dan ${benefits.length} benefit.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
