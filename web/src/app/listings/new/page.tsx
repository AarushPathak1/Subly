import { requireEduVerified } from "@/lib/auth";
import ListingForm from "./ListingForm";

export default async function NewListingPage() {
  await requireEduVerified();

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Post a sublease</h1>
        <p className="text-sm text-gray-500 mb-8">
          Your listing will be reviewed for quality before going live.
        </p>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <ListingForm />
        </div>
      </div>
    </main>
  );
}
