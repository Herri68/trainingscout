# Plan: Customer Insight Dashboard

> Source PRD: [plans/prd-customer-insight-dashboard.md](prd-customer-insight-dashboard.md)

## Architectural decisions

Durable decisions yang berlaku lintas fase:

- **Routes**:
  - `/dashboard` — di-rewrite jadi customer insight view (list peserta lintas batch).
  - `/dashboard/batches/[id]` — tetap, halaman operasional batch.
  - `/dashboard/participants/[id]` — route baru, profil peserta.
- **Schema**: tambah dua kolom nullable di `participants`:
  - `level` — enum `pemula | menengah | mahir`.
  - `goal` — text pendek (~50 char). Sentinel `"belum jelas"` ≠ NULL.
- **Filter state**: URL searchParams (`?batch=&level=&q=`) sebagai source of truth. Server-side filtering via Supabase, hard limit 500, no pagination.
- **LLM**: Anthropic SDK, model `claude-haiku-4-5`. Reuse `ANTHROPIC_API_KEY`. Output JSON tervalidasi Zod. Fail-silent (log + chip "—"), tidak menyandera status peserta.
- **Single source of truth ekstraksi**: satu fungsi `extractInsightFor(participantId)` dipakai oleh auto-hook, tombol manual, dan script backfill.
- **Authorization**: ikuti pola query `participants` yang sudah ada (trainer hanya lihat peserta dari batch miliknya).

---

## Phase 1: Dashboard list peserta lintas batch + filter batch

**User stories**: 1, 2, 6, 9, 13, 18

### What to build

Migrasi schema tambah kolom `level` & `goal` (kosong, belum diisi). Rewrite halaman `/dashboard`: dari list batch jadi list peserta lintas batch milik trainer. Toolbar minimal: dropdown filter batch yang state-nya tertulis di URL (`?batch=<id>`). Tiap baris menampilkan nama, batch asal, badge status; peserta yang belum selesai diberi tag "belum wawancara". Form "Buat batch baru" & list batch tetap discoverable (pindah ke section bawah halaman atau route terpisah). Halaman `/dashboard/batches/[id]` tidak berubah.

### Acceptance criteria

- [ ] Migration menambah kolom `level` (enum) dan `goal` (text) nullable di `participants`.
- [ ] `/dashboard` menampilkan semua peserta milik trainer (lintas batch) dengan hard limit 500.
- [ ] Dropdown filter batch berfungsi & state tertulis di URL searchParams; back button bekerja.
- [ ] Peserta yang belum selesai wawancara muncul dengan tag "belum wawancara".
- [ ] Akses ke "Buat batch baru" dan list batch tetap tersedia dari dashboard.
- [ ] Halaman batch detail (CSV upload, broadcast WA, generate brief, copy link) berjalan persis seperti sebelumnya.

---

## Phase 2: Auto-ekstraksi level & goal saat wawancara selesai

**User stories**: 5, 14, 15, 16

### What to build

Fungsi internal `extractInsightFor(participantId)` yang membaca transkrip peserta, memanggil Claude Haiku 4.5 dengan prompt Bahasa Indonesia + few-shot, memvalidasi output via Zod (`{ level: enum, goal: string ≤ 5 kata }`), dan menulis ke `participants.level` & `participants.goal`. Hook fungsi ini di titik pipeline saat status peserta transition ke "selesai". Pembungkusnya try/catch — kegagalan apapun (timeout, JSON malformed, Zod invalid) di-log saja, status peserta tetap "selesai", kolom tetap NULL. UI list peserta menambah chip `level` (warna sesuai enum) dan chip `goal` (text mentah) untuk peserta selesai; chip placeholder "—" untuk yang gagal/belum diekstrak.

### Acceptance criteria

- [ ] `extractInsightFor` ada sebagai fungsi reusable, validasi Zod, fail-silent.
- [ ] Saat peserta menyelesaikan wawancara baru, `level` & `goal` terisi otomatis tanpa intervensi manual.
- [ ] Kegagalan LLM (simulasikan: API key invalid / output non-JSON) tidak mengubah status peserta menjadi non-selesai.
- [ ] List peserta menampilkan chip level & goal untuk yang sukses, chip "—" untuk yang gagal/belum.
- [ ] Sentinel `"belum jelas"` disimpan apa adanya (bukan NULL) saat LLM tidak menemukan goal eksplisit.

---

## Phase 3: Filter level, search, dan summary strip

**User stories**: 3, 4, 7, 8

### What to build

Tambah kontrol toolbar: dropdown filter `level` (default "Semua level") dan input search yang case-insensitive contains terhadap `name`, `wa`, `goal`. Keduanya tertulis di URL (`?level=&q=`). Server-side query digabung (`.eq` untuk batch & level, `.ilike` untuk search). Strip ringkasan agregat di atas toolbar: total peserta, jumlah selesai, breakdown level (pemula / menengah / mahir) — dihitung dari hasil query post-filter. Empty state khusus saat filter aktif tapi nol hasil, dengan tombol "reset filter".

### Acceptance criteria

- [ ] Filter level & search bekerja terpisah maupun kombinasi dengan filter batch.
- [ ] Search mencocokkan goal (mis. ketik "saas" → muncul peserta yang goalnya mengandung "saas").
- [ ] Strip agregat menampilkan total, selesai, dan breakdown level; angka berubah saat filter berubah.
- [ ] Filter & search state shareable via URL.
- [ ] Empty state "tidak ada hasil" muncul dengan tombol reset filter saat semua filter tidak match apapun.

---

## Phase 4: Halaman profil peserta + tombol Analisis ulang

**User stories**: 10, 11, 12

### What to build

Route baru `/dashboard/participants/[id]` yang menampilkan: nama, WA, status, link balik ke batch asal, chip level & goal, transkrip wawancara lengkap (Q&A pairs). Tombol "Analisis ulang" memanggil server action yang sync-execute `extractInsightFor` lalu refresh halaman. Klik baris peserta di `/dashboard` navigate ke route ini. Authorization: trainer hanya boleh lihat peserta dari batch miliknya.

### Acceptance criteria

- [ ] Klik baris peserta di dashboard root membawa ke `/dashboard/participants/[id]`.
- [ ] Halaman menampilkan profil lengkap + transkrip + link balik ke batch.
- [ ] Tombol "Analisis ulang" mengupdate `level`/`goal` & UI mencerminkan hasil baru.
- [ ] Trainer tidak bisa mengakses peserta dari batch milik trainer lain (404/forbidden).
- [ ] Tombol bekerja juga untuk peserta yang sebelumnya gagal ekstraksi (chip "—" jadi terisi).

---

## Phase 5: Script backfill one-off

**User stories**: 17

### What to build

Script Node/TS sekali-pakai (`scripts/backfill-insights.ts`) yang query semua `participants` dengan `status=selesai AND level IS NULL`, loop dan panggil `extractInsightFor` untuk masing-masing, log progress per peserta (sukses / gagal). Dijalankan manual via npm script setelah deploy Phase 2 berjalan stabil.

### Acceptance criteria

- [ ] Script dapat di-invoke via npm/pnpm script.
- [ ] Script memproses semua peserta yang memenuhi kriteria, idempotent (re-run tidak mengulang yang sudah terisi).
- [ ] Output log jelas (jumlah diproses, sukses, gagal) di terminal.
- [ ] Setelah script jalan sukses, peserta lama menampilkan chip level/goal di dashboard (bukan "—").
