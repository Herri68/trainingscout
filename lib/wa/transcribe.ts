// Groq Whisper transcribe helper untuk voice note WA.
// Endpoint OpenAI-compatible: https://api.groq.com/openai/v1/audio/transcriptions
// Model: whisper-large-v3-turbo (cepat, murah ~$0.0002/menit).

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

/**
 * Download audio dari WAHA media URL lalu transcribe via Groq Whisper.
 * Lempar Error kalau download gagal, Groq error, atau hasil kosong.
 */
export async function transcribeAudio(
  mediaUrl: string,
  mimetype: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  // Download audio dari WAHA. Beberapa setup WAHA serve media butuh API key.
  const downloadHeaders: Record<string, string> = {};
  if (process.env.WAHA_API_KEY) {
    downloadHeaders["X-Api-Key"] = process.env.WAHA_API_KEY;
  }
  const audioRes = await fetch(mediaUrl, {
    headers: downloadHeaders,
    signal: AbortSignal.timeout(15000),
  });
  if (!audioRes.ok) {
    throw new Error(`download audio failed: ${audioRes.status}`);
  }
  const audioBuf = await audioRes.arrayBuffer();
  if (audioBuf.byteLength === 0) {
    throw new Error("audio file empty");
  }

  const ext = mimetype.includes("ogg")
    ? "ogg"
    : mimetype.includes("mpeg") || mimetype.includes("mp3")
      ? "mp3"
      : mimetype.includes("wav")
        ? "wav"
        : mimetype.includes("m4a") || mimetype.includes("mp4")
          ? "m4a"
          : "ogg";

  const form = new FormData();
  form.append("file", new Blob([audioBuf], { type: mimetype || "audio/ogg" }), `audio.${ext}`);
  form.append("model", GROQ_MODEL);
  form.append("language", "id");
  form.append("response_format", "json");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`groq transcribe failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { text?: string };
  const transcript = (json.text ?? "").trim();
  if (!transcript) throw new Error("empty transcript");
  return transcript;
}
