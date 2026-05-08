// Template pesan WhatsApp. Disentuh saat copywriting final.

export function welcomeBubble1(name: string): string {
  return `Halo ${name}! 👋 Saya TrainingScout, asisten pra-kelas yang akan ngobrol singkat denganmu.`;
}

export function welcomeBubble2(batchName: string): string {
  return `Sebelum mulai: yang kamu ceritakan di sini akan jadi ringkasan untuk trainer kelas "${batchName}". Sesi ~15 menit. Siap mulai?`;
}

export const NO_TOKEN =
  "Maaf, sepertinya kamu belum klik link dari trainer. Hubungi trainer untuk mendapatkan link.";

export const TOKEN_TAKEN =
  "Link ini sudah dipakai. Hubungi trainer untuk link baru kalau ada masalah.";

export const BATCH_CLOSED =
  "Sesimu sudah ditutup karena deadline. Trainer akan menghubungi kalau masih bisa diakomodasi.";

export const SESSION_LOCKED =
  "Sesimu sudah selesai dan diteruskan ke trainer. Kalau ada update penting, hubungi trainermu langsung ya 🙂";

export const CONSENT_DECLINED =
  "Oke, kamu bisa hubungi trainermu kalau berubah pikiran. Selamat hari 🙂";

export const CONSENT_GRANTED_ACK = "Siap, kita mulai sebentar lagi 🙂";

export const REJECT_MEDIA =
  "Sesi ini hanya text atau voice note ya 🙂 Tolong tulis atau kirim voice (≤2 menit) untuk dijawab.";

export const VOICE_TOO_LONG =
  "Voice-nya terlalu panjang. Tolong dipotong jadi pesan-pesan lebih singkat (≤2 menit) ya 🙂";

export const VOICE_FAILED =
  "Maaf, voice-nya kurang jelas. Tolong kirim ulang atau ketik ya 🙂";

export function reminder24h(name: string, batchName: string): string {
  return `Halo ${name}, ini pengingat: sesi pra-kelas "${batchName}" deadlinenya kurang dari 24 jam lagi. Yuk lanjutkan, kira-kira 15 menit ngobrol santai. Kirim pesan apa saja untuk lanjut ya 🙂`;
}

export function reminder2h(name: string, batchName: string): string {
  return `Heads up ${name}, deadline sesi "${batchName}" kurang dari 2 jam lagi ⏰ Kalau bisa, selesaikan sekarang. Kirim pesan apa saja untuk lanjut.`;
}

export function broadcastInvite(
  name: string,
  batchName: string,
  courseName: string | null,
  token: string,
  waLink: string | null,
): string {
  const courseSuffix = courseName ? ` (${courseName})` : "";
  const startInstruction = waLink
    ? `Untuk mulai, klik link ini:\n${waLink}`
    : `Untuk mulai, balas pesan ini dengan:\nHalo TrainingScout ${token}`;
  return `Halo ${name}! 👋

Trainer mengundang kamu ikut sesi pra-kelas singkat untuk "${batchName}"${courseSuffix}. Sesi ~15 menit ngobrol santai dengan asisten kami.

${startInstruction}

Sampai ketemu! 🙂`;
}
