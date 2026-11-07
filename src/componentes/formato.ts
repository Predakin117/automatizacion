const pesosFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const enteroFmt = new Intl.NumberFormat("es-CO");

/** Importes en pesos COP (enteros). */
export function pesos(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : pesosFmt.format(n);
}

export function entero(n: number): string {
  return enteroFmt.format(n);
}

export function porcentaje(n: number): string {
  return `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
}

export function megas(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}

export function fechaHora(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
}

export function duracion(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}
