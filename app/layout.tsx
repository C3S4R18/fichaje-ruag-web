import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "RUAG Jornada",
  description: "Sistema de control de asistencia RUAG",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RUAG",
  },
  icons: {
    icon: "/ruag-icon-192.png",
    apple: "/ruag-icon-192.png",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerList = await headers();
  const pathname = headerList.get("x-current-path") ?? "";
  const isWorkerPwa = pathname.startsWith("/setup") || pathname.startsWith("/escaner");
  const manifest = isWorkerPwa ? "/manifest-worker.json" : "/manifest-admin.json";
  const themeColor = isWorkerPwa ? "#2563EB" : "#0F172A";

  return (
    <html lang="es">
      <head>
        <link rel="manifest" href={manifest} />
        <meta name="theme-color" content={themeColor} />
        <link rel="apple-touch-icon" href="/ruag-icon-192.png" />
      </head>
      <body>
        {children}
        {/* FIX: Sonner reemplaza todos los alert() nativos en la app */}
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            style: {
              fontFamily: "'DM Sans', sans-serif",
              borderRadius: "14px",
              fontWeight: 600,
            },
          }}
        />
      </body>
    </html>
  );
}
