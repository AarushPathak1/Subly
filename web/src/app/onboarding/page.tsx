import { requireEduVerified } from "@/lib/auth";
import VibeForm from "./VibeForm";

export default async function OnboardingPage() {
  const user = await requireEduVerified();

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-lg w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Vibe Check</h1>
        <p className="text-sm text-gray-500 mb-8">
          Tell us what you are looking for and we will surface the best matches.
        </p>
        <VibeForm university={user.university ?? ""} />
      </div>
    </main>
  );
}
