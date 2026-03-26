import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "RUAG Jornada",
  description: "Sistema de control de asistencia RUAG",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RUAG",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
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