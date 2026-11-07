"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Motor } from "./Motor";

const ENLACES = [
  { href: "/", texto: "Procesar facturas" },
  { href: "/revision", texto: "Revisión" },
  { href: "/metricas", texto: "Métricas" },
];

export function MenuSuperior() {
  const ruta = usePathname();
  const [correo, setCorreo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void api("/api/sesion")
      .then((r) => (r.ok ? (r.json() as Promise<{ email: string }>) : null))
      .then((d) => vivo && d && setCorreo(d.email))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  async function salir() {
    await fetch("/api/sesion", { method: "DELETE" });
    // Recarga completa a propósito: reinicia el Motor y todo el estado de la página.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  const activo = (href: string) => (href === "/" ? ruta === "/" || ruta.startsWith("/procesos") : ruta.startsWith(href));

  return (
    <header className="border-b border-borde bg-superficie">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="font-semibold">Facturas</span>
        <nav className="flex gap-1" aria-label="Principal">
          {ENLACES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              aria-current={activo(e.href) ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${activo(e.href) ? "bg-acento text-acento-texto" : "text-texto hover:bg-fondo"}`}
            >
              {e.texto}
            </Link>
          ))}
        </nav>
        <Motor />
        <div className="ml-auto flex items-center gap-3 text-sm">
          {correo && <span className="text-muted">{correo}</span>}
          <button type="button" onClick={salir} className="boton px-3 py-1.5 text-sm">
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
