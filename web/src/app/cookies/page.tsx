import Link from "next/link";
import { SublyLogo } from "@/components/SublyLogo";

export const metadata = { title: "Cookie Policy — Subly" };

const sections = [
  { id: "what-are-cookies", label: "What are cookies?" },
  { id: "cookies-we-use", label: "Cookies we use" },
  { id: "analytics-events", label: "Analytics events" },
  { id: "your-choices", label: "Your choices" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <SublyLogo size={28} />
            <span className="font-semibold text-slate-900">Subly</span>
          </Link>
          <span className="text-slate-300 mx-2">/</span>
          <span className="text-sm text-slate-500">Cookie Policy</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="lg:grid lg:grid-cols-[1fr_2.4fr_1fr] lg:gap-12">

          {/* Left decorative column */}
          <aside className="hidden lg:block pt-16">
            <div className="sticky top-24 space-y-6">
              <div className="rounded-2xl bg-gradient-to-b from-emerald-600 to-teal-600 p-5 text-white">
                <div className="mb-3">
                  <SublyLogo size={32} />
                </div>
                <p className="text-sm font-medium leading-snug">
                  We use cookies for authentication, plus one optional analytics cookie. No ad networks.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cookie count</p>
                <div className="text-center py-2">
                  <span className="text-4xl font-bold text-emerald-600">3</span>
                  <p className="text-sm text-slate-500 mt-1">cookies total</p>
                </div>
                <p className="text-xs text-slate-400 text-center">Two are essential. One is optional analytics you can decline.</p>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Cookie Policy</h1>
            <p className="text-sm text-slate-500 mb-10">Last updated: June 2026</p>

            <div className="space-y-10 text-slate-700 leading-relaxed">
              <section id="what-are-cookies">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">What are cookies?</h2>
                <p>
                  Cookies are small text files that websites place on your device when you visit them.
                  They help the site remember information about you across page loads and visits, like
                  whether you are logged in.
                </p>
              </section>

              <section id="cookies-we-use">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">Cookies we use</h2>

                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left p-3 border border-slate-200 font-semibold text-slate-800">Cookie</th>
                        <th className="text-left p-3 border border-slate-200 font-semibold text-slate-800">Type</th>
                        <th className="text-left p-3 border border-slate-200 font-semibold text-slate-800">Purpose</th>
                        <th className="text-left p-3 border border-slate-200 font-semibold text-slate-800">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-3 border border-slate-200 font-mono text-xs">__clerk_*, __session, __client_uat</td>
                        <td className="p-3 border border-slate-200">Essential</td>
                        <td className="p-3 border border-slate-200">
                          Keeps you logged in between page loads. Set by Clerk, our authentication provider.
                        </td>
                        <td className="p-3 border border-slate-200">Session / up to 30 days</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="p-3 border border-slate-200 font-mono text-xs">
                          subly_cookie_consent <span className="text-slate-400">(browser localStorage, not a cookie)</span>
                        </td>
                        <td className="p-3 border border-slate-200">Essential</td>
                        <td className="p-3 border border-slate-200">
                          Remembers your analytics preference so the cookie banner doesn&apos;t reappear.
                        </td>
                        <td className="p-3 border border-slate-200">Until cleared by you</td>
                      </tr>
                      <tr>
                        <td className="p-3 border border-slate-200 font-mono text-xs">ph_*_posthog</td>
                        <td className="p-3 border border-slate-200">Optional / Analytics</td>
                        <td className="p-3 border border-slate-200">
                          Pseudonymous distinct ID used to group product analytics events. Only set if you
                          haven&apos;t declined analytics in the cookie banner.
                        </td>
                        <td className="p-3 border border-slate-200">1 year</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-sm text-slate-500">
                  We do not use advertising cookies or third-party ad-tracking cookies. We do use
                  PostHog, a product analytics provider, which sets one optional cookie described
                  above when analytics is enabled.
                </p>
              </section>

              <section id="analytics-events">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">Analytics events</h2>
                <p className="mb-3">
                  When analytics is enabled, we use PostHog to record a small set of named product
                  events. We do not use PostHog&apos;s autocapture, so no events fire beyond the ones
                  listed here:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><code>$pageview</code> — fired on every route change, with the current URL.</li>
                  <li><code>$pageleave</code> — fired automatically when you navigate away from a page.</li>
                  <li><code>listing_created</code> — rent, bedrooms, bathrooms, university, image count, and whether an end date was set.</li>
                  <li><code>message_sent</code> — conversation ID, whether you&apos;re the lister, and message length (not the message body).</li>
                  <li><code>match_confirmed</code> — conversation ID and whether the listing title was known at confirmation time.</li>
                  <li><code>review_submitted</code> — conversation ID and rating (not the review body).</li>
                  <li><code>payment_completed</code> — conversation ID, amount, currency, and Stripe session ID (recorded server-side).</li>
                </ul>
                <p className="mt-3">
                  When you sign in, we also call PostHog&apos;s <code>identify()</code> with your Clerk
                  user ID and university so events can be grouped to your account.
                </p>
                <p className="mt-3">
                  We also use Sentry for error monitoring. Sentry is triggered only when an error
                  occurs, and the data it may capture can include the page URL, your Clerk user ID,
                  your browser and operating system, and a stack trace.
                </p>
              </section>

              <section id="your-choices">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">Your choices</h2>
                <p>
                  Essential cookies (authentication) cannot be disabled without breaking core
                  functionality. You can control all cookies through your browser settings. Note
                  that disabling cookies will log you out and prevent you from signing back in.
                </p>
                <p className="mt-3">
                  Clicking <strong>Decline</strong> in the cookie banner stops product analytics
                  from initializing on that browser — PostHog will not load and no events will be
                  sent. Clicking <strong>Accept</strong> (or never declining) allows analytics to
                  run. You can reset this choice and make the banner reappear at any time by
                  clearing the <code>subly_cookie_consent</code> entry from your browser&apos;s
                  local storage.
                </p>
                <p className="mt-3">Most browsers let you view, block, or delete cookies via their settings menu:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Chrome: Settings &gt; Privacy and Security &gt; Cookies</li>
                  <li>Firefox: Settings &gt; Privacy &amp; Security &gt; Cookies</li>
                  <li>Safari: Preferences &gt; Privacy &gt; Manage Website Data</li>
                </ul>
              </section>

              <section id="changes">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">Changes to this policy</h2>
                <p>
                  If we introduce new types of cookies (such as analytics), we will update this page
                  and show a new consent prompt.
                </p>
              </section>

              <section id="contact">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">Contact</h2>
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
                <Link href="/privacy" className="block text-sm text-slate-400 hover:text-slate-600">Privacy Policy</Link>
                <Link href="/terms" className="block text-sm text-slate-400 hover:text-slate-600">Terms of Service</Link>
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
