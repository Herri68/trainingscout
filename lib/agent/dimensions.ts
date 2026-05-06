// 6 dimensi kesiapan peserta (rubrik MVP — hardcoded).
// Urutan di array tidak menentukan urutan wawancara; agent boleh memilih.

export const DIMENSIONS = [
  {
    id: "profil",
    label: "Profil & konteks",
    description:
      "Peran/pekerjaan saat ini, alasan ikut kelas, ekspektasi pribadi vs ekspektasi penyelenggara.",
  },
  {
    id: "goal",
    label: "Goal konkret pasca-kelas",
    description:
      "Apa yang ingin bisa dilakukan setelah kelas — proyek nyata, eksplorasi, upskill kerja. Sebisa mungkin sampai output yang bisa dibayangkan.",
  },
  {
    id: "level_ai_coding",
    label: "Level AI coding",
    description:
      "Tools yang pernah dipakai (ChatGPT, Copilot, Cursor, Claude Code, dll), seberapa sering, untuk tugas apa.",
  },
  {
    id: "level_vibe_coding",
    label: "Level vibe coding & app-building",
    description:
      "Pernah bikin app/prototype dengan AI? Sampai mana? Pernah deploy? Stuck di mana biasanya?",
  },
  {
    id: "tantangan",
    label: "Tantangan & blocker",
    description:
      "Apa yang selama ini bikin susah maju — teknis, konseptual, waktu, confidence.",
  },
  {
    id: "preferensi",
    label: "Preferensi belajar & constraint",
    description:
      "Gaya belajar (hands-on vs konsep dulu), waktu yang bisa di-commit, hardware/OS, koneksi internet.",
  },
] as const;

export type DimensionId = (typeof DIMENSIONS)[number]["id"];

export const DIMENSION_IDS: DimensionId[] = DIMENSIONS.map((d) => d.id);

export function isDimensionId(s: string): s is DimensionId {
  return (DIMENSION_IDS as string[]).includes(s);
}
