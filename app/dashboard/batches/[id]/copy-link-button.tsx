"use client";

import { useState } from "react";

export default function CopyLinkButton({
  link,
  label = "Salin link",
}: {
  link: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100"
      title={link}
    >
      {copied ? "Tersalin" : label}
    </button>
  );
}
