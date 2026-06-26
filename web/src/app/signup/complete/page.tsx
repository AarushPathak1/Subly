import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export default async function SignupCompletePage({
  searchParams,
}: {
  searchParams: { signed?: string };
}) {
  const { userId, getToken } = await auth();
  if (!userId) redirect("/");

  const signedToken = searchParams?.signed;
  if (!signedToken) redirect("/dashboard");

  const token = await getToken();

  const res = await fetch(`${GATEWAY}/api/auth/invite-request/redeem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ signed_token: signedToken }),
  });

  // 409 means already redeemed by this user — still let them through
  if (!res.ok && res.status !== 409) {
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
          <h1 className="text-lg font-bold text-slate-900 mb-2">Redemption failed</h1>
          <p className="text-sm text-slate-500 mb-6">
            {data.error ?? "Something went wrong. Please contact support."}
          </p>
        </div>
      </div>
    );
  }

  redirect("/onboarding");
}
