import Link from "next/link";
import { SublyLogo } from "@/components/SublyLogo";

export const metadata = { title: "Cookie Policy — Subly" };

const sections = [
  { id: "what-are-cookies", label: "What are cookies?" },
  { id: "cookies-we-use", label: "Cookies we use" },
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
                  We use cookies only for authentication. No trackers, no ad networks.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cookie count</p>
                <div className="text-center py-2">
                  <span className="text-4xl font-bold text-emerald-600">2</span>
                  <p className="text-sm text-slate-500 mt-1">cookies total</p>
                </div>
                <p className="text-xs text-slate-400 text-center">Both are essential. Neither tracks you.</p>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Cookie Policy</h1>
            <p className="text-sm text-slate-500 mb-10">Last updated: May 2025</p>

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
                        <td className="p-3 border border-slate-200 font-mono text-xs">__clerk_*</td>
                        <td className="p-3 border border-slate-200">Essential</td>
                        <td className="p-3 border border-slate-200">
                          Keeps you logged in between page loads. Set by Clerk, our authentication provider.
                        </td>
                        <td className="p-3 border border-slate-200">Session / 30 days</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="p-3 border border-slate-200 font-mono text-xs">subly_cookie_consent</td>
                        <td className="p-3 border border-slate-200">Essential</td>
                        <td className="p-3 border border-slate-200">
                          Remembers whether you accepted or declined optional cookies so we don&apos;t ask again.
                        </td>
                        <td className="p-3 border border-slate-200">1 year</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-sm text-slate-500">
                  Subly currently uses only essential cookies required for authentication. We do not
                  use advertising or third-party tracking cookies.
                </p>
              </section>

              <section id="your-choices">
                <h2 className="text-xl font-semibold text-slate-900 mb-3">Your choices</h2>
                <p>
                  Essential cookies (authentication) cannot be disabled without breaking core
                  functionality. You can control all cookies through your browser settings. Note
                  that disabling cookies will log you out and prevent you from signing back in.
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
