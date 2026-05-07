## Problem Statement

Trainer (single, internal) login ke TrainingScout sekarang via magic link email. Praktik nyata: email jarang dibuka, magic link sering masuk Promotions tab Gmail atau di-skip karena baru ngumpul setelah beberapa jam, akibatnya trainer lambat masuk dashboard saat butuh segera (cek brief, follow-up peserta, dsb). Channel WA yang sudah jadi tulang punggung V2 (untuk wawancara peserta) jauh lebih cepat dibaca trainer di HP.

## Solution

Tambah jalur magic link via WhatsApp di halaman login. Trainer ketik email seperti biasa; sistem mengenali email sebagai trainer terdaftar, generate Supabase magic link server-side via Admin API, dan kirim link itu ke nomor WA trainer (yang sudah ke-map di env) via WAHA. Halaman login lama (magic link via email) dipertahankan sebagai fallback eksplisit. Kalau WAHA sedang down, sistem otomatis fallback ke email magic link tanpa intervensi trainer.

## User Stories

### Trainer
1. Sebagai trainer, saya ingin tombol "Kirim magic link via WhatsApp" di halaman login, supaya saya bisa terima link di channel yang saya cek terus-menerus.
2. Sebagai trainer, saya ingin cukup ketik email yang sudah saya pakai untuk login, supaya tidak perlu hafal/ketik nomor WA setiap mau login.
3. Sebagai trainer, saya ingin tahu link sudah terkirim ke WA saya (konfirmasi nomor yang ter-mask) dan link kadaluarsa berapa lama, supaya tahu kapan harus klik.
4. Sebagai trainer, saya ingin link yang masuk ke WA cuma bisa dipakai sekali dan punya format domain yang sama dengan dashboard (`trainingscout.vercel.app`), supaya kelihatan legit dan aman.
5. Sebagai trainer, saya ingin kalau WAHA sedang gangguan, sistem tetap bisa login saya — otomatis kirim via email — dan kasih tahu di UI bahwa fallback dipakai.
6. Sebagai trainer, saya ingin tetap bisa pilih "Kirim via email" manual kalau saya memang lagi di depan komputer dan email lebih cepat, supaya jalur lama tidak hilang.
7. Sebagai trainer, kalau saya ketik email yang bukan email trainer terdaftar, saya ingin pesan error yang jelas, supaya tidak bingung kenapa link tidak datang.

### System / Owner
8. Sebagai owner, saya ingin mapping email↔WA trainer ada di env (`TRAINER_EMAIL`, `TRAINER_WA_JID`), supaya tidak perlu tabel baru di DB untuk fitur internal-only.
9. Sebagai owner, saya ingin endpoint generate-link diproteksi rate limit ringan, supaya tidak bisa di-spam dari luar (walau WA sebagai delivery sudah jadi safety net).
10. Sebagai owner, saya ingin log jelas saat: link dikirim ke WA sukses, fallback ke email aktif (alasan), email tidak terdaftar — supaya troubleshoot cepat.

## Implementation Decisions

### Identitas & mapping
- Single trainer, internal-only: tidak ada tabel `trainer_profiles`. Mapping disimpan sebagai dua env baru: `TRAINER_EMAIL` (lower-cased, dibandingkan case-insensitive) dan `TRAINER_WA_JID` (format JID WAHA, mis. `6281234567890@c.us` atau `<lid>@lid` sesuai format yang muncul di payload WAHA). Validasi env at boot/handler entry — jika absent, route mengembalikan 500 / fallback ke email path.
- Email yang diketik trainer harus match `TRAINER_EMAIL` (case-insensitive). Email lain → response error generik "email tidak terdaftar" (jangan beda-beda response untuk email valid vs invalid agar tidak jadi enumeration oracle).

### UI login
- Halaman `/login` tetap satu file, tapi sekarang punya **dua tombol**:
  - Primary: "Kirim magic link via WhatsApp" (default, paling menonjol).
  - Secondary: "Kirim via email" (link/text-button kecil di bawah, tetap pakai `signInWithOtp` client-side seperti sekarang).
- State sukses WA: tampilkan "Magic link sudah dikirim ke WA **+62 81xx xxx 2556** (nomor di-mask 4 digit terakhir)." + "Link berlaku ~1 jam, sekali pakai."
- State fallback: kalau WA gagal/disabled, success message berubah jadi "WhatsApp sedang gangguan, link dikirim ke email **e**\*\*\*\***@example.com**." + tetap kirim via Supabase email path.

