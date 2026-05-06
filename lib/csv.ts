// CSV parser sederhana untuk import peserta.
// Format: header row WAJIB. Kolom yang dikenali: name (atau nama), email, phone (atau no_hp / hp).

export type ParsedRow = {
  rowNumber: number; // 1-based, tidak termasuk header
  name: string;
  email: string | null;
  phone: string | null;
};

export type CSVError = { rowNumber: number; message: string };

export type CSVParseResult = {
  rows: ParsedRow[];
  errors: CSVError[];
};

const NAME_KEYS = ["name", "nama"];
const EMAIL_KEYS = ["email"];
const PHONE_KEYS = ["phone", "no_hp", "hp", "telepon", "telp"];

function splitCsvLine(line: string): string[] {
  // Mendukung quoted fields dan koma di dalam quote.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCSV(text: string): CSVParseResult {
  const errors: CSVError[] = [];
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    errors.push({ rowNumber: 0, message: "File kosong." });
    return { rows: [], errors };
  }

  const headerCells = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const findCol = (keys: string[]) =>
    headerCells.findIndex((h) => keys.includes(h));

  const nameIdx = findCol(NAME_KEYS);
  const emailIdx = findCol(EMAIL_KEYS);
  const phoneIdx = findCol(PHONE_KEYS);

  if (nameIdx === -1) {
    errors.push({
      rowNumber: 0,
      message: `Header wajib mengandung kolom "name" atau "nama". Header ditemukan: [${headerCells.join(", ")}].`,
    });
    return { rows: [], errors };
  }

  const rows: ParsedRow[] = [];
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const rowNumber = i;
    const name = (cells[nameIdx] ?? "").trim();
    const email = emailIdx >= 0 ? (cells[emailIdx] ?? "").trim() || null : null;
    const phone = phoneIdx >= 0 ? (cells[phoneIdx] ?? "").trim() || null : null;

    if (!name) {
      errors.push({ rowNumber, message: "Kolom name kosong." });
      continue;
    }
    if (email) {
      const norm = email.toLowerCase();
      const prev = seenEmail.get(norm);
      if (prev) {
        errors.push({
          rowNumber,
          message: `Email duplikat (sama dengan baris ${prev}): ${email}.`,
        });
        continue;
      }
      seenEmail.set(norm, rowNumber);
    }
    if (phone) {
      const norm = phone.replace(/\s+/g, "");
      const prev = seenPhone.get(norm);
      if (prev) {
        errors.push({
          rowNumber,
          message: `No HP duplikat (sama dengan baris ${prev}): ${phone}.`,
        });
        continue;
      }
      seenPhone.set(norm, rowNumber);
    }

    rows.push({ rowNumber, name, email, phone });
  }

  return { rows, errors };
}
