// WAHA REST client wrapper. Auth via X-Api-Key header.
// Docs: https://waha.devlike.pro/swagger/

const SESSION = process.env.WAHA_SESSION_NAME ?? "default";

function baseUrl(): string {
  const u = process.env.WAHA_BASE_URL;
  if (!u) throw new Error("WAHA_BASE_URL not set");
  return u.replace(/\/$/, "");
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.WAHA_API_KEY) h["X-Api-Key"] = process.env.WAHA_API_KEY;
  return h;
}

export async function sendText(jid: string, text: string): Promise<void> {
  // Kirim ke JID apa adanya. NOWEB engine native handle @lid; mengubah suffix
  // ke @c.us malah menghasilkan JID invalid (nomor lid bukan nomor HP).
  const chatId = jid;
  const url = `${baseUrl()}/api/sendText`;
  const body = JSON.stringify({ session: SESSION, chatId, text });
  console.log(`[waha] sendText -> ${chatId} (session=${SESSION}, len=${text.length})`);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: headers(),
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error(`[waha] sendText fetch error to ${chatId}:`, err);
    throw err;
  }
  if (!res.ok) {
    const respBody = await res.text().catch(() => "");
    console.error(`[waha] sendText ${res.status} for ${chatId}: ${respBody}`);
    throw new Error(`WAHA sendText failed: ${res.status} ${respBody}`);
  }
}

export async function startTyping(jid: string): Promise<void> {
  await fetch(`${baseUrl()}/api/startTyping`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ session: SESSION, chatId: jid }),
  }).catch(() => {});
}

export async function stopTyping(jid: string): Promise<void> {
  await fetch(`${baseUrl()}/api/stopTyping`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ session: SESSION, chatId: jid }),
  }).catch(() => {});
}

/**
 * Kirim balasan agent ke WA dengan auto-split per paragraf + typing indicator.
 * Split by \n\n, max 4 chunk. Untuk tiap chunk: startTyping → sleep proporsional → sendText → sleep 400ms.
 */
export async function sendChunked(jid: string, fullText: string): Promise<void> {
  const trimmed = fullText.trim();
  if (!trimmed) return;
  const parts = trimmed
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 4);
  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i];
    await startTyping(jid);
    const typingMs = Math.min(50 * chunk.length, 1500);
    await new Promise((r) => setTimeout(r, typingMs));
    try {
      await sendText(jid, chunk);
    } catch (err) {
      console.error(`[waha] sendChunked failed at ${i} for ${jid}:`, err);
      await stopTyping(jid).catch(() => {});
      return;
    }
    if (i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  await stopTyping(jid).catch(() => {});
}

export async function getSessionStatus(): Promise<{ status: string } | null> {
  try {
    const res = await fetch(`${baseUrl()}/api/sessions/${SESSION}`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    return (await res.json()) as { status: string };
  } catch {
    return null;
  }
}
