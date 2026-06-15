# Migration Map Excel VBA ke Web

## Modul Excel lama

1. `UserForm1baru.txt`
   - Login username/password.
   - Role ditentukan dari user: `Coorporate` dan `Puskop`.
   - Role mengatur sheet mana yang terlihat/terproteksi.

2. `UserForm2baru-v2.txt`
   - Form pencarian nomor anggota koperasi.
   - Sumber data utama: sheet `Deklarasi`.
   - Mengambil data dasar anggota: nama, tanggal lahir, jenis kelamin, CU primer, TP.
   - Menghitung total benefit berdasarkan `Pinjaman`, `Simpanan`, dan `Solduka`.
   - Mengatur status klaim: pengajuan, analisa, pending, ditolak, disetujui, dibayar.
   - Mengatur kelengkapan dokumen dan jenis meninggal dunia.

## Padanan di versi web

| Excel/VBA | Web Starter |
|---|---|
| Sheet `User Login` | Tabel `User` + JWT Login |
| Sheet `Deklarasi` | Tabel `Member` dan `Benefit` |
| Show/hide sheet berdasarkan role | Authorization middleware `requireAuth` dan `requireCorporate` |
| CBCari_Click | `GET /api/members/search?q=...` |
| SUMIFS Pinjaman/Simpanan/Solduka | Reducer/aggregate dari tabel `Benefit` |
| Checkbox status klaim | `PATCH /api/benefits/:id/status` |
| Checkbox dokumen | `PATCH /api/members/:id` field `documents` |
| Riwayat perubahan tidak eksplisit | Tabel `AuditLog` |

## Prioritas pengembangan berikutnya

1. Import data Excel `.xlsb` ke CSV, lalu import ke database.
2. Tambahkan filter dashboard berdasarkan CU Primer, TP, tanggal, status klaim, dan jenis benefit.
3. Tambahkan export Excel/PDF laporan untuk kebutuhan kantor.
4. Pisahkan akses Puskop agar hanya melihat data wilayah/unitnya sendiri.
5. Tambahkan bulk update untuk data ribuan baris.
6. Tambahkan audit trail yang bisa difilter per user dan per anggota.
