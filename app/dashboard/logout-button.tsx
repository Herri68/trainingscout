"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100"
    >
      Keluar
    </button>
  );
}
