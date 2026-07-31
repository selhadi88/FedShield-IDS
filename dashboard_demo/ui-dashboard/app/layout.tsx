import { Toaster } from "react-hot-toast";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "FDL Intrusion Monitor",
  description: "Federated Smart Home Analytics Dashboard",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Toaster 
          position="top-right"
          toastOptions={{
            style: {
              background: '#0a0a0a',
              color: '#06b6d4',
              border: '1px solid #0891b2',
              fontFamily: 'monospace',
              fontSize: '12px'
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
