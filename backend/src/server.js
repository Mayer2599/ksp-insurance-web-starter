import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import XLSX from 'xlsx';
import { prisma } from './prisma.js';
import { requireAuth, requireCorporate, signToken } from './auth.js';

const app = express();
const allowedOrigin = process.env.FRONTEND_ORIGIN || /^http:\/\/localhost:517\d$/;
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

const cache = new Map();
const loginAttempts = new Map();
const dashboardCacheFile = path.resolve(process.cwd(), 'prisma', 'dashboard-cache.json');

function getCache(key) {
  const item = cache.get(key);
  if (!item || item.expiresAt < Date.now()) return null;
  return item.value;
}

function setCache(key, value, ttlMs = 5 * 60 * 1000) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function clearDashboardCache() {
  for (const key of cache.keys()) {
    if (key.startsWith('dashboard:') || key === 'companies' || key === 'dashboard:filters') cache.delete(key);
  }
}

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function stringifyAuditValue(value) {
  return value === undefined ? null : JSON.stringify(value);
}

function normalizeMember(member) {
  return member ? { ...member, documents: parseJsonObject(member.documents), sourceData: parseJsonObject(member.sourceData) } : member;
}

function normalizeMemberSummary(member) {
  if (!member) return member;
  const { documents, sourceData, ...summary } = member;
  return summary;
}

function normalizeSource(value) {
  return parseJsonObject(value);
}

function pagination(req, fallback = 25, max = 100) {
  const limit = Math.min(Math.max(Number(req.query.limit || fallback), 1), max);
  const page = Math.max(Number(req.query.page || 1), 1);
  return { limit, page, skip: (page - 1) * limit };
}

function resolveClaimStatus(data) {
  if (data.paidAtText) return 'DIBAYAR';
  if (data.approvedAtText) return 'DISETUJUI';
  if (data.rejectedAtText) return 'DITOLAK';
  if (data.pendingAtText) return 'PENDING';
  if (data.analyzedAtText) return 'ANALISA';
  if (data.submittedAtText) return 'PENGAJUAN';
  return 'BELUM_DIAJUKAN';
}

function numberFromDb(value) {
  return Number(value || 0);
}

function claimStatusFromPriority(priority) {
  return ['BELUM_DIAJUKAN', 'PENGAJUAN', 'ANALISA', 'PENDING', 'DITOLAK', 'DISETUJUI', 'DIBAYAR'][Number(priority || 0)] || 'BELUM_DIAJUKAN';
}