### Server route baru
- `POST /api/auth/wa-magic-link` (server-side, Node runtime):
  - Body: `{ email: string }`.
  - Step 1: validasi email = `TRAINER_EMAIL` (case-insensitive). Kalau tidak match, return 200 dengan body `{ ok: false, reason: "not_registered" }` (UI render error generik).
  - Step 2: cek `WHATSAPP_ENABLED === "true"` && `getSessionStatus()` returns `WORKING`/`STARTING`. Kalau tidak: jalankan path fallback (lihat di bawah) dan return `{ ok: true, channel: "email", reason: "wa_unavailable" }`.
  - Step 3: panggil Supabase Admin: `supabase.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: `${NEXT_PUBLIC_APP_URL}/auth/callback` } })`. Ambil `data.properties.action_link`.
  - Step 4: kirim ke `TRAINER_WA_JID` via `sendText(jid, "Halo! Klik link ini untuk masuk ke TrainingScout:\n\n{action_link}\n\nLink berlaku ~1 jam, sekali pakai.")`. Kalau `sendText` lempar error → fallback path (Step 5).
  - Step 5 (fallback email): panggil `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: ... } })` server-side dengan service role atau anon key. Karena Supabase Admin sudah generate link tapi tidak otomatis kirim email-nya, kirim email manual via Resend dengan template yang sama dengan magic link standar — atau lebih simpel: panggil sekali lagi `signInWithOtp` (Supabase resend email) sebagai jalur kedua. Trade-off di "Further notes".
  - Return `{ ok: true, channel: "wa" | "email", maskedDestination: "+62 81xx xxx 2556" | "e***@example.com" }`.

### Rate limiting
- Throttle ringan di route handler: simple in-memory map per-IP (atau per-email) dengan window 30 detik = max 3 request. Karena fitur internal & traffic rendah, tidak perlu Redis. Worst case: tetap di-cap di sisi Supabase yang punya rate-limit OTP sendiri.

### Halaman fallback eksplisit (`/login` email path)
- Tombol secondary "Kirim via email" memanggil flow lama (`signInWithOtp` di client). Tidak menyentuh route baru. Tetap berfungsi walau WAHA env tidak di-set sama sekali.

### Logging & observability
- Server log: `[auth/wa-magic-link] sent_via=wa email=<masked> jid=<masked>` / `sent_via=email reason=<wa_down|send_failed>` / `not_registered email=<masked>`.
- Tidak log `action_link` (sensitif).

### Edge cases
- Email kosong / format invalid → 400.
- `TRAINER_EMAIL` atau `TRAINER_WA_JID` belum ter-set di env → log warning, fallback ke email path otomatis (atau 500 kalau email path juga tidak siap).
- Trainer klik link expired → Supabase callback handle native (redirect ke `/login` dengan error message) — tidak ada perubahan dari sekarang.
- Trainer ketik email beda case dari env → tetap dianggap match (case-insensitive compare).
- WAHA `sendText` 200-OK tapi WhatsApp tidak deliver (silent fail seperti issue `@lid → @c.us` lama) → trainer akan complain manual; tidak ada delivery-receipt loop di V1 fitur ini.
- Kalau Supabase Admin `generateLink` gagal/timeout → return 500 generic, suggest UI retry.

## Out of Scope

- Multi-trainer support / tabel `trainer_profiles`. Ditunda sampai TrainingScout punya >1 trainer.
- Login peserta via WA. Peserta tetap pakai token URL seperti sekarang (web) atau langsung via WA flow (channel WA) — bukan magic link auth.
- OAuth provider (Google/GitHub) — tidak diminta.
- Two-factor / MFA. Magic link sendiri sudah jadi single factor; nomor WA hanya delivery channel, bukan factor.
- Password-based login. Tidak ada hashing/storing password.
- Auto-detect fallback (kirim WA + email simultan untuk redudancy). Pure WA primary, email hanya kalau WA path gagal.
- Push notification / native app deep-link. Link tetap https URL.
- Audit log persisten di DB. Cuma server log.

## Further Notes

### Trade-off pengiriman email pada fallback path
Supabase Admin `generateLink` mengembalikan link tanpa otomatis mengirim email (kecuali kalau dipanggil dengan opsi yang trigger send). Untuk fallback email yang konsisten:
- **Opsi A**: panggil `signInWithOtp` (yang akan men-trigger Supabase mengirim email default). Pro: zero kode template. Kontra: link yang dikirim email ≠ link yang sudah di-generate WA path (walau keduanya valid). Practical impact: nol — trainer pakai salah satu link saja.
- **Opsi B**: pakai Resend untuk kirim email custom dengan link yang sama. Pro: branding konsisten. Kontra: duplikasi template magic link.
- **Pilihan default**: Opsi A. Simpler, tested path.

### Kapan dianggap "WAHA gangguan"
`getSessionStatus()` mengembalikan null atau `status` ∉ {`WORKING`, `STARTING`}. Sama seperti banner di dashboard batch detail (V2 Phase 5).

### Risiko
1. **Trainer punya satu nomor WA → kalau HP hilang/banned, magic link tidak bisa diterima.** Mitigasi: tombol "Kirim via email" tetap terpampang, jadi trainer bisa pilih manual.
2. **WAHA banned saat trainer urgently butuh login.** Mitigasi: fallback otomatis ke email + banner di login page kalau WA gagal.
3. **Link bocor ke chat WA orang lain (mis. trainer salah forward).** Sama risk-nya dengan email forward — Supabase magic link sudah single-use & expire 1 jam.

### Open questions yang ditunda ke implementasi
- Format teks pesan WA login — copywriting final saat code (pre-fill pakai contoh di Implementation Decisions).
- Apakah `[auth/wa-magic-link]` log perlu ke external (Logflare/Axiom) atau cukup Vercel runtime log — putuskan saat smoke test.
- Apakah perlu spinner/skeleton state khusus saat tombol submit (network call ~1–3 detik karena hit Supabase Admin + WAHA sequential) — likely yes, design saat coding.
