"use client";

import { useActionState } from "react";
import { uploadParticipantsCSVAction, type CSVUploadResult } from "../../actions";

export default function CSVUpload({ batchId }: { batchId: string }) {
  const [state, formAction, pending] = useActionState<CSVUploadResult | null, FormData>(
    uploadParticipantsCSVAction,
    null,
  );

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="batch_id" value={batchId} />
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="text-sm"
        />
        <button
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Memproses..." : "Upload CSV"}
        </button>
        <span className="text-xs text-neutral-500">
          Header wajib: <code>name</code> (atau <code>nama</code>). Opsional:{" "}
          <code>email</code>, <code>phone</code>.
        </span>
      </form>

      {state && (
        <div className="mt-3 space-y-2 text-sm">
          {state.generalError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
              {state.generalError}
            </div>
          )}
          {state.inserted > 0 && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-green-900">
              {state.inserted} peserta berhasil ditambahkan.
            </div>
          )}
          {state.rowErrors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <div className="mb-1 font-medium">
                {state.rowErrors.length} baris dilewati:
              </div>
              <ul className="list-inside list-disc space-y-0.5 text-xs">
                {state.rowErrors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    {e.rowNumber > 0 ? `Baris ${e.rowNumber}: ` : ""}
                    {e.message}
                  </li>
                ))}
                {state.rowErrors.length > 20 && (
                  <li>... dan {state.rowErrors.length - 20} lagi</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
