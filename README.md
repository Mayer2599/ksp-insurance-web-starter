# KSP/CU Insurance Web Starter

Starter project ini dibuat untuk memigrasikan tools Excel Macro + VBA broker asuransi menjadi aplikasi web yang lebih cepat, rapi, dan mudah dikembangkan.

## Fitur versi awal

- Login berbasis role: `CORPORATE` dan `PUSKOP`.
- Dashboard ringkas total anggota, benefit, uang pertanggungan, dan premi.
- Pencarian nomor anggota koperasi.
- Detail anggota dan total benefit `PINJAMAN`, `SIMPANAN`, `SOLDUKA`.
- Update kelengkapan dokumen.
- Update status klaim: `PENGAJUAN`, `ANALISA`, `PENDING`, `DITOLAK`, `DISETUJUI`, `DIBAYAR`.
- Audit log untuk perubahan data.

## Stack

- Frontend: React + Vite
- Backend: Express.js
- Database awal: SQLite via Prisma
- Auth: JWT + bcrypt

SQLite dipakai agar mudah dijalankan di laptop. Saat data sudah besar dan multi-user, pindahkan datasource Prisma ke PostgreSQL.

## Cara menjalankan

```bash
npm run install:all
cp backend/.env.example backend/.env
npm run db:push
npm run seed
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:4000`

Akun demo:

- Corporate: `akib` / `Akib_CUPK@2025`
- Puskop: `cupk` / `CUPK@2025`

## Import data dari Excel

Versi awal ini sengaja memakai CSV agar proses migrasi lebih aman.

1. Buka sheet `Deklarasi` di Excel.
2. Simpan sebagai CSV UTF-8.
3. Jalankan:

```bash
cd backend
npm run import:csv -- ./data/deklarasi.csv
```

Header CSV yang dibaca mengikuti header Excel lama, misalnya:

- `No. Keaggotaan Koperasi`
- `No NIK`
- `Nama Anggota`
- `Jenis Kelamin`
- `Nama CU Primer`
- `Nama TP`
- `Nama Benefit`
- `Uang Pertanggungan`
- `Premi`
- `Nama Asuransi`
- `Klaim Pengajuan`
- `Klaim Analisa`
- `Klaim Pending`
- `Klaim Ditolak`
- `Klaim Disetujui`
- `Klaim Dibayar`

## Catatan penting keamanan

Jangan menyimpan password asli di database. Starter ini sudah memakai bcrypt. Jangan upload file `.env` ke GitHub.
