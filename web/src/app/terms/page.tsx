import Link from "next/link";
import { SublyLogo } from "@/components/SublyLogo";
import { LegalNav } from "@/components/LegalNav";

export const metadata = { title: "Terms of Service — Subly" };

const sections = [
  { id: "acceptance", label: "Acceptance" },
  { id: "eligibility", label: "Eligibility" },
  { id: "what-subly-is", label: "What Subly is" },
  { id: "listings", label: "Listings" },
  { id: "viewings", label: "Viewings and in-person meetings" },
  { id: "payments", label: "Payments & fees" },
  { id: "prohibited", label: "Prohibited conduct" },
  { id: "ai-features", label: "AI-powered features" },
  { id: "ip", label: "Intellectual property" },
  { id: "disclaimers", label: "Disclaimers" },
  { id: "liability", label: "Liability" },
  { id: "termination", label: "Termination" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30">
      <LegalNav pageLabel="Terms of Service" />

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="lg:grid lg:grid-cols-[1fr_2.4fr_1fr] lg:gap-12">

          {/* Left decorative column */}
          <aside className="hidden lg:block pt-16">
            <div className="sticky top-24 space-y-6">
              <div className="rounded-2xl bg-gradient-to-b from-violet-600 to-indigo-600 p-5 text-white">
                <div className="mb-3">
                  <SublyLogo size={32} />
                </div>
                <p className="text-sm font-medium leading-snug">
                  Subly is a marketplace, not a landlord. All lease agreements are between you and
                  the other student.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Key rules</p>
                {["Must have a .edu email", "Must be 18+", "Listings must be accurate", "No impersonation"].map((r) => (
                  <div key={r} className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4l2 2 3-3" stroke="#7c3aed" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="text-sm text-slate-600">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
            <p className="text-sm text-slate-500 mb-10">Last updated: June 2026 (revision 2)</p>

            <div className="space-y-10 text-slate-700 leading-relaxed">
              <section id="acceptance">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Acceptance</h2>
                <p>
                  By creating a Subly account or using our platform in any way, you agree to these
                  Terms of Service. If you do not agree, please do not use Subly.
                </p>
              </section>

              <section id="eligibility">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Eligibility</h2>
                <p>
                  You must be a current student or faculty member at an accredited university with a
                  valid .edu email address to use Subly. By verifying your email, you confirm that
                  you are authorized to use that address and that you are at least 18 years old.
                </p>
              </section>

              <section id="what-subly-is">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">3. What Subly is</h2>
                <p>
                  Subly is a marketplace platform that connects students seeking subleases with
                  students offering them. We are not a party to any lease or sublease agreement. All
                  agreements are solely between the listing poster and the interested renter. Subly
                  does not own, manage, or inspect any listed property.
                </p>
              </section>

              <section id="listings">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Listings</h2>
                <ul className="list-disc pl-5 space-y-2">
                  <li>You may only post subleases for properties you are authorized to sublease.</li>
                  <li>All listing information must be accurate, current, and not misleading.</li>
                  <li>Photos must represent the actual property being listed.</li>
                  <li>
                    Subly uses automated fraud detection on all listings. Listings flagged as
                    potentially fraudulent may be removed without notice.
                  </li>
                  <li>
                    We reserve the right to remove any listing at our discretion, including but not
                    limited to policy violations, user reports, or fraud signals.
                  </li>
                  <li>
                    We track an aggregate view count for each listing, visible only to the lister on
                    their My Listings page. This is a rough engagement signal, not a guarantee of
                    reach or listing quality.
                  </li>
                </ul>
              </section>

              <section id="viewings">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Viewings and in-person meetings</h2>
                <p>
                  Subly lets renters and listers propose specific viewing times inside the chat
                  thread. A proposal is a record between the two of you; Subly does not enforce
                  attendance, verify that a viewing took place, or insure either party against loss
                  or injury. You are solely responsible for deciding whether, where, and how to meet.
                  We recommend meeting in public, bringing a friend, and never paying any deposit
                  before signing a written lease or sublease agreement.
                </p>
              </section>

              <section id="payments">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Payments and fees</h2>
                <p className="mb-3">
                  Subly charges a one-time match confirmation fee when a lister chooses to confirm a sublease match. This fee is based on the listing&apos;s advertised monthly rent at the time the conversation was created:
                </p>
                <ul className="list-disc pl-5 space-y-2 mb-3">
                  <li>Listings under $1,000/mo — <strong>$29</strong></li>
                  <li>Listings $1,000–$1,999/mo — <strong>$49</strong></li>
                  <li>Listings $2,000/mo and above — <strong>$79</strong></li>
                </ul>
                <p className="mb-3">
                  The fee is charged only to the lister and is non-refundable once payment is processed, except where required by applicable law. The fee is locked to the initial listing price at the time the conversation began and is not affected by any subsequent price changes.
                </p>
                <p className="mb-3">
                  Payments are processed securely by Stripe. Subly does not store your full card details. By proceeding with payment, you agree to Stripe&apos;s{" "}
                  <a href="https://stripe.com/legal/ssa" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Terms of Service</a>.
                </p>
                <p>
                  <strong>Honest disclosure:</strong> The match confirmation fee compensates Subly for operating the platform, maintaining the AI matching engine, and verifying university affiliation. It does not guarantee that the sublease will proceed, that the property is as described, or that either party will fulfill their commitments.
                </p>
              </section>

              <section id="prohibited">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Prohibited conduct</h2>
                <p className="mb-3">You agree not to:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Post listings for properties you do not have the right to sublease.</li>
                  <li>Impersonate another person or misrepresent your university affiliation.</li>
                  <li>Use Subly to facilitate any illegal activity.</li>
                  <li>Attempt to scrape, reverse-engineer, or abuse the platform or its APIs.</li>
                  <li>Harass, threaten, or discriminate against other users.</li>
                  <li>Post false, misleading, or fraudulent listing information.</li>
                  <li>
                    Misuse the viewing scheduler to harass another user, repeatedly no-show on
                    proposed viewings, or coordinate off-platform deals to bypass the match
                    confirmation fee.
                  </li>
                  <li>
                    Artificially inflate listing view counts, including through scripted or bot page
                    loads.
                  </li>
                </ul>
              </section>

              <section id="ai-features">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">8. AI-powered features</h2>
                <p>
                  Subly uses AI to generate match scores between renters and listings. These scores
                  are suggestions only and should not be treated as guarantees of compatibility,
                  property quality, or safety. Always conduct your own due diligence before entering
                  into any lease agreement.
                </p>
              </section>

              <section id="ip">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Intellectual property</h2>
                <p>
                  By posting content (photos, descriptions) on Subly, you grant us a non-exclusive,
                  royalty-free license to display that content on the platform. You retain ownership
                  of your content. You represent that you own or have the rights to any content you
                  post.
                </p>
              </section>

              <section id="disclaimers">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Disclaimers</h2>
                <p>
                  Subly is provided "as is" without warranties of any kind. We do not verify the
                  accuracy of listings beyond automated fraud detection. We are not responsible for
                  the condition of any property, the behavior of any user, or the outcome of any
                  sublease arrangement made through our platform.
                </p>
              </section>

              <section id="liability">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">11. Limitation of liability</h2>
                <p>
                  To the maximum extent permitted by law, Subly's total liability to you for any
                  claim arising from your use of the platform is limited to the amount you paid us
                  in the twelve months preceding the claim (or $100 if you have paid nothing).
                </p>
              </section>

              <section id="termination">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">12. Termination</h2>
                <p>
                  We may suspend or terminate your account at any time for violation of these Terms.
                  You may delete your account at any time from your account settings.
                </p>
              </section>

              <section id="changes">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">13. Changes to these Terms</h2>
                <p>
                  We may update these Terms as the product evolves. Continued use of Subly after
                  changes take effect constitutes acceptance of the updated Terms.
                </p>
              </section>

              <section id="contact">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">14. Contact</h2>
                <p>
                  Questions? Email us at{" "}
                  <a href="mailto:legal@subly.app" className="text-indigo-600 hover:underline">
                    legal@subly.app
                  </a>
                  .
                </p>
              </section>
            </div>
          </main>

          {/* Right sticky ToC */}
          <aside className="hidden lg:block pt-16">
            <div className="sticky top-24">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">On this page</p>
              <nav className="space-y-1">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block text-sm text-slate-500 hover:text-indigo-600 hover:pl-1 transition-all py-0.5"
                  >
                    {s.label}
                  </a>
                ))}
              </nav>
              <div className="mt-8 pt-6 border-t border-slate-100 space-y-2">
                <Link href="/privacy" className="block text-sm text-slate-400 hover:text-slate-600">Privacy Policy</Link>
                <Link href="/cookies" className="block text-sm text-slate-400 hover:text-slate-600">Cookie Policy</Link>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <footer className="border-t border-slate-100 bg-white/60 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-6 flex gap-6 text-sm text-slate-500">
          <Link href="/privacy" className="hover:text-slate-700">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-700">Terms of Service</Link>
          <Link href="/cookies" className="hover:text-slate-700">Cookie Policy</Link>
        </div>
      </footer>
    </div>
  );
}
