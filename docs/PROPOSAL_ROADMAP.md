# Roadmap Proposal Operasional AstaKanti

## Modul yang Sudah Siap untuk Demo Operasional

- Login role Corporate dan Puskop.
- Import data Excel `.xlsb` dari sheet `User Login` dan `Deklarasi`.
- Dashboard ringkasan premi, klaim, rasio, top 10 premi, dan top 10 klaim.
- Daftar anggota, polis, perusahaan, dan klaim dengan pencarian dan pagination.
- Detail klaim per anggota.
- Update data peserta, jenis meninggal, dokumen, dan status klaim.
- Audit log perubahan data.
- Export CSV untuk klaim dan polis.

## Prioritas Implementasi untuk Dipakai Harian

1. Migrasi database dari SQLite ke PostgreSQL.
2. Deployment server internal/cloud dengan domain dan HTTPS.
3. Backup database otomatis harian.
4. Manajemen user: tambah user, reset password, nonaktifkan user.
5. Filter dashboard: CU Primer, TP, produk, periode, dan status klaim.
6. Export Excel terformat sesuai template laporan.
7. Approval workflow untuk perubahan status klaim.
8. Audit log lengkap dengan tampilan perbandingan sebelum/sesudah.
9. Role tambahan bila diperlukan: admin operasional, reviewer, viewer.
10. Hardening keamanan: rate limit login, password policy, session expiry, dan log akses.

## Catatan Teknis

- SQLite tetap cocok untuk demo dan validasi awal.
- Untuk multi-user harian, PostgreSQL lebih aman, cepat, dan mudah dibackup.
- Semua data mentah Excel disimpan sebagai `sourceData`, sehingga data sumber tetap dapat ditelusuri.
