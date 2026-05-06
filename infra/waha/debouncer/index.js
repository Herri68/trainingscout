// Sidecar debouncer untuk WAHA → Vercel webhook.
// Per-JID setTimeout(DEBOUNCE_MS) reset on new message; on flush, forward batch
// ke FORWARD_URL dengan HMAC sha256 hex signature di header `x-waha-signature`.

import http from "node:http";
import crypto from "node:crypto";

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const DEBOUNCE_MS = parseInt(process.env.DEBOUNCE_MS ?? "4000", 10);
const FORWARD_URL = process.env.FORWARD_URL;
const SECRET = process.env.FORWARD_HMAC_SECRET;

if (!FORWARD_URL || !SECRET) {
  console.error("FORWARD_URL and FORWARD_HMAC_SECRET are required");
  process.exit(1);
}

/** @type {Map<string, { timer: NodeJS.Timeout, messages: any[] }>} */
const buffers = new Map();

function normalizeMessage(payload) {
  // WAHA payload: { from, fromMe, type, body, timestamp, hasMedia, ... }
  // Phase 2 hanya kirim type=text. Phase 4 extend untuk audio/image.
  const type = payload.type === "chat" || payload.type === "text" ? "text" : payload.type;
  return {
    type,
    text: typeof payload.body === "string" ? payload.body : "",
    timestamp: payload.timestamp ?? Date.now(),
  };
}

async function flush(jid) {
  const buf = buffers.get(jid);
  if (!buf) return;
  buffers.delete(jid);
  const body = JSON.stringify({ jid, messages: buf.messages });
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(FORWARD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-waha-signature": sig,
        },
        body,
      });
      if (res.ok) return;
      console.warn(`[debouncer] forward ${res.status} attempt=${attempt} jid=${jid}`);
    } catch (err) {
      console.warn(`[debouncer] forward error attempt=${attempt} jid=${jid}:`, err?.message);
    }
    await new Promise((r) => setTimeout(r, [5000, 30000, 120000][attempt]));
  }
  console.error(`[debouncer] dead-letter jid=${jid} body=${body}`);
}

function enqueue(jid, msg) {
  let buf = buffers.get(jid);
  if (!buf) {
    buf = { timer: null, messages: [] };
    buffers.set(jid, buf);
  }
  buf.messages.push(msg);
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => flush(jid), DEBOUNCE_MS);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, buffered: buffers.size }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/inbound") {
    res.writeHead(404);
    res.end();
    return;
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    try {
      const evt = JSON.parse(raw);
      const payload = evt?.payload ?? evt;
      const jid = payload?.from;
      const fromMe = payload?.fromMe === true;
      if (!jid || fromMe) {
        res.writeHead(200);
        res.end();
        return;
      }
      enqueue(jid, normalizeMessage(payload));
      res.writeHead(202);
      res.end();
    } catch (err) {
      console.warn("[debouncer] bad payload:", err?.message);
      res.writeHead(400);
      res.end();
    }
  });
});

server.listen(PORT, () => {
  console.log(`[debouncer] listening :${PORT} debounce=${DEBOUNCE_MS}ms forward=${FORWARD_URL}`);
});
