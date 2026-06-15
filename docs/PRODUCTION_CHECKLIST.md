# Checklist Produksi Harian

## Sebelum Dipakai Tim

1. Isi `backend/.env` dari `backend/.env.example`.
2. Gunakan `JWT_SECRET` yang panjang dan berbeda dari contoh.
3. Jalankan backend dan frontend di terminal terpisah.
4. Login sebagai Corporate, buka menu `User`, lalu buat akun tim sesuai kebutuhan.
5. Jalankan backup database sebelum import ulang workbook.

## Command Operasional

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
npm.cmd --prefix backend run backup:sqlite
npm.cmd --prefix backend run import:xlsb -- "D:\Tulang Nelson\Desember2025\MASTER DATA DASBORD KSP PANCUR KASIH 2025-2026-v2.xlsb"
npm.cmd --prefix backend start
npm.cmd --prefix frontend run dev -- --host 0.0.0.0 --port 5174
```

## Verifikasi Harian

- Buka `http://localhost:4000/health`.
- Buka `http://localhost:5174`.
- Login Corporate dan cek Dashboard.
- Coba filter Dashboard berdasarkan CU Primer/Produk.
- Coba export Klaim dan Polis ke Excel.
- Cek menu Audit setelah ada perubahan status klaim.

## Catatan Produksi

- SQLite cukup untuk demo dan pemakaian lokal terbatas.
- Untuk multi-user serius di jaringan kantor, migrasi database ke PostgreSQL disarankan.
- Backup folder `backups/` perlu disalin berkala ke lokasi eksternal.
