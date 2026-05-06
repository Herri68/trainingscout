"use client";

import { useFormStatus } from "react-dom";

function SubmitButton({ hasExisting }: { hasExisting: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
    >
      {pending
        ? "Menggenerate..."
        : hasExisting
          ? "Regenerate brief"
          : "Generate brief"}
    </button>
  );
}

export default function GenerateBriefButton({
  batchId,
  action,
  hasExisting,
}: {
  batchId: string;
  action: (formData: FormData) => Promise<void>;
  hasExisting: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="batch_id" value={batchId} />
      <SubmitButton hasExisting={hasExisting} />
    </form>
  );
}
