import { requireEduVerified } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { fetchSavedListings } from "@/lib/actions";
import { SavedListingsClient } from "./SavedListingsClient";

export default async function SavedListingsPage() {
  await requireEduVerified();

  const saved = await fetchSavedListings();

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav active="saved" />

      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <h1 className="text-2xl font-extrabold text-white mb-1">Saved listings</h1>
          <p className="text-indigo-200 text-sm">
            {saved.length} saved listing{saved.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <SavedListingsClient listings={saved} />
      </div>
    </div>
  );
}
