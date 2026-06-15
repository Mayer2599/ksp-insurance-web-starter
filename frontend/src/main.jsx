import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Briefcase, Building2, ClipboardList, Download, FileCheck2, FileText, KeyRound, LogOut, Save, Search, Trash2, UserCircle2, Users } from 'lucide-react';
import { api } from './lib/api';
import './styles.css';

const DOCUMENTS = [
  ['fotokopiKartuAnggota', 'Fotokopi Kartu Anggota'],
  ['kartuKeluarga', 'Kartu Keluarga'],
  ['identitasPeserta', 'Identitas Peserta'],
  ['formulirCkaCup', 'Formulir CKA CUP'],
  ['suratSakitPuskesmas', 'Surat Sakit/Puskesmas'],
  ['suratKematian', 'Surat Kematian'],
  ['suratKepolisian', 'Surat Kepolisian'],
  ['suratKeteranganKronologis', 'Surat Kronologis'],
  ['suratKuasa', 'Surat Kuasa'],
  ['bukuTabungan', 'Buku Tabungan']
];

const DEATH_TYPES = [
  ['RUMAH', 'Meninggal Dunia Di Rumah'],
  ['RUMAH_SAKIT', 'Meninggal Dunia Di Rumah Sakit'],
  ['KECELAKAAN', 'Meninggal Dunia karena Kecelakaan']
];

const STAGES = [
  ['BELUM_DIAJUKAN', 'Belum'],
  ['PENGAJUAN', 'Pengajuan'],
  ['ANALISA', 'Analisa'],
  ['PENDING', 'Pending'],
  ['DITOLAK', 'Ditolak'],
  ['DISETUJUI', 'Disetujui'],
  ['DIBAYAR', 'Dibayar']
];

const STAGE_FIELD = {
  PENGAJUAN: 'submittedAtText',
  ANALISA: 'analyzedAtText',
  PENDING: 'pendingAtText',
  DITOLAK: 'rejectedAtText',
  DISETUJUI: 'approvedAtText',
  DIBAYAR: 'paidAtText'
};

const LOGO_URL = '';
const SIDEBAR_LOGO_URL = '';

function rupiah(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
}

