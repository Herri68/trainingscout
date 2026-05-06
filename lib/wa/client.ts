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
  const res = await fetch(`${baseUrl()}/api/sendText`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ session: SESSION, chatId: jid, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WAHA sendText failed: ${res.status} ${body}`);
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
