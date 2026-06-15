# Prompt Codex untuk Pengembangan Lanjutan

Saya memiliki starter project web `ksp-insurance-web-starter` yang merupakan migrasi dari Excel Macro + VBA broker asuransi KSP/CU.

Tugas Anda adalah menyempurnakan starter project ini agar siap dipakai produksi internal.

Konteks logika dari Excel lama:

1. UserForm1 adalah login. Username/password diambil dari sheet `User Login`. Role lama adalah `Coorporate` dan `Puskop`. Corporate dapat melihat semua sheet, Puskop hanya melihat modul update klaim dan data tertentu.
2. UserForm2 adalah form utama. User memasukkan `No. Keaggotaan Koperasi`, sistem mencari data di sheet `Deklarasi`, mengambil baris pertama sebagai data dasar anggota, lalu menghitung total benefit `Pinjaman`, `Simpanan`, dan `Solduka` dari seluruh baris yang cocok.
3. Form memiliki status klaim untuk masing-masing benefit: `Pengajuan`, `Analisa`, `Pending`, `Ditolak`, `Disetujui`, dan `Dibayar`. Jika status ditolak, harus ada alasan. Jika disetujui/dibayar, harus ada tanggal.
4. Form juga menyimpan jenis meninggal dunia dan kelengkapan dokumen.

Yang harus Anda implementasikan:

- Perbaiki model database agar tidak ada duplikasi benefit saat import CSV berulang. Gunakan unique key yang masuk akal.
- Tambahkan import `.xlsx/.xlsb` langsung atau minimal import CSV yang robust dengan mapping header fleksibel.
- Tambahkan pagination, filter, dan search dashboard untuk data besar.
- Tambahkan role access control detail: `CORPORATE` bisa semua data; `PUSKOP` hanya bisa data CU/TP yang ditugaskan.
- Tambahkan halaman audit log yang mudah dibaca.
- Tambahkan validasi status klaim: satu benefit hanya boleh punya satu status aktif; `DITOLAK` wajib alasan; `DISETUJUI` wajib tanggal disetujui; `DIBAYAR` wajib tanggal dibayar.
- Tambahkan export laporan Excel/PDF.
- Buat UI lebih profesional tetapi tetap sederhana untuk user kantor.
- Tambahkan test untuk API penting.

Jangan mengubah filosofi utama: data besar harus diproses oleh database/backend, bukan oleh looping di frontend seperti macro Excel.
