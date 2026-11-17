import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "EyeZen · Clinical operations",
  description: "A clearer view of clinical operations at EyeZen Hospital.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full"><Providers>{children}</Providers></body>
    </html>
  );
}
