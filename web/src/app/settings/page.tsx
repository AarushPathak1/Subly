import { requireEduVerified } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";
import { AppNav } from "@/components/AppNav";
import VibeForm from "@/app/onboarding/VibeForm";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";

const GATEWAY = process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireEduVerified();
  const { getToken } = auth();
  const token = await getToken();

  const profileRes = await fetch(`${GATEWAY}/api/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const existing = profileRes.ok ? await profileRes.json() : undefined;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppNav active="settings" />

      <div className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Settings</h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Update your university, budget, and vibe preferences. Changes apply to your next match run.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <VibeForm
              mode="settings"
              university={user.university ?? ""}
              existing={existing ? {
                vibe_text: existing.vibe_text ?? "",
                university: existing.university ?? user.university ?? "",
                max_rent: existing.max_rent_cents ? String(existing.max_rent_cents / 100) : "",
                min_bedrooms: String(existing.min_bedrooms ?? "1"),
              } : undefined}
            />
          </div>

          <DeleteAccountSection />
        </div>
      </div>
    </div>
  );
}
