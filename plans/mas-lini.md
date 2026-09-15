# Mas Lini — WhatsApp Creative Talk

Alur disetujui: chat masuk → nama → bisnis → framework → empat topik feedback opsional. Gunakan Bang Herri; arahkan respons negatif ke 08112268556. Chat tetap terbuka.

## Implementasi

- Kontak mandiri tanpa batch/token; simpan nomor, nama, bisnis dan progres minimal untuk melanjutkan chat.
- Framework dikirim sebelum feedback. Feedback: kesan umum, manfaat, perbaikan, harapan lanjutan.
- Pengalihan menghentikan penggalian feedback. Tidak mengirim pesan otomatis ke Bang Herri.
- Nonaktifkan jalur operasional lama; pertahankan data lama.
- Migrasi tambahan dengan akses database hanya server; deduplikasi webhook dan penguncian sementara per kontak.

## Risiko dan pengujian

- WhatsApp LID bukan nomor HP: minta nomor jika tidak tersedia.
- Uji alur lengkap, penolakan feedback, pengalihan, pesan berulang, autentikasi webhook dan grup.
- Typecheck, unit/integration test, build; smoke HTTP untuk jalur web yang dinonaktifkan.
- QA live: chat nomor baru; kirim nama/bisnis; buka framework; jawab empat topik; tanggapan negatif; chat kembali.

Selesai lokal ketika implementasi dan tes lulus. Aktivasi memerlukan migrasi Supabase, deployment, dan uji nomor WhatsApp asli. Tidak ada perubahan database produksi atau broadcast dalam pekerjaan lokal ini.

## Hasil validasi lokal

- Dibangun: alur kontak mandiri, ekstraksi identitas dan feedback, pengalihan Bang Herri, retry/deduplikasi, migrasi database, halaman depan WhatsApp, penonaktifan jalur training.
- Area utama: `lib/mas-lini`, webhook WhatsApp, middleware, migrasi 0008, halaman depan, konfigurasi cron.
- 18 tes baru; total 50 tes lulus. Typecheck dan production build lulus. Diff check bersih.
- Tes mencakup nama/nomor/bisnis sebelum framework, empat feedback, penolakan, LID, chat kembali, pengalihan, output model invalid, HMAC, grup/session lain, retry dan duplikasi. Database/AI/WAHA pada tes integrasi dimock; migrasi SQL belum dieksekusi.
- Lint belum terverifikasi: skrip lama membuka wizard konfigurasi ESLint, bukan menjalankan pemeriksaan.
- Browser smoke otomatis lewat browser lokal: halaman depan tampil, tombol WhatsApp terlihat, tidak ada console error. Tampilan desktop 1280x800 dan mobile 390x844 diperiksa.
- HTTP smoke: halaman depan 200; dashboard, login, link sesi, kedua cron, dan broadcast 410.
- QA manual WhatsApp nyata, izin folder Drive, serta RLS/RPC di Supabase masih pending aktivasi.
- Batasan: deteksi sentimen/identitas bergantung pada model AI. Pengiriman pesan dan pencatatan konfirmasi tidak atomik terhadap WAHA; retry dapat mengulang balasan jika konfirmasi penyimpanan gagal. Pending delivery perlu dipantau saat uji coba.
- Data lama dipertahankan; tidak membuat dashboard baru. Belum commit atau deploy.
- Tahap berikutnya: terapkan migrasi dan uji coba terbatas sebelum digunakan peserta umum.
