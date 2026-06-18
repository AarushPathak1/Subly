import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { CookieBanner } from "@/components/CookieBanner";
import { PostHogProvider } from "@/components/PostHogProvider";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subly — Student Subleasing Marketplace",
  description: "Find and post verified student subleases near your university.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <PostHogProvider>
        <html lang="en">
          <body>
            {children}
            <Toaster position="bottom-right" richColors />
            <CookieBanner />
          </body>
        </html>
      </PostHogProvider>
    </ClerkProvider>
  );
}
