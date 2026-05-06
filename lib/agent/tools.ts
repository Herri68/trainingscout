import type Anthropic from "@anthropic-ai/sdk";
import { DIMENSION_IDS } from "./dimensions";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "mark_dimension_covered",
    description:
      "Panggil ketika satu dimensi rubrik sudah cukup tertutup oleh jawaban peserta. " +
      "Berikan ringkasan substantif (1-3 kalimat) berisi inti jawaban peserta untuk dimensi tersebut. " +
      "Satu dimensi cukup di-mark sekali.",
    input_schema: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: [...DIMENSION_IDS],
          description: "ID dimensi yang sudah tertutup.",
        },
        summary: {
          type: "string",
          description: "Ringkasan jawaban peserta untuk dimensi ini.",
        },
      },
      required: ["dimension", "summary"],
    },
  },
  {
    name: "end_session",
    description:
      "Panggil ketika kamu menilai semua dimensi sudah tertutup dan sesi siap ditutup. " +
      "Backend akan menolak kalau ada dimensi yang belum di-mark dengan mark_dimension_covered. " +
      "Kalau ditolak, lanjutkan wawancara untuk dimensi yang masih kurang.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

export const TOOL_NAMES = {
  MARK: "mark_dimension_covered" as const,
  END: "end_session" as const,
};
