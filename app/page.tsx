import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl font-semibold">TrainingScout</h1>
      <p className="mt-4 text-neutral-600">
        Agent pra-kelas yang memetakan kesiapan peserta sebelum pelatihan AI coding.
      </p>
      <div className="mt-8">
        <Link
          href="/login"
          className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-800"
        >
          Masuk sebagai trainer
        </Link>
      </div>
    </main>
  );
}
