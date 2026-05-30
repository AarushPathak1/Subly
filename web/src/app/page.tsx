import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GetStartedFlow } from "@/components/GetStartedFlow";
import { LandingNav } from "./LandingNav";

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#4f46e5" fillOpacity="0.1" />
      <path d="M6 10l3 3 5-5" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M14 3L4 7v7c0 5.5 4.3 10.7 10 12 5.7-1.3 10-6.5 10-12V7L14 3z" fill="#4f46e5" fillOpacity="0.12" stroke="#4f46e5" strokeWidth="1.5" />
      <path d="M9 14l3.5 3.5 6.5-6.5" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <ellipse cx="14" cy="14" rx="10" ry="8" fill="#7c3aed" fillOpacity="0.1" stroke="#7c3aed" strokeWidth="1.5" />
      <path d="M14 6v4M14 18v4M6 14h4M18 14h4" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="14" r="2.5" fill="#7c3aed" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="11" cy="13" r="6" fill="#0891b2" fillOpacity="0.1" stroke="#0891b2" strokeWidth="1.5" />
      <path d="M15.5 16.5L24 25" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 20l2-2" stroke="#0891b2" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="11" cy="13" r="2" fill="#0891b2" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="#f59e0b">
      <path d="M8 1l1.8 3.6L14 5.3l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L8 1z" />
    </svg>
  );
}

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="relative min-h-screen bg-white">
      <LandingNav />

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMwLTkuOTQtOC4wNi0xOC0xOC0xOFYwaDQydjQySDE4YzkuOTQgMCAxOC04LjA2IDE4LTE4eiIgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIuMDIiLz48L2c+PC9zdmc+')] opacity-40" />

        <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 rounded-full px-4 py-1.5 mb-8">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-indigo-200 font-medium">Exclusively for verified students</span>
              </div>

              <h1 className="text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-6">
                Find your next home.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
                  Trust guaranteed.
                </span>
              </h1>

              <p className="text-lg text-slate-300 mb-8 leading-relaxed max-w-lg">
                Subly is the only subleasing marketplace built exclusively for students. Every listing, every renter, and every message comes from someone with a verified <strong className="text-white font-semibold">.edu address.</strong> No scammers, no strangers, no stress.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-12">
                <SignedOut>
                  <GetStartedFlow />
                  <Link href="/dashboard" className="px-7 py-3.5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl transition border border-white/20 text-base text-center">
                    Browse listings
                  </Link>
                </SignedOut>
                <SignedIn>
                  <Link href="/dashboard" className="px-7 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-900/50 text-base text-center">
                    Go to dashboard
                  </Link>
                </SignedIn>
              </div>

              <div className="flex items-center gap-8">
                {[
                  { value: "10k+", label: "Listings posted" },
                  { value: "500+", label: "Universities" },
                  { value: "0", label: "Verified scams" },
                ].map(({ value, label }) => (
                  <div key={label}>
                    <p className="text-2xl font-extrabold text-white">{value}</p>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating listing card mockup */}
            <div className="hidden lg:block relative">
              <div className="relative w-full aspect-[4/3]">
                <div className="absolute top-4 right-0 w-72 bg-white/10 backdrop-blur border border-white/15 rounded-2xl p-4 rotate-3 opacity-60">
                  <div className="w-full h-32 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 mb-3" />
                  <div className="h-3 w-3/4 bg-white/20 rounded mb-2" />
                  <div className="h-3 w-1/2 bg-white/15 rounded" />
                </div>
                <div className="absolute top-0 left-0 w-80 bg-white rounded-2xl shadow-2xl overflow-hidden">
                  <img
                    src="https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&auto=format&fit=crop&q=80"
                    alt=""
                    aria-hidden="true"
                    className="w-full h-44 object-cover"
                  />
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">UT Austin</span>
                      <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">Verified</span>
                    </div>
                    <p className="font-bold text-slate-900 text-lg">$1,250 / mo</p>
                    <p className="text-sm text-slate-500">2 bed · 1 bath · 0.4 mi to campus</p>
                    <div className="mt-3 flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-indigo-600">S</span>
                      </div>
                      <span className="text-xs text-slate-500">Posted by Sarah K. · <span className="text-emerald-600 font-medium">.edu verified</span></span>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-4 right-0 bg-violet-600 text-white rounded-xl px-4 py-3 shadow-xl">
                  <p className="text-xs font-semibold opacity-80 mb-0.5">AI Match Score</p>
                  <p className="text-2xl font-extrabold">94%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* University trust strip */}
      <section className="bg-slate-50 border-y border-slate-100 py-8">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-6">
            Students from these universities are already on Subly
          </p>
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-4 text-slate-500 font-bold text-sm">
            {["UT Austin", "UCLA", "USC", "Georgia Tech", "UMich", "NYU", "ASU", "UNC", "Penn State"].map(u => (
              <span key={u} className="hover:text-indigo-600 transition cursor-default">{u}</span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Simple by design</p>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Find a place in three steps</h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">
              We made it as easy as possible to go from needing a place to having one.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Verify your .edu",
                desc: "Sign up with your university email and we confirm you're a real student. Takes about 30 seconds and keeps everyone on the platform safe.",
                img: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=600&auto=format&fit=crop&q=80",
                badge: "bg-indigo-100 text-indigo-700",
                overlay: "from-indigo-900/60",
              },
              {
                step: "02",
                title: "Tell us your vibe",
                desc: "Describe your ideal place in plain English. Quiet study space? Dog-friendly? Close to the engineering building? Our AI actually gets it.",
                img: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&auto=format&fit=crop&q=80",
                badge: "bg-violet-100 text-violet-700",
                overlay: "from-violet-900/60",
              },
              {
                step: "03",
                title: "Get matched instantly",
                desc: "We surface the listings most compatible with your lifestyle, budget, and preferences. No scrolling through hundreds of irrelevant posts.",
                img: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=600&auto=format&fit=crop&q=80",
                badge: "bg-cyan-100 text-cyan-700",
                overlay: "from-cyan-900/60",
              },
            ].map(({ step, title, desc, img, badge, overlay }) => (
              <div key={step} className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden flex flex-col hover:shadow-md transition">
                <div className="relative h-48 bg-slate-200 overflow-hidden">
                  <img
                    src={img}
                    alt=""
                    aria-hidden="true"
                    className="w-full h-full object-cover"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-t ${overlay} to-transparent`} />
                  <span className={`absolute top-3 right-3 text-xs font-extrabold px-2.5 py-1 rounded-full ${badge}`}>
                    Step {step}
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Why Subly</p>
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Built for students who are tired of getting burned.</h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">
              Craigslist has scammers. Facebook Marketplace has bots. Subly was built from the ground up to have neither.
            </p>
          </div>

          {/* Feature 1 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <ShieldIcon />
                <span className="text-sm font-bold text-indigo-600 uppercase tracking-wide">AI Fraud Detection</span>
              </div>
              <h3 className="text-3xl font-extrabold text-slate-900 mb-4">
                Every listing is scored before you see it
              </h3>
              <p className="text-slate-600 leading-relaxed mb-6">
                Our Trust Engine analyzes every new listing for scam signals, including suspicious pricing, urgency language, and keyword patterns. Anything risky gets flagged with a High Risk badge before it ever reaches you.
              </p>
              <ul className="space-y-3">
                {["Heuristic keyword analysis", "LLM tone and urgency detection", "Price anomaly scoring", "Real-time fraud badge on every card"].map(f => (
                  <li key={f} className="flex items-center gap-3 text-sm text-slate-700">
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-xl">
              <img
                src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=700&auto=format&fit=crop&q=80"
                alt="Secure verified housing"
                className="w-full h-80 object-cover"
              />
            </div>
          </div>

          {/* Feature 2 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
            <div className="order-2 lg:order-1 rounded-2xl overflow-hidden shadow-xl">
              <img
                src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=700&auto=format&fit=crop&q=80"
                alt="Student apartment search"
                className="w-full h-80 object-cover"
              />
            </div>
            <div className="order-1 lg:order-2">
              <div className="flex items-center gap-3 mb-4">
                <BrainIcon />
                <span className="text-sm font-bold text-violet-600 uppercase tracking-wide">Semantic Matching</span>
              </div>
              <h3 className="text-3xl font-extrabold text-slate-900 mb-4">
                Search the way you actually think
              </h3>
              <p className="text-slate-600 leading-relaxed mb-6">
                Type something like &quot;quiet studio near the engineering quad, dog-friendly, no smoking&quot; and our AI genuinely understands what you mean. Pinecone vector search finds the listings that match your life, not just your checkbox filters.
              </p>
              <ul className="space-y-3">
                {["OpenAI embeddings on every listing", "Pinecone vector similarity ranking", "Hard filters combined with semantic re-ranking", "Personalized to your preferences"].map(f => (
                  <li key={f} className="flex items-center gap-3 text-sm text-slate-700">
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <KeyIcon />
                <span className="text-sm font-bold text-cyan-600 uppercase tracking-wide">.edu Verification</span>
              </div>
              <h3 className="text-3xl font-extrabold text-slate-900 mb-4">
                Everyone here is a real student
              </h3>
              <p className="text-slate-600 leading-relaxed mb-6">
                You cannot post, browse, or message anyone without a verified university email address. This is not just a feature we bolted on. It is the entire foundation that makes Subly a community worth trusting.
              </p>
              <ul className="space-y-3">
                {["Clerk-verified .edu domain check", "OAuth via Google Workspace for EDU", "No anonymous listings, ever", "Vetted community of real students"].map(f => (
                  <li key={f} className="flex items-center gap-3 text-sm text-slate-700">
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-xl">
              <img
                src="https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=700&auto=format&fit=crop&q=80"
                alt="University campus"
                className="w-full h-80 object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-gradient-to-br from-indigo-600 to-violet-700 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "10,000+", label: "Listings posted" },
              { value: "500+", label: "Universities" },
              { value: "98%", label: "Match satisfaction" },
              { value: "Under 24h", label: "Avg. time to match" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-4xl font-extrabold text-white mb-2">{value}</p>
                <p className="text-indigo-200 text-sm font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-3">Real students, real results</p>
            <h2 className="text-4xl font-extrabold text-slate-900">They found their place. You can too.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "I was dreading the sublease search. Subly matched me with the perfect 1-bed near UT engineering in under an hour. The scam badge alone saved me from two listings I almost responded to.",
                name: "Priya R.",
                school: "UT Austin, Computer Science",
                avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&auto=format&fit=crop&q=80",
              },
              {
                quote: "I listed my apartment and had five serious inquiries within 24 hours, all from verified students. No random strangers, no lowballers. This is genuinely how subletting should work.",
                name: "Marcus T.",
                school: "UCLA, Business",
                avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80",
              },
              {
                quote: "The AI matching is genuinely impressive. I described my situation in a sentence and it surfaced listings I never would have found with filters alone. Moved in without seeing a single scam.",
                name: "Emily S.",
                school: "Georgia Tech, ECE",
                avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&auto=format&fit=crop&q=80",
              },
            ].map(({ quote, name, school, avatar }) => (
              <div key={name} className="bg-slate-50 rounded-2xl p-6 flex flex-col gap-4 border border-slate-100 hover:border-indigo-200 hover:shadow-md transition">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => <StarIcon key={i} />)}
                </div>
                <p className="text-slate-700 text-sm leading-relaxed flex-1">&ldquo;{quote}&rdquo;</p>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                  <img src={avatar} alt={name} className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">{name}</p>
                    <p className="text-xs text-slate-500">{school}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-3">Why not just use Craigslist?</h2>
            <p className="text-slate-500">Fair question. Here is the honest answer.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left px-6 py-4 font-semibold text-slate-500 w-1/3">Feature</th>
                  <th className="px-6 py-4 text-center font-bold text-slate-900">Subly</th>
                  <th className="px-6 py-4 text-center font-semibold text-slate-400">Craigslist</th>
                  <th className="px-6 py-4 text-center font-semibold text-slate-400">Facebook</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Identity verification", "✅ .edu required", "❌ Anonymous", "⚠️ Facebook account"],
                  ["Scam detection", "✅ AI-scored", "❌ None", "❌ None"],
                  ["AI-powered search", "✅ Semantic", "❌ Keyword only", "❌ Keyword only"],
                  ["Student-only community", "✅ Always", "❌ Anyone", "❌ Anyone"],
                  ["Personalized matches", "✅ Vibe-based AI", "❌ None", "❌ None"],
                ].map(([feature, subly, cl, fb]) => (
                  <tr key={feature} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-700">{feature}</td>
                    <td className="px-6 py-4 text-center font-medium text-emerald-700 bg-emerald-50/50">{subly}</td>
                    <td className="px-6 py-4 text-center text-slate-500">{cl}</td>
                    <td className="px-6 py-4 text-center text-slate-500">{fb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-slate-900">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="flex justify-center mb-6">
            <SublyLogo />
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Your next place is already on Subly.
          </h2>
          <p className="text-slate-400 text-lg mb-10">
            Join thousands of students who found their sublease safely. No scams, no strangers, no stress.
          </p>
          <SignedOut>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <GetStartedFlow />
              <SignInButton mode="modal">
                <button className="px-8 py-4 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl transition border border-white/20 text-base">
                  Sign in
                </button>
              </SignInButton>
            </div>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard" className="inline-block px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition text-base">
              Go to your dashboard
            </Link>
          </SignedIn>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 py-14">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2.5 mb-4">
                <SublyLogo />
                <span className="text-white font-bold text-lg">Subly</span>
              </Link>
              <p className="text-sm leading-relaxed">
                The only student subleasing marketplace where everyone is verified.
              </p>
            </div>

            <div>
              <p className="text-white font-semibold text-sm mb-4">Product</p>
              <ul className="space-y-3 text-sm">
                <li><Link href="#how-it-works" className="hover:text-white transition">How it works</Link></li>
                <li><Link href="#features" className="hover:text-white transition">Features</Link></li>
                <li><Link href="/listings/new" className="hover:text-white transition">Post a listing</Link></li>
                <li><Link href="/dashboard" className="hover:text-white transition">Browse listings</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-white font-semibold text-sm mb-4">Company</p>
              <ul className="space-y-3 text-sm">
                <li><Link href="#" className="hover:text-white transition">About us</Link></li>
                <li><Link href="#" className="hover:text-white transition">Blog</Link></li>
                <li><Link href="#" className="hover:text-white transition">Careers</Link></li>
                <li><Link href="mailto:hello@subly.app" className="hover:text-white transition">Contact us</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-white font-semibold text-sm mb-4">Legal</p>
              <ul className="space-y-3 text-sm">
                <li><Link href="/privacy" className="hover:text-white transition">Privacy policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition">Terms of service</Link></li>
                <li><Link href="/cookies" className="hover:text-white transition">Cookie policy</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
            <p>&copy; {new Date().getFullYear()} Subly. All rights reserved.</p>
            <p>Built for students, by students.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
