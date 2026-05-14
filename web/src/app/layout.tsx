import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subly — Student Subleasing Marketplace",
  description: "Find and post verified student subleases near your university.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
          <Toaster position="bottom-right" richColors />
        </body>
      </html>
    </ClerkProvider>
  );
}
