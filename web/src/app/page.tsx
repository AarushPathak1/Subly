import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <nav className="flex items-center justify-between px-8 py-4 border-b">
        <span className="text-xl font-bold tracking-tight">Subly</span>
        <div className="flex gap-4 items-center">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
                Sign in with .edu
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link href="/listings/new" className="text-sm font-medium text-indigo-600 hover:underline">
              Post a sublease
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </nav>

      <section className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 mb-4">
          Sublease. Verified.
        </h1>
        <p className="text-lg text-gray-500 mb-8">
          The only student subleasing marketplace that requires a <strong>.edu</strong> address —
          so every listing and every renter is a real student.
        </p>
        <Link
          href="/listings"
          className="inline-block px-8 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition"
        >
          Browse listings
        </Link>
      </section>
    </main>
  );
}
