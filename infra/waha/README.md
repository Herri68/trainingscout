# TrainingScout — WAHA + debouncer (VPS setup)

Bagian out-of-Vercel dari V2 WhatsApp. Dua container:

- **waha** — `devlikeapro/waha`, terhubung ke WhatsApp Web pakai SIM burner.
- **debouncer** — sidecar Node yang menerima webhook WAHA, debounce 4 detik per JID, lalu forward batch ke `${FORWARD_URL}` (Vercel `/api/wa/webhook`) dengan HMAC sha256 di header `x-waha-signature`.

## Prasyarat

- VPS Linux dengan Docker + Docker Compose.
- 1 SIM khusus (jangan WA pribadi — risiko ban). Pasang SIM di HP, login ke WhatsApp normal sekali.
- Domain/IP VPS tidak perlu public — webhook keluar saja.

## Setup pertama kali

```bash
cd infra/waha
cp .env.example .env
# Edit .env — isi WAHA_API_KEY (random string), FORWARD_URL (URL Vercel), FORWARD_HMAC_SECRET.
# FORWARD_HMAC_SECRET harus sama dengan WAHA_WEBHOOK_HMAC_SECRET di env Vercel.
docker compose up -d
docker compose logs -f waha
```

Saat container WAHA pertama kali start, log akan menampilkan QR code ASCII. Scan dengan WhatsApp di HP yang punya SIM burner (Settings → Linked Devices → Link a Device).

Verifikasi session aktif:

```bash
curl -H "X-Api-Key: $WAHA_API_KEY" http://127.0.0.1:3000/api/sessions/default
```

Status harus `WORKING`. Session di-persist di volume `waha-sessions`, restart container tidak butuh re-scan.

## Verifikasi pipeline

Sehat: tes ping ke debouncer.

```bash
curl http://127.0.0.1:8080/healthz
# {"ok":true,"buffered":0}
```

Tes end-to-end: dari WA pribadi (atau tester lain) kirim pesan ke nomor SIM burner. WAHA akan POST ke `http://debouncer:8080/inbound`, debouncer flush setelah 4 detik, forward ke Vercel. Cek log Vercel untuk `[wa/webhook]`.

## Env Vercel terkait

Set di Vercel project settings:

- `WHATSAPP_ENABLED=true`
- `WAHA_BASE_URL=https://<vps>:3000` (atau jalur tunnel/private)
- `WAHA_API_KEY=<sama dengan VPS .env>`
- `WAHA_SESSION_NAME=default`
- `WAHA_NUMBER=628123456789` (nomor SIM burner, format internasional tanpa `+`)
- `WAHA_WEBHOOK_HMAC_SECRET=<sama dengan FORWARD_HMAC_SECRET>`

`WAHA_BASE_URL` dipakai oleh Vercel untuk reply (sendText, typing). Kalau VPS tidak punya IP public + TLS, expose lewat Cloudflare Tunnel atau Tailscale Funnel.

## Troubleshooting

- **QR tidak muncul lagi setelah scan gagal**: `docker compose restart waha` lalu `docker compose logs -f waha`.
- **Nomor banned**: tukar SIM, hapus volume (`docker compose down -v`), redeploy, scan QR baru. Akun trainer dan peserta yang sudah claim tidak hilang (data di Supabase, JID akan terbind ulang saat peserta klik link berikutnya).
- **Debouncer tidak menerima event**: cek `WHATSAPP_HOOK_URL` di compose — harus `http://debouncer:8080/inbound` (resolve via Docker DNS antar service).
- **Vercel return 401 invalid signature**: pastikan `FORWARD_HMAC_SECRET` di VPS == `WAHA_WEBHOOK_HMAC_SECRET` di Vercel.
- **Vercel return 503 wa disabled**: set `WHATSAPP_ENABLED=true` di Vercel + redeploy.

## Catatan keamanan

- Jangan expose port 3000 (WAHA) ke public tanpa firewall — kunci ke `127.0.0.1` atau pakai tunnel terenkripsi.
- HMAC secret + API key minimal 32 karakter random.
- Volume `waha-sessions` berisi session WhatsApp aktif — backup berkala kalau penting.
