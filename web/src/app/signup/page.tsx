import { redirect } from "next/navigation";
import { SublyLogo } from "@/components/SublyLogo";
import Link from "next/link";
import { SignupWithInvite } from "@/components/SignupWithInvite";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams?.token;
  if (!token) redirect("/");

  const res = await fetch(
    `${GATEWAY}/api/auth/invite-request/verify?token=${encodeURIComponent(token)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-red-100 shadow-sm p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.5" />
              <path d="M12 7v5M12 15.5h.01" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Invalid invite link</h1>
          <p className="text-sm text-slate-500 mb-6">
            {data.error ?? "This link is invalid, expired, or has already been used."}
          </p>
          <Link href="/" className="text-sm text-indigo-600 font-medium hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const { email, university_name, signed_token } = await res.json();

  return (
    <SignupWithInvite
      email={email}
      universityName={university_name}
      signedToken={signed_token}
    />
  );
}