function memberSearchWhere(search, extraFields = []) {
  if (!search) return {};
  if (/^\d+$/.test(search)) {
    return { OR: [{ membershipNo: search }, { nik: search }] };
  }
  return {
    OR: [
      { membershipNo: { contains: search } },
      { nik: { contains: search } },
      { name: { contains: search } },
      ...extraFields.map((field) => ({ [field]: { contains: search } }))
    ]
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sendCsv(res, filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\uFEFF${csv}`);
}

function sendWorkbook(res, filename, sheetName, rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

function readDashboardDiskCache() {
  if (!fs.existsSync(dashboardCacheFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(dashboardCacheFile, 'utf8'));
  } catch {
    return null;
  }
}

function writeDashboardDiskCache(payload) {
  try {
    fs.mkdirSync(path.dirname(dashboardCacheFile), { recursive: true });
    fs.writeFileSync(dashboardCacheFile, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

async function claimExportRows(search) {
  const where = memberSearchWhere(search);
  const members = await prisma.member.findMany({
    where,
    select: {
      id: true,
      membershipNo: true,
      nik: true,
      name: true,
      primaryCuName: true,
      tpName: true,
      updatedAt: true
    },
    orderBy: { updatedAt: 'desc' },
    take: 5000
  });

  const memberIds = members.map((member) => member.id);
  const benefitTotals = memberIds.length
    ? await prisma.benefit.groupBy({
        by: ['memberId'],
        where: { memberId: { in: memberIds } },
        _count: true,
        _sum: { coverageAmount: true, premium: true }
      })
    : [];
  const totalsByMember = new Map(benefitTotals.map((row) => [row.memberId, row]));

  return [
    ['No Anggota', 'NIK', 'Pemegang Polis', 'CU Primer', 'TP', 'Jumlah Benefit', 'Total UP', 'Total Premi', 'Update Terakhir'],
    ...members.map((member) => {
      const totals = totalsByMember.get(member.id);
      return [
        member.membershipNo,
        member.nik,
        member.name,
        member.primaryCuName,
        member.tpName,
        totals?._count || 0,
        totals?._sum.coverageAmount || 0,
        totals?._sum.premium || 0,
        member.updatedAt?.toISOString()
      ];
    })
  ];
}

async function policyExportRows(search) {
  const where = search
    ? {
        OR: [
          { type: { contains: search } },
          { insuranceName: { contains: search } },
          { member: { is: { membershipNo: { contains: search } } } },
          { member: { is: { name: { contains: search } } } }
        ]
      }
    : {};

  const policies = await prisma.benefit.findMany({
    where,
    include: { member: true },
    orderBy: [{ updatedAt: 'desc' }],
    take: 10000
  });

  return [
    ['No Anggota', 'Pemegang Polis', 'CU Primer', 'Benefit', 'Asuransi', 'Tanggal Mulai', 'Tanggal Berakhir', 'UP', 'Premi', 'Status Klaim'],
    ...policies.map((benefit) => [
      benefit.member.membershipNo,
      benefit.member.name,
      benefit.member.primaryCuName,
      benefit.type,
      benefit.insuranceName,
      benefit.startDate?.toISOString().slice(0, 10),
      benefit.endDate?.toISOString().slice(0, 10),
      benefit.coverageAmount,
      benefit.premium,
      benefit.claimStatus
    ])
  ];
}

function excelFilters(req) {
  return {
    primaryCuName: String(req.query.primaryCuName || '').trim(),
    tpName: String(req.query.tpName || '').trim(),
    type: String(req.query.type || '').trim()
  };
}

function dashboardWhere(filters) {
  const clauses = [];
  const values = [];
  if (filters.primaryCuName) {
    clauses.push('Member.primaryCuName = ?');
    values.push(filters.primaryCuName);
  }
  if (filters.tpName) {
    clauses.push('Member.tpName = ?');
    values.push(filters.tpName);
  }
  if (filters.type) {
    clauses.push('Benefit.type = ?');
    values.push(filters.type);
  }
  return { whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

function dashboardBenefitWhere(filters) {
  const clauses = [];
  const values = [];
  if (filters.type) {
    clauses.push('Benefit.type = ?');
    values.push(filters.type);
  }
  return { whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

function filteredMemberWhere(filters) {
  const AND = [];
  if (filters.primaryCuName) AND.push({ primaryCuName: filters.primaryCuName });
  if (filters.tpName) AND.push({ tpName: filters.tpName });
  if (filters.type) AND.push({ benefits: { some: { type: filters.type } } });
  return AND.length ? { AND } : {};
}

function filteredBenefitWhere(filters) {
  const AND = [];
  if (filters.type) AND.push({ type: filters.type });
  if (filters.primaryCuName) AND.push({ member: { is: { primaryCuName: filters.primaryCuName } } });
  if (filters.tpName) AND.push({ member: { is: { tpName: filters.tpName } } });
  return AND.length ? { AND } : {};
}

function loginBucketKey(req, username) {
  return `${req.ip || req.socket.remoteAddress || 'local'}:${username}`;
}

function checkLoginLimit(req, username) {
  const key = loginBucketKey(req, username);
  const now = Date.now();
  const item = loginAttempts.get(key);
  if (!item || item.expiresAt < now) {
    loginAttempts.set(key, { count: 0, expiresAt: now + 15 * 60 * 1000 });
    return true;
  }
  return item.count < 5;
}

function recordLoginFailure(req, username) {
  const key = loginBucketKey(req, username);
  const now = Date.now();
  const item = loginAttempts.get(key) || { count: 0, expiresAt: now + 15 * 60 * 1000 };
  loginAttempts.set(key, { count: item.count + 1, expiresAt: item.expiresAt });
}

function clearLoginFailures(req, username) {
  loginAttempts.delete(loginBucketKey(req, username));
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Username dan password wajib diisi.' });

  const username = parsed.data.username.trim().toLowerCase();
  if (!checkLoginLimit(req, username)) {
    return res.status(429).json({ message: 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    recordLoginFailure(req, username);
    return res.status(401).json({ message: 'Login ditolak. Username tidak ditemukan.' });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    recordLoginFailure(req, username);
    return res.status(401).json({ message: 'Login ditolak. Password salah.' });
  }

  clearLoginFailures(req, username);
  res.json({
    token: signToken(user),
    user: { username: user.username, role: user.role }
  });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.get('/api/dashboard/summary', requireAuth, async (req, res) => {
  const filters = excelFilters(req);
  const cacheKey = `dashboard:summary:${JSON.stringify(filters)}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  if (!filters.primaryCuName && !filters.tpName && !filters.type) {
    const disk = readDashboardDiskCache();
    if (disk?.summary) {
      setCache(cacheKey, disk.summary, 30 * 60 * 1000);
      return res.json(disk.summary);
    }
  }

  const memberWhere = filteredMemberWhere(filters);
  const benefitWhere = filteredBenefitWhere(filters);
  const [members, benefits, byStatus, byType, byInsurer] = await Promise.all([
    prisma.member.count({ where: memberWhere }),
    prisma.benefit.count({ where: benefitWhere }),
    prisma.benefit.groupBy({ by: ['claimStatus'], where: benefitWhere, _count: true }),
    prisma.benefit.groupBy({ by: ['type'], where: benefitWhere, _count: true, _sum: { coverageAmount: true, premium: true } }),
    prisma.benefit.groupBy({ by: ['insuranceName'], where: benefitWhere, _count: true, _sum: { coverageAmount: true } })
  ]);

  const totalCoverage = await prisma.benefit.aggregate({ where: benefitWhere, _sum: { coverageAmount: true, premium: true } });
  const payload = {
    members,
    benefits,
    totalCoverage: totalCoverage._sum.coverageAmount || 0,
    totalPremium: totalCoverage._sum.premium || 0,
    byStatus: byStatus.map((row) => ({ status: row.claimStatus, count: row._count })),
    byType: byType.map((row) => ({ type: row.type, count: row._count, totalCoverage: row._sum.coverageAmount || 0, totalPremium: row._sum.premium || 0 })),
    byInsurer: byInsurer.map((row) => ({ name: row.insuranceName || '-', count: row._count, totalCoverage: row._sum.coverageAmount || 0 }))
  };
  const value = setCache(cacheKey, payload, 30 * 60 * 1000);
  if (!filters.primaryCuName && !filters.tpName && !filters.type) {
    const disk = readDashboardDiskCache() || {};
    disk.summary = value;
    writeDashboardDiskCache(disk);
  }
  return res.json(value);
});

app.get('/api/dashboard/filters', requireAuth, async (_req, res) => {
  const cached = getCache('dashboard:filters');
  if (cached) return res.json(cached);

  const [primaryCus, tps, types] = await Promise.all([
    prisma.$queryRaw`SELECT DISTINCT primaryCuName FROM Member WHERE primaryCuName IS NOT NULL AND primaryCuName <> '' ORDER BY primaryCuName ASC LIMIT 500`,
    prisma.$queryRaw`SELECT DISTINCT tpName FROM Member WHERE tpName IS NOT NULL AND tpName <> '' ORDER BY tpName ASC LIMIT 1000`,
    prisma.$queryRaw`SELECT DISTINCT type FROM Benefit WHERE type IS NOT NULL AND type <> '' ORDER BY type ASC`
  ]);

  res.json(setCache('dashboard:filters', {
    primaryCus: primaryCus.map((row) => row.primaryCuName).filter(Boolean),
    tps: tps.map((row) => row.tpName).filter(Boolean),
    types: types.map((row) => row.type).filter(Boolean)
  }, 30 * 60 * 1000));
});

app.get('/api/dashboard/excel', requireAuth, async (req, res) => {
  const filters = excelFilters(req);
  const cacheKey = `dashboard:excel:${JSON.stringify(filters)}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  if (!filters.primaryCuName && !filters.tpName && !filters.type) {
    const disk = readDashboardDiskCache();
    if (disk?.excel) {
      setCache(cacheKey, disk.excel, 30 * 60 * 1000);
      return res.json(disk.excel);
    }
  }

  const productWhere = dashboardBenefitWhere(filters);
  const memberWhere = dashboardWhere(filters);
  const joinMember = !!(filters.primaryCuName || filters.tpName);

  const productRows = await prisma.$queryRawUnsafe(`
    SELECT
      type,
      SUM(premium) AS premium,
      SUM(COALESCE(CAST(submittedAtText AS REAL), 0)) AS rawSubmitted,
      SUM(COALESCE(CAST(analyzedAtText AS REAL), 0)) AS analyzed,
      SUM(COALESCE(CAST(pendingAtText AS REAL), 0)) AS pending,
      SUM(COALESCE(CAST(rejectedAtText AS REAL), 0)) AS rejected,
      SUM(COALESCE(CAST(approvedAtText AS REAL), 0)) AS approved,
      SUM(COALESCE(CAST(paidAtText AS REAL), 0)) AS paid
    FROM Benefit
    ${joinMember ? 'INNER JOIN Member ON Member.id = Benefit.memberId' : ''}
    ${productWhere.whereSql}
    GROUP BY type
    ORDER BY premium DESC
  `, ...(joinMember ? memberWhere.values : productWhere.values));

  const primaryRows = await prisma.$queryRawUnsafe(`
    SELECT
      COALESCE(Member.primaryCuName, '-') AS name,
      SUM(Benefit.premium) AS premium,
      SUM(COALESCE(CAST(Benefit.submittedAtText AS REAL), 0)) AS rawSubmitted,
      SUM(COALESCE(CAST(Benefit.analyzedAtText AS REAL), 0)) AS analyzed,
      SUM(COALESCE(CAST(Benefit.pendingAtText AS REAL), 0)) AS pending,
      SUM(COALESCE(CAST(Benefit.rejectedAtText AS REAL), 0)) AS rejected,
      SUM(COALESCE(CAST(Benefit.approvedAtText AS REAL), 0)) AS approved,
      SUM(COALESCE(CAST(Benefit.paidAtText AS REAL), 0)) AS paid
    FROM Benefit
    INNER JOIN Member ON Member.id = Benefit.memberId
    ${memberWhere.whereSql}
    GROUP BY Member.primaryCuName
  `, ...memberWhere.values);

  const products = productRows.map((row) => {
    const submitted = numberFromDb(row.analyzed) + numberFromDb(row.pending) + numberFromDb(row.rejected) + numberFromDb(row.approved) + numberFromDb(row.paid);
    const premium = numberFromDb(row.premium);
    return {
      type: row.type,
      premium,
      rawSubmitted: numberFromDb(row.rawSubmitted),
      submitted,
      analyzed: numberFromDb(row.analyzed),
      pending: numberFromDb(row.pending),
      rejected: numberFromDb(row.rejected),
      approved: numberFromDb(row.approved),
      paid: numberFromDb(row.paid),
      claimRatio: premium ? submitted / premium : 0
    };
  });

  const totals = products.reduce((acc, row) => {
    for (const key of ['premium', 'submitted', 'analyzed', 'pending', 'rejected', 'approved', 'paid']) acc[key] += row[key];
    return acc;
  }, { premium: 0, submitted: 0, analyzed: 0, pending: 0, rejected: 0, approved: 0, paid: 0 });
  totals.claimRatio = totals.premium ? totals.submitted / totals.premium : 0;

  const mappedPrimary = primaryRows.map((row) => {
    const submitted = numberFromDb(row.analyzed) + numberFromDb(row.pending) + numberFromDb(row.rejected) + numberFromDb(row.approved) + numberFromDb(row.paid);
    const premium = numberFromDb(row.premium);
    return {
      name: row.name,
      premium,
      rawSubmitted: numberFromDb(row.rawSubmitted),
      submitted,
      analyzed: numberFromDb(row.analyzed),
      pending: numberFromDb(row.pending),
      rejected: numberFromDb(row.rejected),
      approved: numberFromDb(row.approved),
      paid: numberFromDb(row.paid),
      claimRatio: premium ? submitted / premium : 0
    };
  });

  const payload = {
    filters,
    products,
    totals,
    stages: [
      { label: 'Pengajuan', value: totals.submitted },
      { label: 'Analisa', value: totals.analyzed },
      { label: 'Pending', value: totals.pending },
      { label: 'Ditolak', value: totals.rejected },
      { label: 'Disetujui', value: totals.approved },
      { label: 'Dibayar', value: totals.paid }
    ],
    topPremium: [...mappedPrimary].sort((a, b) => b.premium - a.premium).slice(0, 10),
    topClaims: [...mappedPrimary].sort((a, b) => b.submitted - a.submitted).slice(0, 10)
  };
  const value = setCache(cacheKey, payload, 30 * 60 * 1000);
  if (!filters.primaryCuName && !filters.tpName && !filters.type) {
    const disk = readDashboardDiskCache() || {};
    disk.excel = value;
    writeDashboardDiskCache(disk);
  }
  return res.json(value);
});

app.get('/api/claims', requireAuth, async (req, res) => {
  const search = String(req.query.search || '').trim();
  const { limit, page, skip } = pagination(req, 10, 100);
  const where = memberSearchWhere(search);

  const [total, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      select: {
        id: true,
        membershipNo: true,
        name: true,
        primaryCuName: true,
        tpName: true
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit
    })
  ]);

  const memberIds = members.map((member) => member.id);
  const [benefitTotals, statuses] = memberIds.length
    ? await Promise.all([
        prisma.benefit.groupBy({
          by: ['memberId'],
          where: { memberId: { in: memberIds } },
          _count: true,
          _sum: { coverageAmount: true }
        }),
        prisma.benefit.findMany({
          where: { memberId: { in: memberIds } },
          select: { memberId: true, claimStatus: true }
        })
      ])
    : [[], []];

  const totalsByMember = new Map(benefitTotals.map((row) => [row.memberId, row]));
  const priorityByMember = new Map();
  for (const status of statuses) {
    const priority = ['BELUM_DIAJUKAN', 'PENGAJUAN', 'ANALISA', 'PENDING', 'DITOLAK', 'DISETUJUI', 'DIBAYAR'].indexOf(status.claimStatus);
    priorityByMember.set(status.memberId, Math.max(priorityByMember.get(status.memberId) || 0, priority));
  }

  res.json({
    total,
    page,
    limit,
    claims: members.map((member) => ({
      id: member.id,
      membershipNo: member.membershipNo,
      policyHolder: member.name,
      primaryCuName: member.primaryCuName,
      tpName: member.tpName,
      benefits: totalsByMember.get(member.id)?._count || 0,
      totalCoverage: totalsByMember.get(member.id)?._sum.coverageAmount || 0,
      latestStatus: claimStatusFromPriority(priorityByMember.get(member.id))
    }))
  });
});

app.get('/api/export/claims.csv', requireAuth, async (req, res) => {
  const search = String(req.query.search || '').trim();
  sendCsv(res, 'klaim.csv', await claimExportRows(search));
});

app.get('/api/export/claims.xlsx', requireAuth, async (req, res) => {
  const search = String(req.query.search || '').trim();
  sendWorkbook(res, 'klaim.xlsx', 'Klaim', await claimExportRows(search));
});

app.get('/api/members', requireAuth, async (req, res) => {
  const search = String(req.query.search || '').trim();
  const { limit, page, skip } = pagination(req);
  const where = memberSearchWhere(search, ['primaryCuName', 'tpName']);

  const [total, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: limit
    })
  ]);

  res.json({
    total,
    page,
    limit,
    members: members.map((member) => normalizeMemberSummary(member))
  });
});

app.get('/api/policies', requireAuth, async (req, res) => {
  const search = String(req.query.search || '').trim();
  const { limit, page, skip } = pagination(req);
  const where = search
    ? {
        OR: [
          { type: { contains: search } },
          { insuranceName: { contains: search } },
          { member: { is: { membershipNo: { contains: search } } } },
          { member: { is: { name: { contains: search } } } }
        ]
      }
    : {};

  const [total, policies] = await Promise.all([
    prisma.benefit.count({ where }),
    prisma.benefit.findMany({
      where,
      include: { member: true },
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take: limit
    })
  ]);

  res.json({
    total,
    page,
    limit,
    policies: policies.map((benefit) => ({
      id: benefit.id,
      membershipNo: benefit.member.membershipNo,
      memberName: benefit.member.name,
      type: benefit.type,
      insuranceName: benefit.insuranceName,
      coverageAmount: benefit.coverageAmount,
      premium: benefit.premium,
      startDate: benefit.startDate,
      endDate: benefit.endDate,
      claimStatus: benefit.claimStatus,
      sourceRow: benefit.sourceRow
    }))
  });
});

app.get('/api/export/policies.csv', requireAuth, async (req, res) => {
  const search = String(req.query.search || '').trim();
  sendCsv(res, 'polis.csv', await policyExportRows(search));
});

app.get('/api/export/policies.xlsx', requireAuth, async (req, res) => {
  const search = String(req.query.search || '').trim();
  sendWorkbook(res, 'polis.xlsx', 'Polis', await policyExportRows(search));
});

app.get('/api/companies', requireAuth, async (_req, res) => {
  const cached = getCache('companies');
  if (cached) return res.json(cached);

  const [insurers, primaryCus] = await Promise.all([
    prisma.benefit.groupBy({ by: ['insuranceName'], _count: true, _sum: { coverageAmount: true, premium: true } }),
    prisma.member.groupBy({ by: ['primaryCuName'], _count: true })
  ]);

  res.json(setCache('companies', {
    insurers: insurers.map((row) => ({
      name: row.insuranceName || '-',
      policies: row._count,
      totalCoverage: row._sum.coverageAmount || 0,
      totalPremium: row._sum.premium || 0
    })),
    primaryCus: primaryCus.map((row) => ({
      name: row.primaryCuName || '-',
      members: row._count
    }))
  }));
});

app.get('/api/admin/users', requireAuth, requireCorporate, async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { username: 'asc' } });
  res.json({ users: users.map(({ passwordHash, ...user }) => user) });
});

const createUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8),
  role: z.enum(['CORPORATE', 'PUSKOP'])
});

const updateUserSchema = z.object({
  password: z.string().min(8).optional(),
  role: z.enum(['CORPORATE', 'PUSKOP']).optional()
}).refine((data) => data.password || data.role, { message: 'Tidak ada perubahan user.' });

app.post('/api/admin/users', requireAuth, requireCorporate, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Data user tidak valid.', errors: parsed.error.flatten() });

  const username = parsed.data.username.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ message: 'Username sudah digunakan.' });

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: parsed.data.role
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user.sub,
      action: 'CREATE_USER',
      entity: 'User',
      entityId: user.id,
      after: stringifyAuditValue({ username: user.username, role: user.role })
    }
  });

  const { passwordHash, ...safeUser } = user;
  res.status(201).json({ user: safeUser });
});

app.patch('/api/admin/users/:id', requireAuth, requireCorporate, async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Data user tidak valid.', errors: parsed.error.flatten() });

  const before = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ message: 'User tidak ditemukan.' });

  const updateData = {};
  if (parsed.data.role) updateData.role = parsed.data.role;
  if (parsed.data.password) updateData.passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const after = await prisma.user.update({ where: { id: req.params.id }, data: updateData });
  await prisma.auditLog.create({
    data: {
      userId: req.user.sub,
      action: 'UPDATE_USER',
      entity: 'User',
      entityId: after.id,
      before: stringifyAuditValue({ username: before.username, role: before.role }),
      after: stringifyAuditValue({ username: after.username, role: after.role, passwordChanged: !!parsed.data.password })
    }
  });

  const { passwordHash, ...safeUser } = after;
  res.json({ user: safeUser });
});

app.delete('/api/admin/users/:id', requireAuth, requireCorporate, async (req, res) => {
  if (req.params.id === req.user.sub) return res.status(400).json({ message: 'User yang sedang login tidak dapat dihapus.' });

  const before = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ message: 'User tidak ditemukan.' });

  await prisma.user.delete({ where: { id: req.params.id } });
  await prisma.auditLog.create({
    data: {
      userId: req.user.sub,
      action: 'DELETE_USER',
      entity: 'User',
      entityId: before.id,
      before: stringifyAuditValue({ username: before.username, role: before.role })
    }
  });

  res.json({ ok: true });
});

app.get('/api/members/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ message: 'Masukkan nomor anggota koperasi.' });

  const member = await prisma.member.findFirst({
    where: {
      OR: [
        { membershipNo: q },
        { name: { contains: q } },
        { nik: q }
      ]
    },
    include: { benefits: { orderBy: [{ type: 'asc' }, { createdAt: 'asc' }] } }
  });

  if (!member) return res.status(404).json({ message: 'Nomor anggota koperasi tidak ditemukan.' });

  const totals = member.benefits.reduce(
    (acc, b) => {
      acc[b.type] = (acc[b.type] || 0) + (b.coverageAmount || 0);
      return acc;
    },
    { PINJAMAN: 0, SIMPANAN: 0, SOLDUKA: 0 }
  );

  res.json({ member: normalizeMember(member), totals });
});

const updateMemberSchema = z.object({
  infoDate: z.string().optional().nullable(),
  deathDate: z.string().optional().nullable(),
  claimDate: z.string().optional().nullable(),
  deathType: z.enum(['RUMAH', 'RUMAH_SAKIT', 'KECELAKAAN']).optional().nullable(),
  documents: z.record(z.boolean()).optional()
});

app.patch('/api/members/:id', requireAuth, async (req, res) => {
  const parsed = updateMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Data anggota tidak valid.', errors: parsed.error.flatten() });

  const before = await prisma.member.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ message: 'Anggota tidak ditemukan.' });

  const data = parsed.data;
  const after = await prisma.member.update({
    where: { id: req.params.id },
    data: {
      infoDate: data.infoDate ? new Date(data.infoDate) : data.infoDate,
      deathDate: data.deathDate ? new Date(data.deathDate) : data.deathDate,
      claimDate: data.claimDate ? new Date(data.claimDate) : data.claimDate,
      deathType: data.deathType,
      documents: data.documents === undefined ? undefined : JSON.stringify(data.documents || {})
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user.sub,
      action: 'UPDATE_MEMBER',
      entity: 'Member',
      entityId: after.id,
      before: stringifyAuditValue(before),
      after: stringifyAuditValue(after)
    }
  });
  clearDashboardCache();
  res.json({ member: normalizeMember(after) });
});

const updateBenefitSchema = z.object({
  claimStatus: z.enum(['BELUM_DIAJUKAN', 'PENGAJUAN', 'ANALISA', 'PENDING', 'DITOLAK', 'DISETUJUI', 'DIBAYAR']),
  approvedDate: z.string().optional().nullable(),
  paidDate: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable()
});

app.patch('/api/benefits/:id/status', requireAuth, async (req, res) => {
  const parsed = updateBenefitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Status klaim tidak valid.', errors: parsed.error.flatten() });

  const before = await prisma.benefit.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ message: 'Benefit tidak ditemukan.' });

  const after = await prisma.benefit.update({
    where: { id: req.params.id },
    data: {
      claimStatus: parsed.data.claimStatus,
      approvedDate: parsed.data.approvedDate ? new Date(parsed.data.approvedDate) : parsed.data.approvedDate,
      paidDate: parsed.data.paidDate ? new Date(parsed.data.paidDate) : parsed.data.paidDate,
      rejectionReason: parsed.data.rejectionReason || null
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user.sub,
      action: 'UPDATE_BENEFIT_STATUS',
      entity: 'Benefit',
      entityId: after.id,
      before: stringifyAuditValue(before),
      after: stringifyAuditValue(after)
    }
  });
  clearDashboardCache();
  res.json({ benefit: after });
});

const updateVbaBenefitSchema = z.object({
  stage: z.enum(['BELUM_DIAJUKAN', 'PENGAJUAN', 'ANALISA', 'PENDING', 'DITOLAK', 'DISETUJUI', 'DIBAYAR']),
  submittedAtText: z.string().optional().nullable(),
  analyzedAtText: z.string().optional().nullable(),
  pendingAtText: z.string().optional().nullable(),
  rejectedAtText: z.string().optional().nullable(),
  approvedAtText: z.string().optional().nullable(),
  paidAtText: z.string().optional().nullable(),
  approvedDate: z.string().optional().nullable(),
  paidDate: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable()
});

app.patch('/api/benefits/:id/vba-status', requireAuth, requireCorporate, async (req, res) => {
  const parsed = updateVbaBenefitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Data status klaim tidak valid.', errors: parsed.error.flatten() });

  const before = await prisma.benefit.findUnique({ where: { id: req.params.id } });
  if (!before) return res.status(404).json({ message: 'Benefit tidak ditemukan.' });

  const data = parsed.data;
  const stageAmounts = {
    submittedAtText: data.stage === 'PENGAJUAN' ? data.submittedAtText : null,
    analyzedAtText: data.stage === 'ANALISA' ? data.analyzedAtText : null,
    pendingAtText: data.stage === 'PENDING' ? data.pendingAtText : null,
    rejectedAtText: data.stage === 'DITOLAK' ? data.rejectedAtText : null,
    approvedAtText: data.stage === 'DISETUJUI' ? data.approvedAtText : null,
    paidAtText: data.stage === 'DIBAYAR' ? data.paidAtText : null
  };

  const after = await prisma.benefit.update({
    where: { id: req.params.id },
    data: {
      ...stageAmounts,
      claimStatus: data.stage === 'BELUM_DIAJUKAN' ? 'BELUM_DIAJUKAN' : resolveClaimStatus(stageAmounts),
      approvedDate: data.stage === 'DISETUJUI' && data.approvedDate ? new Date(data.approvedDate) : null,
      paidDate: data.stage === 'DIBAYAR' && data.paidDate ? new Date(data.paidDate) : null,
      rejectionReason: data.stage === 'DITOLAK' ? data.rejectionReason || null : null
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user.sub,
      action: 'UPDATE_VBA_CLAIM_STATUS',
      entity: 'Benefit',
      entityId: after.id,
      before: stringifyAuditValue(before),
      after: stringifyAuditValue(after)
    }
  });

  clearDashboardCache();
  res.json({ benefit: after });
});

app.get('/api/admin/audit-logs', requireAuth, requireCorporate, async (req, res) => {
  const { limit, page, skip } = pagination(req, 25, 100);
  const [total, logs] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit })
  ]);
  res.json({
    total,
    page,
    limit,
    logs: logs.map((log) => ({
      ...log,
      before: normalizeSource(log.before),
      after: normalizeSource(log.after)
    }))
  });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`Backend jalan di http://localhost:${port}`));
