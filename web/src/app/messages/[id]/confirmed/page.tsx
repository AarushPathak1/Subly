import { requireEduVerified } from "@/lib/auth";
import { verifyAndConfirmMatch, fetchConversation } from "@/lib/actions";
import { AppNav } from "@/components/AppNav";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ConfirmedPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { session_id?: string; agreement?: string };
}) {
  await requireEduVerified();

  const sessionId = searchParams.session_id;
  if (!sessionId) redirect(`/messages/${params.id}`);

  const includesAgreement = searchParams.agreement === "true";
  const [result, conversation] = await Promise.all([
    verifyAndConfirmMatch(params.id, sessionId, includesAgreement),
    fetchConversation(params.id),
  ]);

  const failed = !!result.error && result.error !== "Failed to confirm match";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppNav active="messages" />

      <div className="max-w-xl mx-auto w-full px-6 py-16 flex flex-col items-center text-center">
        {failed ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1.5"/>
                <path d="M8 8l8 8M16 8l-8 8" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-slate-500 text-sm mb-8">{result.error}</p>
            <Link href={`/messages/${params.id}`} className="px-6 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition">
              Back to conversation
            </Link>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="12" fill="#d1fae5" stroke="#059669" strokeWidth="1.5"/>
                <path d="M8 14l4 4 8-8" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Match confirmed!</h1>
            <p className="text-slate-500 text-sm leading-relaxed mb-8 max-w-sm">
              You&apos;ve locked in your sublease match for{" "}
              <span className="font-semibold text-slate-700">{conversation?.listing_title ?? "this listing"}</span>.
              The renter has been notified.
            </p>

            {includesAgreement && (
              <div className="w-full bg-white rounded-2xl border border-slate-200 p-6 mb-8 text-left">
                <div className="flex items-center gap-2 mb-4">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <rect x="2" y="1" width="14" height="16" rx="2" stroke="#6366f1" strokeWidth="1.4"/>
                    <path d="M5 6h8M5 9h8M5 12h5" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  <p className="font-semibold text-slate-900 text-sm">Your sublease agreement</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Below is a pre-filled agreement template based on the listing details. Review it, share it with the other party, and have both parties sign. For legally binding execution, use a service like DocuSign or HelloSign.
                </p>
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-600 font-mono leading-relaxed whitespace-pre-wrap">
{`SUBLEASE AGREEMENT

This Sublease Agreement ("Agreement") is entered into on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.

PARTIES
Sublessor (Lister): _______________________
Sublessee (Renter): _______________________

PROPERTY
Listing: ${conversation?.listing_title ?? "[listing title]"}
Address: As provided in the original listing on Subly.

TERM
Start Date: As agreed between the parties.
End Date:   As agreed between the parties.

RENT
Monthly Rent: As agreed between the parties.
Due Date:     1st of each month.
Payment Method: As agreed between the parties.

TERMS
1. The Sublessor has the right to sublease the property and has obtained any required consent from the original landlord.
2. The Sublessee agrees to maintain the property in good condition and comply with all rules of the original lease.
3. The Sublessor shall return the security deposit within 30 days of the sublease end date, less any deductions for damages.
4. This Agreement is subject to the terms of the original lease between the Sublessor and the landlord.
5. Either party may terminate this Agreement with 30 days written notice.

SIGNATURES

Sublessor: _______________________ Date: _________

Sublessee: _______________________ Date: _________`}
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  This is a template, not legal advice. Consult a local attorney if you have concerns.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Link
                href={`/messages/${params.id}`}
                className="px-6 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
              >
                Back to conversation
              </Link>
              <Link
                href="/messages"
                className="px-6 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition"
              >
                All messages
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
