import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "./logout-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="font-semibold">TrainingScout</Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-neutral-600">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
