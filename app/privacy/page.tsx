import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen w-full bg-black px-4 py-10 text-white md:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/settings"
          className="text-sm font-semibold text-white/70 hover:text-white"
        >
          ← Back
        </Link>
        <h1 className="mt-6 text-2xl font-extrabold">Privacy Policy</h1>
        <p className="mt-4 text-sm text-white/60">
          Placeholder page. Replace with your privacy policy.
        </p>
      </div>
    </div>
  );
}
