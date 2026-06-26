import Link from "next/link";
import { SublyLogo } from "@/components/SublyLogo";
import { LegalNav } from "@/components/LegalNav";

export const metadata = { title: "Help & FAQ — Subly" };

const sections = [
  { id: "matching", label: "How matching works" },
  { id: "trust-scoring", label: "How trust scoring works" },
  { id: "match-fee", label: "What is the match fee?" },
  { id: "reporting", label: "How to report a scam" },
  { id: "viewings", label: "Scheduling a viewing" },
  { id: "deleting", label: "Deleting your account" },
  { id: "contact", label: "Contact us" },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30">
      <LegalNav pageLabel="Help & FAQ" />

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
                  Questions about how Subly works? You&apos;re in the right place.
                </p>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Help & FAQ</h1>
            <p className="text-sm text-slate-500 mb-10">Answers to common questions about Subly.</p>

            <div className="space-y-10 text-slate-700 leading-relaxed">
              <section id="matching">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">How matching works</h2>
                <p>
                  When you set up your preferences during onboarding, Subly's AI generates a semantic
                  profile of what you're looking for — university, budget, bedroom count, and a
                  free-text "vibe" description. We compare that profile against every active listing
                  using vector similarity search, then rank the results so your dashboard shows the
                  subleases that best match what you described, not just the ones that match on price
                  alone.
                </p>
              </section>

              <section id="trust-scoring">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">How trust scoring works</h2>
                <p>
                  Every new listing is automatically scored for scam risk before it goes live. We
                  combine an AI tone analysis of the title and description, keyword detection for
                  common scam patterns (wire transfers, "currently abroad," urgency tactics), and a
                  price-anomaly check against comparable listings near the same university. Listings
                  start in draft and only become visible once they pass this review. Editing a
                  listing's title, description, address, or rent sends it back through the same
                  review before it's visible again.
                </p>
              </section>

              <section id="match-fee">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">What is the match fee?</h2>
                <p className="mb-3">
                  Subly charges a one-time fee to the lister when they confirm a sublease match,
                  based on the listing's advertised rent:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Listings under $1,000/mo — <strong>$29</strong></li>
                  <li>Listings $1,000–$1,999/mo — <strong>$49</strong></li>
                  <li>Listings $2,000/mo and above — <strong>$79</strong></li>
                </ul>
                <p className="mt-3">
                  See our <Link href="/terms#payments" className="text-indigo-600 hover:underline">Terms of Service</Link> for full payment terms.
                </p>
              </section>

              <section id="reporting">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">How to report a scam</h2>
                <p>
                  If a listing or user looks suspicious, use the "Report" button on the listing page
                  or user profile page. Reports go straight to our trust & safety team for manual
                  review. Never send money or personal information to someone before viewing a
                  property in person and signing a written lease.
                </p>
              </section>

              <section id="viewings">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">Scheduling a viewing</h2>
                <p>
                  Once you've matched with a lister or renter, you can propose a specific viewing
                  time directly inside the message thread. The other person can accept or decline —
                  no separate scheduling tool needed.
                </p>
              </section>

              <section id="deleting">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">Deleting your account</h2>
                <p>
                  You can delete your account at any time from your{" "}
                  <Link href="/settings" className="text-indigo-600 hover:underline">account settings</Link>.
                  This removes your active listings and personal data per our{" "}
                  <Link href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link>.
                </p>
              </section>

              <section id="contact">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">Contact us</h2>
                <p>
                  Still have questions? Email us at{" "}
                  <a href="mailto:hello@subly.app" className="text-indigo-600 hover:underline">
                    hello@subly.app
                  </a>
                  {" "}and we'll get back to you.
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
                <Link href="/terms" className="block text-sm text-slate-400 hover:text-slate-600">Terms of Service</Link>
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
          <Link href="/help" className="hover:text-slate-700">Help</Link>
        </div>
      </footer>
    </div>
  );
}
