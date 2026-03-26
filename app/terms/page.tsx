import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen w-full bg-[var(--background)] px-4 py-10 text-[var(--text)] md:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/settings"
          className="text-sm font-semibold text-white/70 hover:text-white"
        >
          ← Back
        </Link>
        <h1 className="mt-6 text-2xl font-extrabold">Terms &amp; Conditions</h1>
        <p className="mt-4 text-sm text-white/60">
          Placeholder page. Replace with your legal terms.
        </p>
      </div>
    </div>
  );
}
