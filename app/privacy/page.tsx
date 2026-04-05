import Link from "next/link";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";

export default function PrivacyPage() {
  return (
    <AppSiteChrome
      title="Privacy"
      className="bg-[#0f0520]"
      drawerFooterExtra={
        <Link
          href="/settings"
          className="inline-flex rounded-xl px-2 py-1.5 text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white"
        >
          ← Back to Settings
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
        <div className="rounded-2xl border border-white/10 bg-[rgba(26,10,46,0.62)] p-5 md:p-6">
          <h1 className="text-2xl font-extrabold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-white/60">
            Last updated: March 2026
          </p>

          <div className="mt-6 space-y-5 text-sm leading-6 text-white/80">
            <section>
              <h2 className="text-base font-bold text-white">Information We Collect</h2>
              <p className="mt-1">
                We may collect account identifiers, profile details, gameplay
                activity, submissions, and technical device data needed to operate
                and improve Layers.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">How We Use Information</h2>
              <p className="mt-1">
                We use data to provide the app, personalize your experience,
                maintain leaderboards and badges, support creator features, and
                communicate service-related updates.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Information Sharing</h2>
              <p className="mt-1">
                We do not sell personal information. We may share limited
                information with service providers that help us host, secure, and
                operate the platform.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Data Security</h2>
              <p className="mt-1">
                We apply reasonable technical and organizational safeguards to
                protect data, but no system can be guaranteed 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Your Rights</h2>
              <p className="mt-1">
                Depending on your location, you may have rights to access, correct,
                delete, or export your personal data. Contact us to submit requests.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Cookies</h2>
              <p className="mt-1">
                Layers may use cookies or similar technologies for authentication,
                session continuity, analytics, and performance monitoring.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Children&apos;s Privacy</h2>
              <p className="mt-1">
                Layers is not directed to children under 13, and we do not knowingly
                collect personal information from children under 13.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Changes to Policy</h2>
              <p className="mt-1">
                We may update this policy from time to time. Continued use after
                changes indicates acceptance of the revised Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Contact</h2>
              <p className="mt-1">
                For privacy questions, contact [Layers Inc] at
                [contact@layersgame.com].
              </p>
            </section>
          </div>
        </div>
      </div>
    </AppSiteChrome>
  );
}
