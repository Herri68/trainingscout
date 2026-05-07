# Plan: WA Magic Link Login (trainer)

> Source PRD: [plans/prd-wa-magic-link-login.md](prd-wa-magic-link-login.md)

## Architectural decisions

Durable decisions yang berlaku di seluruh implementasi:

- **Routes baru**:
  - `POST /api/auth/wa-magic-link` — server-side, generate magic link via Supabase Admin + kirim via WAHA, fallback ke email kalau WA tidak available.
- **Schema**: tidak ada perubahan DB. Single-trainer mapping disimpan di env.
- **Env vars baru**:
  - `TRAINER_EMAIL` — email trainer satu-satunya yang valid (case-insensitive compare).
  - `TRAINER_WA_JID` — JID WAHA tujuan magic link (format yang sama dengan payload `from` yang muncul di webhook WAHA).
- **Auth model**: tetap Supabase magic link via `auth.users.email`. WA hanya delivery channel, bukan factor identitas baru. `auth/callback` existing tidak berubah.
- **Fallback policy**: kalau `WHATSAPP_ENABLED ≠ true`, atau `getSessionStatus()` bukan `WORKING`/`STARTING`, atau `sendText` lempar error → otomatis pakai email path (`signInWithOtp` Supabase default). Trainer juga punya tombol secondary "Kirim via email" untuk pilih manual.
- **Anti-enumeration**: email tidak terdaftar dan email valid tapi WA gagal → response shape sama (`200 OK` dengan body bermakna), UI render pesan generik.
- **Rate limit**: in-memory throttle per-IP, window 30 detik, max 3 request. Internal-only fitur, tidak butuh Redis.
- **Logging**: hanya server log (Vercel runtime). Email & JID di-mask. Action link tidak pernah di-log.

---

## Phase 1: Magic link via WhatsApp (single phase)

**User stories**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10

### What to build

Trainer login dengan ketik email yang sama seperti sekarang. Kalau email match `TRAINER_EMAIL`, sistem generate Supabase magic link server-side dan kirim ke `TRAINER_WA_JID` via WAHA. UI `/login` menampilkan dua tombol: primary "Kirim magic link via WhatsApp" (menuju route baru) dan secondary "Kirim via email" (jalur lama, tetap aktif). Saat WAHA down atau send error, sistem otomatis fallback ke email magic link Supabase, dan UI sukses berubah jadi "WhatsApp gangguan, link dikirim ke email …". Email yang tidak terdaftar mendapat response generik anti-enumeration. Endpoint diberi rate limit ringan in-memory.

### Acceptance criteria

- [ ] Env baru `TRAINER_EMAIL` dan `TRAINER_WA_JID` didokumentasikan di README + `.env.example`. Tanpa kedua env, route otomatis fallback ke email path (atau 500 kalau email path juga tidak siap).
- [ ] Halaman `/login` punya tombol primary "Kirim magic link via WhatsApp" dan tombol/text-link secondary "Kirim via email"; jalur email lama tetap berfungsi tanpa menyentuh route baru.
- [ ] `POST /api/auth/wa-magic-link` dengan body `{ email }`:
  - Email tidak match `TRAINER_EMAIL` (case-insensitive) → response `{ ok: false, reason: "not_registered" }` (status 200, anti-enumeration).
  - Happy path WA: panggil `supabase.auth.admin.generateLink({ type: "magiclink", email, options.redirectTo: "/auth/callback" })`, kirim `action_link` ke `TRAINER_WA_JID` via `sendText`. Response: `{ ok: true, channel: "wa", maskedDestination }`.
  - WAHA tidak available (`WHATSAPP_ENABLED ≠ true`, `getSessionStatus()` bukan WORKING/STARTING, atau `sendText` throw) → fallback `signInWithOtp` (email Supabase default), response `{ ok: true, channel: "email", reason: "wa_unavailable" | "wa_send_failed", maskedDestination }`.
  - `generateLink` gagal/timeout → 500 generic.
  - Email kosong / format invalid → 400.
- [ ] UI sukses menampilkan masked destination: WA → `+62 81xx xxx 2556` (4 digit terakhir), email → `e***@example.com` (huruf pertama saja). Sukses state juga menyebut "Link berlaku ~1 jam, sekali pakai." Saat fallback aktif, UI tambah note "WhatsApp gangguan, link dikirim ke email."
- [ ] Rate limit in-memory: per-IP, window 30 detik, max 3 request. Request ke-4 dalam window dapat 429 dengan body `{ ok: false, reason: "rate_limited" }`.
- [ ] Pesan WA berisi link Supabase magic link + catatan masa berlaku, tidak ada token/kredensial lain. Action link tidak pernah masuk ke server log.
- [ ] Server log (mask email/JID): `sent_via=wa`, `sent_via=email reason=<wa_unavailable|wa_send_failed|env_missing>`, `not_registered`, `rate_limited`, `generate_link_failed`.
- [ ] Smoke test internal:
  - Email match + WAHA WORKING → link masuk WA, klik → masuk dashboard.
  - Email match + WAHA STOPPED (atau `WHATSAPP_ENABLED=false`) → link masuk email, klik → masuk dashboard.
  - Email tidak match → UI tampil error generik tanpa membocorkan apakah email ada atau tidak.
  - Klik tombol secondary "Kirim via email" → flow lama jalan tanpa hit route baru.
  - Spam tombol >3x dalam 30 detik → tombol di-disable / response 429.
