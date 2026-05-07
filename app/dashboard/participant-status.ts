export type ParticipantWithBatch = {
  status: string | null;
  wa_status: string | null;
  batches: { channel: string | null } | { channel: string | null }[] | null;
};

export function isParticipantCompleted(p: ParticipantWithBatch): boolean {
  const batch = Array.isArray(p.batches) ? p.batches[0] : p.batches;
  const isWa = batch?.channel === "whatsapp";
  return isWa ? p.wa_status === "completed" : p.status === "completed";
}