function percent(n) {
  return new Intl.NumberFormat('id-ID', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function toDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function shortDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

async function downloadFile(path, filename, params = {}) {
  const response = await api.get(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('akib');
  const [password, setPassword] = useState('Akib_CUPK@2025');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { username, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      setError(err.response?.data?.message || 'Login gagal.');
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <div className="login-brand">AstaKanti</div>
        <h1>Login</h1>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="alert">{error}</div>}
        <button>Masuk</button>
      </form>
    </main>
  );
}

function Sidebar({ active, setActive, user, onLogout }) {
  const items = [
    ['dashboard', BarChart3, 'Dashboard'],
    ['user', UserCircle2, 'User'],
    ['anggota', Users, 'Anggota'],
    ['polis', FileText, 'Polis'],
    ['perusahaan', Building2, 'Perusahaan'],
    ['klaim', Briefcase, 'Klaim'],
    ['audit', ClipboardList, 'Audit']
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">AK</div>
      <nav>
        {items.map(([key, Icon, label]) => (
          <button key={key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>
      <button className="logout-button" onClick={onLogout}><LogOut size={14} /> Logout</button>
      <div className="sidebar-user">{user.role}</div>
    </aside>
  );
}

function Topbar({ user }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">AstaKanti</div>
      <div className="admin-pill">Admin <UserCircle2 size={18} /> <span>{user.username}</span></div>
    </header>
  );
}

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [excel, setExcel] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ primaryCus: [], tps: [], types: [] });
  const [filters, setFilters] = useState({ primaryCuName: '', tpName: '', type: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/filters').then(({ data }) => setFilterOptions(data)).catch(() => {});
  }, []);

  useEffect(() => {
    setSummary(null);
    setExcel(null);
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    Promise.all([api.get('/dashboard/summary', { params }), api.get('/dashboard/excel', { params })])
      .then(([summaryRes, excelRes]) => {
        setSummary(summaryRes.data);
        setExcel(excelRes.data);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.message || 'Dashboard gagal dimuat. Silakan login ulang.'));
  }, [filters]);

  if (error) return <section className="panel"><div className="alert">{error}</div></section>;
  if (!summary || !excel) return <section className="panel">Memuat data...</section>;
  return (
    <>
      <div className="page-title"><h1>Dashboard</h1><button className="tab-button">Ringkasan</button></div>
      <section className="panel dashboard-filter">
        <label>CU Primer
          <select value={filters.primaryCuName} onChange={(e) => setFilters({ ...filters, primaryCuName: e.target.value })}>
            <option value="">Semua CU</option>
            {filterOptions.primaryCus.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label>TP
          <select value={filters.tpName} onChange={(e) => setFilters({ ...filters, tpName: e.target.value })}>
            <option value="">Semua TP</option>
            {filterOptions.tps.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label>Produk
          <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">Semua Produk</option>
            {filterOptions.types.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <button className="plain-button" onClick={() => setFilters({ primaryCuName: '', tpName: '', type: '' })}>Reset</button>
      </section>
      <section className="grid-metrics">
        <div><span>Total Anggota</span><b>{summary.members.toLocaleString('id-ID')}</b></div>
        <div><span>Total Benefit</span><b>{summary.benefits.toLocaleString('id-ID')}</b></div>
        <div><span>Total Premi</span><b>{rupiah(excel.totals.premium)}</b></div>
        <div><span>Klaim Rasio</span><b>{percent(excel.totals.claimRatio)}</b></div>
      </section>
      <section className="dashboard-panels">
        <div className="panel">
          <div className="panel-title">Premi dan Klaim Pengajuan per Produk</div>
          <BarChart
            rows={excel.products.map((row) => ({ label: row.type, primary: row.premium, secondary: row.submitted }))}
            primaryLabel="Premi"
            secondaryLabel="Klaim"
          />
        </div>
        <div className="panel">
          <div className="panel-title">Tahapan Klaim</div>
          <SingleBarChart rows={excel.stages} />
        </div>
      </section>
      <section className="dashboard-panels">
        <div className="panel">
          <div className="panel-title">TOP 10 Premi</div>
          <MiniTable columns={['CU Primer', 'Premi', 'Klaim', 'Rasio']} rows={excel.topPremium.map((row) => [row.name, rupiah(row.premium), rupiah(row.submitted), percent(row.claimRatio)])} />
        </div>
        <div className="panel">
          <div className="panel-title">TOP 10 Klaim</div>
          <MiniTable columns={['CU Primer', 'Premi', 'Klaim', 'Rasio']} rows={excel.topClaims.map((row) => [row.name, rupiah(row.premium), rupiah(row.submitted), percent(row.claimRatio)])} />
        </div>
      </section>
      <section className="panel dashboard-table">
        <div className="panel-title">Laporan Deklarasi dan Klaim Periode 1 Oktober 25 - 30 September 26</div>
        <MiniTable
          columns={['Produk', 'Premi', 'Klaim Pengajuan', 'Klaim Analisa', 'Klaim Pending', 'Klaim Ditolak', 'Klaim Disetujui', 'Klaim Dibayar', 'Klaim Rasio']}
          rows={[
            ...excel.products.map((row) => [row.type, rupiah(row.premium), rupiah(row.submitted), rupiah(row.analyzed), rupiah(row.pending), rupiah(row.rejected), rupiah(row.approved), rupiah(row.paid), percent(row.claimRatio)]),
            ['Grand Total', rupiah(excel.totals.premium), rupiah(excel.totals.submitted), rupiah(excel.totals.analyzed), rupiah(excel.totals.pending), rupiah(excel.totals.rejected), rupiah(excel.totals.approved), rupiah(excel.totals.paid), percent(excel.totals.claimRatio)]
          ]}
        />
      </section>
    </>
  );
}

function BarChart({ rows, primaryLabel, secondaryLabel }) {
  const max = Math.max(...rows.flatMap((row) => [row.primary, row.secondary]), 1);
  return (
    <div className="chart">
      <div className="chart-legend"><span className="legend-primary">{primaryLabel}</span><span className="legend-secondary">{secondaryLabel}</span></div>
      {rows.map((row) => (
        <div className="chart-row" key={row.label}>
          <label>{row.label}</label>
          <div className="chart-bars">
            <span className="bar-line"><span className="bar primary" style={{ width: `${Math.max((row.primary / max) * 100, 1)}%` }} /><b>{rupiah(row.primary)}</b></span>
            <span className="bar-line"><span className="bar secondary" style={{ width: `${Math.max((row.secondary / max) * 100, 1)}%` }} /><b>{rupiah(row.secondary)}</b></span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SingleBarChart({ rows }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="chart">
      {rows.map((row) => (
        <div className="chart-row" key={row.label}>
          <label>{row.label}</label>
          <div className="chart-bars">
            <span className="bar-line"><span className="bar stage" style={{ width: `${row.value ? Math.max((row.value / max) * 100, 2) : 0}%` }} /><b>{rupiah(row.value)}</b></span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table className="data-table compact-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ResourceTable({ title, tab, endpoint, rowsKey, columns, mapRow, searchable = true, exportPath, exportName }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load(nextPage = page) {
    setLoading(true);
    const { data } = await api.get(endpoint, { params: { search, limit, page: nextPage } });
    setRows(data[rowsKey]);
    setTotal(data.total ?? data[rowsKey].length);
    setPage(data.page ?? nextPage);
    setLimit(data.limit ?? limit);
    setLoading(false);
  }

  useEffect(() => { load(1); }, [endpoint, limit]);
  const lastPage = Math.max(Math.ceil(total / limit), 1);

  return (
    <>
      <div className="page-title"><h1>{title}</h1><button className="tab-button">{tab}</button></div>
      <section className="panel">
        <div className="panel-title">{tab}</div>
        <div className="table-toolbar">
          <div>Show <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</div>
          {searchable && <form onSubmit={(e) => { e.preventDefault(); load(1); }}>
            <span>Search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="icon-button" title="Cari"><Search size={14} /></button>
          </form>}
          {exportPath && <button className="export-button" onClick={() => downloadFile(exportPath, exportName, { search })}><Download size={14} /> Export</button>}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={columns.length}>Memuat data...</td></tr>}
              {!loading && rows.map((row, index) => <tr key={row.id || row.name || index}>{mapRow(row).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}
              {!loading && rows.length === 0 && <tr><td colSpan={columns.length}>Data tidak ditemukan.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          Showing {rows.length ? (page - 1) * limit + 1 : 0} to {(page - 1) * limit + rows.length} of {total.toLocaleString('id-ID')} entries
          <span>
            <button disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
            <button className="active-page">{page}</button>
            <button disabled={page >= lastPage} onClick={() => load(page + 1)}>Next</button>
          </span>
        </div>
      </section>
    </>
  );
}

function ClaimsTable({ onPick }) {
  const [claims, setClaims] = useState([]);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load(nextPage = page) {
    setLoading(true);
    const { data } = await api.get('/claims', { params: { search, limit, page: nextPage } });
    setClaims(data.claims);
    setTotal(data.total);
    setPage(data.page);
    setLimit(data.limit);
    setLoading(false);
  }

  useEffect(() => { load(1); }, [limit]);
  const lastPage = Math.max(Math.ceil(total / limit), 1);

  return (
    <section className="panel">
      <div className="panel-title">Klaim Asuransi</div>
      <div className="table-toolbar">
        <div>Show <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</div>
        <form onSubmit={(e) => { e.preventDefault(); load(1); }}>
          <span>Search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="icon-button" title="Cari"><Search size={14} /></button>
        </form>
        <button className="export-button" onClick={() => downloadFile('/export/claims.xlsx', 'klaim.xlsx', { search })}><Download size={14} /> Export</button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>No KTP</th><th>Pemegang Polis</th><th>Status</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="4">Memuat data...</td></tr>}
            {!loading && claims.map((claim) => (
              <tr key={claim.id}>
                <td>{claim.membershipNo}</td>
                <td>{claim.policyHolder}</td>
                <td><span className="status-chip">{claim.latestStatus}</span></td>
                <td><button className="pick-button" onClick={() => onPick(claim.membershipNo)}>Pilih</button></td>
              </tr>
            ))}
            {!loading && claims.length === 0 && <tr><td colSpan="4">Data tidak ditemukan.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-footer">Showing {claims.length ? (page - 1) * limit + 1 : 0} to {(page - 1) * limit + claims.length} of {total.toLocaleString('id-ID')} entries <span><button disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button><button className="active-page">{page}</button><button disabled={page >= lastPage} onClick={() => load(page + 1)}>Next</button></span></div>
    </section>
  );
}

function MemberEditor({ detail, setDetail, refresh, user }) {
  const member = detail.member;
  const [documents, setDocuments] = useState(member.documents || {});
  const [form, setForm] = useState({
    infoDate: toDateInput(member.infoDate),
    deathDate: toDateInput(member.deathDate),
    claimDate: toDateInput(member.claimDate),
    deathType: member.deathType || ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDocuments(member.documents || {});
    setForm({
      infoDate: toDateInput(member.infoDate),
      deathDate: toDateInput(member.deathDate),
      claimDate: toDateInput(member.claimDate),
      deathType: member.deathType || ''
    });
  }, [member.id]);

  async function save() {
    setSaving(true);
    const { data } = await api.patch(`/members/${member.id}`, {
      ...form,
      deathType: form.deathType || null,
      documents
    });
    setDetail({ ...detail, member: { ...detail.member, ...data.member } });
    await refresh();
    setSaving(false);
  }

  return (
    <section className="detail-section">
      <h3>Data Peserta</h3>
      <div className="member-fields">
        <div><span>Nama Anggota</span><b>{member.name}</b></div>
        <div><span>No. Anggota</span><b>{member.membershipNo}</b></div>
        <div><span>Jenis Kelamin</span><b>{member.gender || '-'}</b></div>
        <div><span>CU Primer</span><b>{member.primaryCuName || '-'}</b></div>
        <div><span>Nama TP</span><b>{member.tpName || '-'}</b></div>
        <div><span>NIK</span><b>{member.nik || '-'}</b></div>
      </div>
      <div className="three-columns">
        <label>Tgl Informasi<input type="date" value={form.infoDate} onChange={(e) => setForm({ ...form, infoDate: e.target.value })} /></label>
        <label>Tgl Meninggal<input type="date" value={form.deathDate} onChange={(e) => setForm({ ...form, deathDate: e.target.value })} /></label>
        <label>Tgl Klaim<input type="date" value={form.claimDate} onChange={(e) => setForm({ ...form, claimDate: e.target.value })} /></label>
      </div>
      <div className="radio-row">
        {DEATH_TYPES.map(([value, label]) => (
          <label key={value}><input type="radio" checked={form.deathType === value} onChange={() => setForm({ ...form, deathType: value })} /> {label}</label>
        ))}
      </div>
      <div className="doc-grid">
        {DOCUMENTS.map(([key, label]) => (
          <label key={key} className="check-row"><input type="checkbox" checked={!!documents[key]} onChange={(e) => setDocuments({ ...documents, [key]: e.target.checked })} /> {label}</label>
        ))}
      </div>
      <button className="save-button" onClick={save} disabled={saving}><FileCheck2 size={14} /> {saving ? 'Menyimpan...' : 'Simpan Data Peserta'}</button>
      {user.role === 'PUSKOP' && <div className="role-note">Puskop hanya dapat menyimpan data peserta dan kelengkapan dokumen.</div>}
    </section>
  );
}

function BenefitEditor({ benefit, refresh }) {
  const [stage, setStage] = useState(benefit.claimStatus || 'BELUM_DIAJUKAN');
  const [amounts, setAmounts] = useState({
    submittedAtText: benefit.submittedAtText || '',
    analyzedAtText: benefit.analyzedAtText || '',
    pendingAtText: benefit.pendingAtText || '',
    rejectedAtText: benefit.rejectedAtText || '',
    approvedAtText: benefit.approvedAtText || '',
    paidAtText: benefit.paidAtText || ''
  });
  const [approvedDate, setApprovedDate] = useState(toDateInput(benefit.approvedDate));
  const [paidDate, setPaidDate] = useState(toDateInput(benefit.paidDate));
  const [rejectionReason, setRejectionReason] = useState(benefit.rejectionReason || '');
  const [saving, setSaving] = useState(false);
  const activeField = STAGE_FIELD[stage];

  async function save() {
    setSaving(true);
    await api.patch(`/benefits/${benefit.id}/vba-status`, {
      stage,
      ...amounts,
      approvedDate: approvedDate || null,
      paidDate: paidDate || null,
      rejectionReason
    });
    await refresh();
    setSaving(false);
  }

  return (
    <tr>
      <td><b>{benefit.type}</b><span>{benefit.insuranceName || '-'}</span></td>
      <td>{rupiah(benefit.coverageAmount)}</td>
      <td>
        <div className="stage-options">
          {STAGES.map(([value, label]) => <label key={value}><input type="radio" checked={stage === value} onChange={() => setStage(value)} /> {label}</label>)}
        </div>
      </td>
      <td>
        <input disabled={!activeField} value={activeField ? amounts[activeField] : ''} onChange={(e) => setAmounts({ ...amounts, [activeField]: e.target.value })} placeholder="Nilai status" />
      </td>
      <td><input type="date" disabled={stage !== 'DISETUJUI'} value={approvedDate} onChange={(e) => setApprovedDate(e.target.value)} /></td>
      <td><input type="date" disabled={stage !== 'DIBAYAR'} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></td>
      <td><input disabled={stage !== 'DITOLAK'} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Alasan" /></td>
      <td><button className="pick-button" onClick={save} disabled={saving}>{saving ? '...' : 'Simpan'}</button></td>
    </tr>
  );
}

function ClaimDetail({ membershipNo, onClose, user }) {
  const [detail, setDetail] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/members/search', { params: { q: membershipNo } });
      setDetail(data);
      setMessage('');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Data tidak ditemukan.');
    }
  }

  useEffect(() => { load(); }, [membershipNo]);

  if (message) return <section className="panel"><div className="alert">{message}</div></section>;
  if (!detail) return <section className="panel">Memuat detail...</section>;

  return (
    <section className="panel detail-panel">
      <div className="detail-header">
        <div>
          <h2>{detail.member.name}</h2>
          <span>{detail.member.membershipNo}</span>
        </div>
        <button className="plain-button" onClick={onClose}>Kembali</button>
      </div>
      <div className="totals-row">
        <div><span>Pinjaman</span><b>{rupiah(detail.totals.PINJAMAN)}</b></div>
        <div><span>Simpanan</span><b>{rupiah(detail.totals.SIMPANAN)}</b></div>
        <div><span>Solduka</span><b>{rupiah(detail.totals.SOLDUKA)}</b></div>
      </div>
      <MemberEditor detail={detail} setDetail={setDetail} refresh={load} user={user} />
      {user.role === 'CORPORATE' && (
        <section className="detail-section">
          <h3>Status Benefit/Klaim</h3>
          <div className="table-wrap">
            <table className="data-table benefit-table">
              <thead><tr><th>Benefit</th><th>UP</th><th>Status</th><th>Nilai</th><th>Tgl Setuju</th><th>Tgl Bayar</th><th>Alasan</th><th>Aksi</th></tr></thead>
              <tbody>{detail.member.benefits.map((benefit) => <BenefitEditor key={benefit.id} benefit={benefit} refresh={load} />)}</tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

function ClaimsPage({ user }) {
  const [selected, setSelected] = useState('');
  return (
    <>
      <div className="page-title"><h1>Klaim Asuransi</h1><button className="tab-button">Daftar Klaim</button></div>
      {selected ? <ClaimDetail membershipNo={selected} onClose={() => setSelected('')} user={user} /> : <ClaimsTable onPick={setSelected} />}
    </>
  );
}

function UsersPage({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'PUSKOP' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await api.get('/admin/users');
    setUsers(data.users);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createUser(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api.post('/admin/users', form);
      setForm({ username: '', password: '', role: 'PUSKOP' });
      setMessage('User berhasil ditambahkan.');
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'User gagal ditambahkan.');
    }
  }

  async function updateUser(id, payload) {
    setMessage('');
    try {
      await api.patch(`/admin/users/${id}`, payload);
      setMessage('User berhasil diperbarui.');
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'User gagal diperbarui.');
    }
  }

  async function resetPassword(user) {
    const password = window.prompt(`Password baru untuk ${user.username}`);
    if (!password) return;
    await updateUser(user.id, { password });
  }

  async function deleteUser(user) {
    if (!window.confirm(`Hapus user ${user.username}?`)) return;
    setMessage('');
    try {
      await api.delete(`/admin/users/${user.id}`);
      setMessage('User berhasil dihapus.');
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'User gagal dihapus.');
    }
  }

  return (
    <>
      <div className="page-title"><h1>User</h1><button className="tab-button">Daftar User</button></div>
      <section className="panel user-admin-panel">
        <div>
          <div className="panel-title">Tambah User</div>
          <form className="user-form" onSubmit={createUser}>
            <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label>Role
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="PUSKOP">PUSKOP</option>
                <option value="CORPORATE">CORPORATE</option>
              </select>
            </label>
            <button className="save-button"><Save size={14} /> Simpan User</button>
          </form>
          {message && <div className={message.includes('berhasil') ? 'notice' : 'alert'}>{message}</div>}
        </div>
        <div>
          <div className="panel-title">User Aktif</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Username</th><th>Role</th><th>Dibuat</th><th>Aksi</th></tr></thead>
              <tbody>
                {loading && <tr><td colSpan="4">Memuat data...</td></tr>}
                {!loading && users.map((row) => (
                  <tr key={row.id}>
                    <td>{row.username}</td>
                    <td>
                      <select value={row.role} onChange={(e) => updateUser(row.id, { role: e.target.value })}>
                        <option value="PUSKOP">PUSKOP</option>
                        <option value="CORPORATE">CORPORATE</option>
                      </select>
                    </td>
                    <td>{shortDate(row.createdAt)}</td>
                    <td className="action-cell">
                      <button className="icon-action" title="Reset password" onClick={() => resetPassword(row)}><KeyRound size={14} /></button>
                      <button className="icon-action danger" title="Hapus user" disabled={row.username === currentUser.username} onClick={() => deleteUser(row)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function MembersPage() {
  return (
    <ResourceTable
      title="Anggota"
      tab="Daftar Anggota"
      endpoint="/members"
      rowsKey="members"
      columns={['No. Anggota', 'Nama Anggota', 'NIK', 'CU Primer', 'TP', 'Jenis Kelamin']}
      mapRow={(row) => [row.membershipNo, row.name, row.nik || '-', row.primaryCuName || '-', row.tpName || '-', row.gender || '-']}
    />
  );
}

function PoliciesPage() {
  return (
    <ResourceTable
      title="Polis"
      tab="Daftar Polis"
      endpoint="/policies"
      rowsKey="policies"
      exportPath="/export/policies.xlsx"
      exportName="polis.xlsx"
      columns={['No. Anggota', 'Pemegang Polis', 'Benefit', 'Asuransi', 'UP', 'Premi', 'Status']}
      mapRow={(row) => [row.membershipNo, row.memberName, row.type, row.insuranceName || '-', rupiah(row.coverageAmount), rupiah(row.premium), <span className="status-chip">{row.claimStatus}</span>]}
    />
  );
}

function AuditPage() {
  return (
    <ResourceTable
      title="Audit Log"
      tab="Riwayat Perubahan"
      endpoint="/admin/audit-logs"
      rowsKey="logs"
      searchable={false}
      columns={['Waktu', 'Aksi', 'Entity', 'Entity ID', 'User']}
      mapRow={(row) => [shortDate(row.createdAt), row.action, row.entity, row.entityId || '-', row.userId || '-']}
    />
  );
}

function CompaniesPage() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/companies').then(({ data }) => setData(data)); }, []);
  if (!data) return <section className="panel">Memuat data...</section>;

  return (
    <>
      <div className="page-title"><h1>Perusahaan</h1><button className="tab-button">Asuransi & CU</button></div>
      <section className="dashboard-panels">
        <div className="panel">
          <div className="panel-title">Perusahaan Asuransi</div>
          <MiniTable columns={['Nama', 'Polis', 'UP', 'Premi']} rows={data.insurers.map((row) => [row.name, row.policies.toLocaleString('id-ID'), rupiah(row.totalCoverage), rupiah(row.totalPremium)])} />
        </div>
        <div className="panel">
          <div className="panel-title">CU Primer</div>
          <MiniTable columns={['Nama CU', 'Anggota']} rows={data.primaryCus.map((row) => [row.name, row.members.toLocaleString('id-ID')])} />
        </div>
      </section>
    </>
  );
}

function App() {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      localStorage.removeItem('user');
      return null;
    }
    return JSON.parse(localStorage.getItem('user') || 'null');
  });
  const [active, setActive] = useState('klaim');
  useEffect(() => {
    function handleExpired() {
      setUser(null);
    }
    window.addEventListener('auth-expired', handleExpired);
    return () => window.removeEventListener('auth-expired', handleExpired);
  }, []);
  const content = useMemo(() => {
    if (active === 'dashboard') return <Dashboard />;
    if (active === 'user') return user.role === 'CORPORATE' ? <UsersPage currentUser={user} /> : <ClaimsPage user={user} />;
    if (active === 'anggota') return <MembersPage />;
    if (active === 'polis') return <PoliciesPage />;
    if (active === 'perusahaan') return <CompaniesPage />;
    if (active === 'klaim') return <ClaimsPage user={user} />;
    if (active === 'audit') return user.role === 'CORPORATE' ? <AuditPage /> : <ClaimsPage user={user} />;
    return <ClaimsPage user={user} />;
  }, [active, user]);

  if (!user) return <Login onLogin={setUser} />;

  return (
    <main className="app-layout">
      <Sidebar active={active} setActive={setActive} user={user} onLogout={() => { localStorage.clear(); setUser(null); }} />
      <section className="workspace">
        <Topbar user={user} />
        <div className="content">{content}</div>
        <footer>Copyright (c) AstaKanti Insurance Broker 2026</footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);

