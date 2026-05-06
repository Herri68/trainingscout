"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { generateToken } from "@/lib/token";
import { parseCSV } from "@/lib/csv";
import { generateBrief } from "@/lib/agent/brief";

export async function createBatchAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const course_name = String(formData.get("course_name") ?? "").trim() || null;
  const channelRaw = String(formData.get("channel") ?? "web").trim();
  const channel =
    channelRaw === "whatsapp" && process.env.WHATSAPP_ENABLED === "true"
      ? "whatsapp"
      : "web";
  if (!name) return;

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("batches")
    .insert({ name, course_name, channel, created_by_user_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  redirect(`/dashboard/batches/${data.id}`);
}

export async function updateBatchDeadlineAction(formData: FormData) {
  const batch_id = String(formData.get("batch_id") ?? "");
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  if (!batch_id) return;

  const supabase = await supabaseServer();
  const deadline = deadlineRaw ? new Date(deadlineRaw).toISOString() : null;
  const { error } = await supabase.from("batches").update({ deadline }).eq("id", batch_id);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/batches/${batch_id}`);
}

export type CSVUploadResult = {
  ok: boolean;
  inserted: number;
  rowErrors: { rowNumber: number; message: string }[];
  generalError?: string;
};

export async function uploadParticipantsCSVAction(
  _prev: CSVUploadResult | null,
  formData: FormData,
): Promise<CSVUploadResult> {
  const batch_id = String(formData.get("batch_id") ?? "");
  const file = formData.get("file");
  if (!batch_id || !(file instanceof File)) {
    return { ok: false, inserted: 0, rowErrors: [], generalError: "File CSV wajib." };
  }

  const text = await file.text();
  const { rows, errors } = parseCSV(text);
  if (errors.some((e) => e.rowNumber === 0)) {
    return { ok: false, inserted: 0, rowErrors: errors };
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, inserted: 0, rowErrors: [], generalError: "Unauthenticated." };

  const { data: batchInfo } = await supabase
    .from("batches")
    .select("channel")
    .eq("id", batch_id)
    .single();
  const isWaBatch = batchInfo?.channel === "whatsapp";

  // Dedup juga terhadap peserta existing di batch (email & phone)
  const { data: existing } = await supabase
    .from("participants")
    .select("email, phone")
    .eq("batch_id", batch_id);
  const existingEmail = new Set(
    (existing ?? []).map((p) => (p.email ?? "").toLowerCase()).filter(Boolean),
  );
  const existingPhone = new Set(
    (existing ?? []).map((p) => (p.phone ?? "").replace(/\s+/g, "")).filter(Boolean),
  );

  const allErrors = [...errors];
  const toInsert: {
    batch_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    token: string;
    wa_status: "pending" | null;
  }[] = [];
  for (const r of rows) {
    if (isWaBatch && !r.phone) {
      allErrors.push({
        rowNumber: r.rowNumber,
        message: "Batch WhatsApp wajib punya nomor HP.",
      });
      continue;
    }
    if (r.email && existingEmail.has(r.email.toLowerCase())) {
      allErrors.push({ rowNumber: r.rowNumber, message: `Email sudah ada di batch ini: ${r.email}` });
      continue;
    }
    if (r.phone && existingPhone.has(r.phone.replace(/\s+/g, ""))) {
      allErrors.push({ rowNumber: r.rowNumber, message: `No HP sudah ada di batch ini: ${r.phone}` });
      continue;
    }
    toInsert.push({
      batch_id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      token: generateToken(),
      wa_status: isWaBatch ? "pending" : null,
    });
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error, count } = await supabase
      .from("participants")
      .insert(toInsert, { count: "exact" });
    if (error) {
      return {
        ok: false,
        inserted: 0,
        rowErrors: allErrors,
        generalError: error.message,
      };
    }
    inserted = count ?? toInsert.length;
  }

  revalidatePath(`/dashboard/batches/${batch_id}`);
  return { ok: true, inserted, rowErrors: allErrors };
}

export async function generateBriefAction(formData: FormData) {
  const batch_id = String(formData.get("batch_id") ?? "");
  if (!batch_id) return;

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pastikan batch milik user (RLS juga handle, tapi cek eksplisit)
  const { data: batch } = await supabase
    .from("batches")
    .select("id")
    .eq("id", batch_id)
    .single();
  if (!batch) throw new Error("Batch tidak ditemukan.");

  await generateBrief(batch_id, "manual");
  revalidatePath(`/dashboard/batches/${batch_id}/brief`);
  revalidatePath(`/dashboard/batches/${batch_id}`);
  redirect(`/dashboard/batches/${batch_id}/brief`);
}

export async function saveEditedBriefAction(formData: FormData) {
  const brief_id = String(formData.get("brief_id") ?? "");
  const batch_id = String(formData.get("batch_id") ?? "");
  const edited = String(formData.get("edited_content") ?? "");
  if (!brief_id || !batch_id) return;

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("briefs")
    .update({ edited_content: edited })
    .eq("id", brief_id);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/batches/${batch_id}/brief`);
}

export async function createParticipantAction(formData: FormData) {
  const batch_id = String(formData.get("batch_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (!batch_id || !name) return;

  const supabase = await supabaseServer();
  const { data: batchInfo } = await supabase
    .from("batches")
    .select("channel")
    .eq("id", batch_id)
    .single();
  const isWaBatch = batchInfo?.channel === "whatsapp";
  if (isWaBatch && !phone) {
    throw new Error("Batch WhatsApp wajib mengisi nomor HP.");
  }

  const { error } = await supabase.from("participants").insert({
    batch_id,
    name,
    email,
    phone,
    token: generateToken(),
    wa_status: isWaBatch ? "pending" : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/batches/${batch_id}`);
}
