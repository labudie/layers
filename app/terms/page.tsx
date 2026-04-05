import Link from "next/link";
import { AppSiteChrome } from "@/app/components/AppSiteChrome";

export default function TermsPage() {
  return (
    <AppSiteChrome
      title="Terms"
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
          <h1 className="text-2xl font-extrabold tracking-tight">
            Terms &amp; Conditions
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Last updated: March 2026
          </p>

          <div className="mt-6 space-y-5 text-sm leading-6 text-white/80">
            <section>
              <h2 className="text-base font-bold text-white">Acceptance of Terms</h2>
              <p className="mt-1">
                By accessing or using Layers, you agree to be bound by these Terms
                &amp; Conditions and all applicable laws. If you do not agree, do
                not use the service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Use of Service</h2>
              <p className="mt-1">
                Layers provides interactive daily design guessing challenges for
                personal, non-commercial use unless otherwise authorized by
                [Layers Inc].
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">User Accounts</h2>
              <p className="mt-1">
                You are responsible for maintaining the confidentiality of your
                account and for all activity that occurs under your account.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">User Content</h2>
              <p className="mt-1">
                Content you submit (including creator submissions) must be lawful
                and must not infringe rights of others. You retain ownership of
                your content, while granting [Layers Inc] the rights needed to host,
                display, and operate the service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Prohibited Activities</h2>
              <p className="mt-1">
                You agree not to misuse the service, interfere with platform
                security, exploit bugs, upload malicious content, or attempt
                unauthorized access to any systems.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Intellectual Property</h2>
              <p className="mt-1">
                The Layers app, branding, and related materials are owned by
                [Layers Inc] or its licensors and are protected by intellectual
                property laws.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Disclaimers</h2>
              <p className="mt-1">
                The service is provided on an “as is” and “as available” basis
                without warranties of any kind, express or implied.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Limitation of Liability</h2>
              <p className="mt-1">
                To the maximum extent permitted by law, [Layers Inc] is not liable
                for indirect, incidental, special, consequential, or punitive
                damages arising from your use of Layers.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Changes to Terms</h2>
              <p className="mt-1">
                We may update these terms from time to time. Continued use of the
                service after updates means you accept the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white">Contact Information</h2>
              <p className="mt-1">
                For questions about these Terms, contact [Layers Inc] at
                [contact@layersgame.com].
              </p>
            </section>
          </div>
        </div>
      </div>
    </AppSiteChrome>
  );
}
