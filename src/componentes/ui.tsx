import type { ReactNode } from "react";

/** Piezas visuales compartidas. Los estados bueno/malo SIEMPRE llevan icono + texto, nunca solo color. */

export function Tarjeta({ titulo, children, className = "" }: { titulo?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`tarjeta ${className}`}>
      {titulo && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{titulo}</h2>}
      {children}
    </section>
  );
}

export function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: ReactNode; nota?: ReactNode }) {
  return (
    <div className="tarjeta flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted">{etiqueta}</span>
      <span className="cifra text-2xl font-semibold">{valor}</span>
      {nota && <span className="text-xs text-muted">{nota}</span>}
    </div>
  );
}

export function Barra({ valor, total, tono = "acento", alto = "h-2" }: { valor: number; total: number; tono?: "acento" | "bueno" | "malo"; alto?: string }) {
  const pct = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  const color = tono === "bueno" ? "bg-bueno" : tono === "malo" ? "bg-malo" : "bg-acento";
  return (
    <div className={`w-full overflow-hidden rounded-full bg-borde ${alto}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`${color} h-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Barra fina de dos tramos: correctas (bueno) y mal leídas (malo). */
export function BarraDoble({ buenas, malas }: { buenas: number; malas: number }) {
  const total = buenas + malas;
  if (total === 0) return <div className="h-1.5 w-full rounded-full bg-borde" />;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-borde">
      <div className="bg-bueno" style={{ width: `${(buenas / total) * 100}%` }} />
      <div className="bg-malo" style={{ width: `${(malas / total) * 100}%` }} />
    </div>
  );
}

export function Insignia({ tono, children }: { tono: "bueno" | "malo" | "neutro" | "aviso"; children: ReactNode }) {
  const estilos = {
    bueno: "bg-bueno-suave text-bueno",
    malo: "bg-malo-suave text-malo",
    aviso: "bg-fondo text-aviso",
    neutro: "bg-fondo text-muted",
  }[tono];
  const icono = { bueno: "✓", malo: "✕", aviso: "◷", neutro: "•" }[tono];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${estilos}`}>
      <span aria-hidden>{icono}</span>
      {children}
    </span>
  );
}

export function EstadoLote({ estado }: { estado: string }) {
  if (estado === "terminado") return <Insignia tono="bueno">Terminado</Insignia>;
  if (estado === "ejecutando") return <Insignia tono="aviso">Procesando</Insignia>;
  return <Insignia tono="neutro">Subiendo</Insignia>;
}

export function Aviso({ tono = "malo", children }: { tono?: "malo" | "aviso"; children: ReactNode }) {
  return (
    <p role="alert" className={`rounded-md px-3 py-2 text-sm ${tono === "malo" ? "bg-malo-suave text-malo" : "bg-fondo text-aviso"}`}>
      {tono === "malo" ? "✕ " : "! "}
      {children}
    </p>
  );
}
