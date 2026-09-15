export default function Home() {
  const number = process.env.WAHA_NUMBER?.replace(/\D/g, "");
  const whatsapp =
    number && /^[1-9]\d{7,14}$/.test(number)
      ? `https://wa.me/${number}?text=${encodeURIComponent("Halo Mas Lini, saya mau framework Creative Talk")}`
      : null;
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl font-semibold">Mas Lini</h1>
      <p className="mt-4 text-neutral-600">
        Asisten AI Bang Herri. Ambil framework dan ceritakan kesan kamu setelah
        Creative Talk melalui WhatsApp.
      </p>
      {whatsapp ? (
        <a
          href={whatsapp}
          className="mt-8 inline-block rounded-md bg-green-700 px-5 py-3 text-white"
        >
          Chat Mas Lini di WhatsApp
        </a>
      ) : (
        <p className="mt-8">
          Hubungi nomor WhatsApp Mas Lini yang dibagikan saat Creative Talk.
        </p>
      )}
    </main>
  );
}
