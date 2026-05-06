import { runTurn } from "@/lib/agent/run";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const { token, userMessage } = (await request.json()) as {
    token: string;
    userMessage?: string;
  };
  if (!token) return new Response("token wajib", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await runTurn({
          token,
          userMessage,
          onTextDelta: (text) => controller.enqueue(encoder.encode(text)),
          onSessionEnded: () => {
            controller.enqueue(encoder.encode("\n\n[SESSION_ENDED]"));
          },
        });
        if (!result.ok) {
          controller.enqueue(encoder.encode(`\n\n(error: ${result.error ?? "unknown"})`));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n(error: ${(e as Error).message})`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
