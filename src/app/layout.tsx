import type { Metadata } from "next";
import { Suspense } from "react";
import { Cascaron } from "@/componentes/Cascaron";
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
      <body className="flex min-h-full flex-col">
        {/* El menú vive en el layout: no se desmonta al navegar, y el Motor sigue trabajando. */}
        <Suspense fallback={<div className="h-14 border-b border-borde bg-superficie" />}>
          <Cascaron />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
