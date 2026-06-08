import Link from "next/link";
import { SublyLogo } from "@/components/SublyLogo";

export const metadata = { title: "Privacy Policy — Subly" };

const sections = [
  { id: "who-we-are", label: "Who we are" },
  { id: "information-we-collect", label: "Information we collect" },
  { id: "how-we-use", label: "How we use it" },
  { id: "who-we-share", label: "Who we share with" },
  { id: "data-retention", label: "Data retention" },
  { id: "your-rights", label: "Your rights" },
  { id: "security", label: "Security" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <SublyLogo size={28} />
            <span className="font-semibold text-slate-900">Subly</span>
          </Link>
          <span className="text-slate-300 mx-2">/</span>
          <span className="text-sm text-slate-500">Privacy Policy</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="lg:grid lg:grid-cols-[1fr_2.4fr_1fr] lg:gap-12">

          {/* Left decorative column */}
          <aside className="hidden lg:block pt-16">
            <div className="sticky top-24 space-y-6">
              <div className="rounded-2xl bg-gradient-to-b from-indigo-600 to-violet-600 p-5 text-white">
                <div className="mb-3">
                  <SublyLogo size={32} />
                </div>
                <p className="text-sm font-medium leading-snug">
                  Your data, your control. We only collect what we need to make Subly work.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Our promises</p>
                {["No ads, ever", "No selling your data", "Only .edu users", "Auto-expiring photos"].map((p) => (
                  <div key={p} className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4l2 2 3-3" stroke="#059669" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="text-sm text-slate-600">{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
            <p className="text-sm text-slate-500 mb-10">Last updated: June 2026</p>

            <div className="space-y-10 text-slate-700 leading-relaxed">
              <section id="who-we-are">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Who we are</h2>
                <p>
                  Subly is a student-only subleasing marketplace that connects verified university
                  students looking for short-term housing. We require a .edu email address for all
                  accounts to keep the community safe and trusted.
                </p>
              </section>

              <section id="information-we-collect">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Information we collect</h2>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Account information:</strong> your name, .edu email address, and university
                    (collected via Clerk authentication).
                  </li>
                  <li>
                    <strong>Profile preferences:</strong> housing preferences, budget range, and vibe
                    profile you enter during onboarding.
                  </li>
                  <li>
                    <strong>Listing content:</strong> photos, descriptions, addresses, and pricing you
                    submit when posting a sublease.
                  </li>
                  <li>
                    <strong>Usage data:</strong> pages visited, features used, and general interaction
                    patterns (no individual tracking pixels).
                  </li>
                  <li>
                    <strong>Cookies:</strong> session cookies for authentication and optional analytics
                    cookies (see our{" "}
                    <Link href="/cookies" className="text-indigo-600 hover:underline">
                      Cookie Policy
                    </Link>
                    ).
                  </li>
                </ul>
              </section>

              <section id="how-we-use">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">3. How we use your information</h2>
                <ul className="list-disc pl-5 space-y-2">
                  <li>To verify your .edu status and create your account.</li>
                  <li>
                    To power our AI matching engine, which compares your vibe profile against available
                    listings using vector embeddings. Your profile text is sent to OpenAI solely for
                    embedding generation and is not used to train their models under our API agreement.
                  </li>
                  <li>To display your listings to other verified students.</li>
                  <li>To detect and prevent fraudulent listings using automated scoring.</li>
                  <li>To send transactional emails (match alerts, account notices) via your .edu address.</li>
                </ul>
              </section>

              <section id="who-we-share">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Who we share data with</h2>
                <p className="mb-3">We do not sell your personal information. We share data only with:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Clerk</strong> — authentication provider. Handles password hashing, session
                    management, and .edu verification.
                  </li>
                  <li>
                    <strong>OpenAI</strong> — receives your vibe profile text to generate a search
                    embedding vector. No personally identifying information is included in the prompt.
                  </li>
                  <li>
                    <strong>Pinecone</strong> — stores your embedding vector alongside a pseudonymous
                    user ID for similarity search. No name or email is stored in Pinecone.
                  </li>
                  <li>
                    <strong>AWS S3</strong> — stores listing photos you upload. Photos are accessible
                    to all logged-in Subly users.
                  </li>
                  <li>
                    <strong>Stripe</strong> — processes match confirmation payments. When you pay,
                    Stripe receives your card details directly; Subly never sees or stores your full
                    card number. Stripe may collect billing address and device data per their own{" "}
                    <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                      Privacy Policy
                    </a>
                    . We store only the Stripe session ID and payment status in our database.
                  </li>
                </ul>
              </section>

              <section id="data-retention">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Data retention</h2>
                <p>
                  We retain your account and listing data for as long as your account is active. If you
                  delete your account, we remove your personal information within 30 days, except where
                  retention is required by law.
                </p>
              </section>

              <section id="your-rights">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Your rights</h2>
                <p>
                  You may request access to, correction of, or deletion of your personal data at any
                  time by emailing us. If you are in the EU or UK, you also have the right to data
                  portability and to lodge a complaint with your local supervisory authority.
                </p>
              </section>

              <section id="security">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Security</h2>
                <p>
                  All data is transmitted over HTTPS. Passwords are never stored by Subly;
                  authentication is delegated entirely to Clerk. Listing photos are stored in a private
                  S3 bucket and served via pre-signed URLs that expire after a short window.
                </p>
              </section>

              <section id="changes">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Changes to this policy</h2>
                <p>
                  We may update this policy as the product evolves. We will notify you of material
                  changes via your registered email address at least 14 days before they take effect.
                </p>
              </section>

              <section id="contact">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Contact</h2>
                <p>
                  Questions? Email us at{" "}
                  <a href="mailto:privacy@subly.app" className="text-indigo-600 hover:underline">
                    privacy@subly.app
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
        </div>
      </footer>
    </div>
  );
}
