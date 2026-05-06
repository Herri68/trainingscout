"use client";

import { useState } from "react";
import { saveEditedBriefAction } from "@/app/dashboard/actions";

export default function BriefEditor({
  briefId,
  batchId,
  originalContent,
  editedContent,
}: {
  briefId: string;
  batchId: string;
  originalContent: string;
  editedContent: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [draft, setDraft] = useState(editedContent ?? originalContent);
  const [saving, setSaving] = useState(false);

  const display =
    showOriginal || !editedContent ? originalContent : editedContent;

  async function onSave() {
    setSaving(true);
    const fd = new FormData();
    fd.set("brief_id", briefId);
    fd.set("batch_id", batchId);
    fd.set("edited_content", draft);
    await saveEditedBriefAction(fd);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-[60vh] w-full rounded-md border border-neutral-300 p-3 font-mono text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan edit"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setDraft(editedContent ?? originalContent);
            }}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setEditing(true)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Edit
        </button>
        {editedContent && (
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            {showOriginal ? "Lihat versi edit" : "Lihat versi original"}
          </button>
        )}
      </div>
      <article className="whitespace-pre-wrap rounded-md bg-neutral-50 p-4 text-sm leading-relaxed">
        {display}
      </article>
    </div>
  );
}
