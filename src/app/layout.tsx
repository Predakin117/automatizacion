import type { Metadata } from "next";
import "./globals.css";

// Sin next/font/google: descarga las fuentes al compilar y el entorno de build no
// siempre tiene acceso a internet. Usamos las fuentes del sistema.
export const metadata: Metadata = {
  title: "Procesador de facturas",
  description: "Lectura automática de facturas con OCR",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
