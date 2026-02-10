import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { DashboardSyncProvider } from "@/contexts/DashboardSyncContext";
import { UploadProvider } from "@/contexts/UploadContext";
import ToastContainer from "@/components/ui/ToastContainer";
import { ToastProvider } from "@/hooks/useToast";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { UploadButtonGate } from "@/components/upload/UploadButtonGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FrameSync",
  description: "Video synchronization platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <DashboardSyncProvider>
            <UploadProvider>
            <ToastProvider>
              <ProtectedRoute>
                {children}
                <UploadButtonGate />
              </ProtectedRoute>
              <ToastContainer />
            </ToastProvider>
            </UploadProvider>
          </DashboardSyncProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
