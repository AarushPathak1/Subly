import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import VerifyForm from "./VerifyForm";

export default async function VerifyPage() {
  const { userId } = auth();
  if (!userId) redirect("/");

  const user = await getSessionUser();
  if (user?.edu_verified) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Verify your student email
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Subly is exclusive to verified students. Enter your{" "}
          <strong>.edu</strong> address to unlock the platform.
        </p>
        <VerifyForm />
      </div>
    </main>
  );
}
