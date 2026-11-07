import type { Importes, MetricasLote, MetricasProveedor } from "@/lib/modelo/tipos";

/**
 * Métricas de un lote: funciones PURAS (se prueban sin base de datos y se usan también en
 * el navegador). Los contadores viven en procesos/{id}.metricas y se incrementan dentro de
 * la MISMA transacción que guarda la factura: siempre cuadran con los datos y abrir el
 * panel cuesta 1 lectura por lote.
 */

export interface ImportesFactura {
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number | null;
  total: number | null;
}

export type EventoMetrica =
  | {
      tipo: "aceptada";
      importes: ImportesFactura;
      proveedor: { nit: string; nombre: string } | null;
      cliente: "nuevo" | "existente" | null;
    }
  | { tipo: "revision"; importes: ImportesFactura }
  | { tipo: "duplicada" }
  | { tipo: "error" }
  | {
      // Fase 9: una persona aceptó o corrigió la factura. `antes` son los importes que ya se
      // habían sumado como manuales (reedición): se suma solo la diferencia.
      tipo: "manual";
      importes: ImportesFactura;
      antes: ImportesFactura | null;
      proveedor: { nit: string; nombre: string } | null;
      proveedorAntes: { nit: string } | null;
      cliente: "nuevo" | null;
    };

/** Cambios a sumar: rutas con puntos ("aceptadas.n") → incremento. Puro. */
export interface Cambios {
  incrementos: Record<string, number>;
  proveedores: Record<string, { nombre?: string; incrementos: Partial<Importes> }>;
}

const cero = (v: number | null) => v ?? 0;

function sumarGrupo(r: Record<string, number>, grupo: string, imp: ImportesFactura, signo = 1, n = 1): void {
  r[`${grupo}.n`] = (r[`${grupo}.n`] ?? 0) + n * signo;
  for (const k of ["subtotal", "iva", "impoconsumo", "total"] as const) {
    r[`${grupo}.${k}`] = (r[`${grupo}.${k}`] ?? 0) + cero(imp[k]) * signo;
  }
}

export function cambiosDe(e: EventoMetrica): Cambios {
  const incrementos: Record<string, number> = {};
  const proveedores: Cambios["proveedores"] = {};
  const sumarProveedor = (p: { nit: string; nombre?: string }, imp: ImportesFactura, signo: number, n: number) => {
    const actual = proveedores[p.nit] ?? { incrementos: {} };
    if (p.nombre) actual.nombre = p.nombre;
    const inc = actual.incrementos;
    inc.n = (inc.n ?? 0) + n * signo;
    for (const k of ["subtotal", "iva", "impoconsumo", "total"] as const) inc[k] = (inc[k] ?? 0) + cero(imp[k]) * signo;
    proveedores[p.nit] = actual;
  };

  switch (e.tipo) {
    case "aceptada":
      sumarGrupo(incrementos, "aceptadas", e.importes);
      // Por razón social SOLO las aceptadas: en las de revisión el NIT puede estar mal leído.
      if (e.proveedor) sumarProveedor(e.proveedor, e.importes, 1, 1);
      if (e.cliente === "nuevo") incrementos.clientesNuevos = 1;
      if (e.cliente === "existente") incrementos.clientesExistentes = 1;
      break;
    case "revision":
      sumarGrupo(incrementos, "revision", e.importes);
      break;
    case "duplicada":
      incrementos.duplicadas = 1;
      break;
    case "error":
      incrementos.errores = 1;
      break;
    case "manual": {
      const primera = e.antes === null;
      if (!primera) sumarGrupo(incrementos, "manuales", e.antes!, -1, 1);
      sumarGrupo(incrementos, "manuales", e.importes, 1, 1);
      if (e.proveedorAntes && e.antes) sumarProveedor(e.proveedorAntes, e.antes, -1, 1);
      if (e.proveedor) sumarProveedor(e.proveedor, e.importes, 1, 1);
      if (e.cliente === "nuevo") incrementos.clientesNuevos = 1;
      break;
    }
  }
  // Limpia los ceros (no hace falta escribirlos).
  for (const k of Object.keys(incrementos)) if (incrementos[k] === 0) delete incrementos[k];
  return { incrementos, proveedores };
}

// ───────────── lectura: sumar lotes y calcular tasas ─────────────

export const importesVacios = (): Importes => ({ n: 0, subtotal: 0, iva: 0, impoconsumo: 0, total: 0 });

export function metricasVacias(): MetricasLote {
  return {
    aceptadas: importesVacios(),
    revision: importesVacios(),
    manuales: importesVacios(),
    errores: 0,
    duplicadas: 0,
    clientesNuevos: 0,
    clientesExistentes: 0,
    proveedores: {},
  };
}

/** Completa un objeto de métricas parcial (como viene de Firestore) con ceros. */
export function normalizarMetricas(m: Partial<MetricasLote> | undefined): MetricasLote {
  const v = metricasVacias();
  if (!m) return v;
  const imp = (x: Partial<Importes> | undefined): Importes => ({ ...importesVacios(), ...(x ?? {}) });
  const proveedores: Record<string, MetricasProveedor> = {};
  for (const [nit, p] of Object.entries(m.proveedores ?? {})) {
    proveedores[nit] = { ...importesVacios(), ...p, nombre: p.nombre ?? "" };
  }
  return {
    aceptadas: imp(m.aceptadas),
    revision: imp(m.revision),
    manuales: imp(m.manuales),
    errores: m.errores ?? 0,
    duplicadas: m.duplicadas ?? 0,
    clientesNuevos: m.clientesNuevos ?? 0,
    clientesExistentes: m.clientesExistentes ?? 0,
    proveedores,
  };
}

function sumarImportes(a: Importes, b: Importes): Importes {
  return {
    n: a.n + b.n,
    subtotal: a.subtotal + b.subtotal,
    iva: a.iva + b.iva,
    impoconsumo: a.impoconsumo + b.impoconsumo,
    total: a.total + b.total,
  };
}

export function sumarMetricas(lista: MetricasLote[]): MetricasLote {
  const r = metricasVacias();
  for (const m of lista) {
    r.aceptadas = sumarImportes(r.aceptadas, m.aceptadas);
    r.revision = sumarImportes(r.revision, m.revision);
    r.manuales = sumarImportes(r.manuales, m.manuales);
    r.errores += m.errores;
    r.duplicadas += m.duplicadas;
    r.clientesNuevos += m.clientesNuevos;
    r.clientesExistentes += m.clientesExistentes;
    for (const [nit, p] of Object.entries(m.proveedores)) {
      const actual = r.proveedores[nit];
      r.proveedores[nit] = actual
        ? { ...sumarImportes(actual, p), nombre: actual.nombre || p.nombre }
        : { ...p };
    }
  }
  return r;
}

export interface Tasas {
  procesadas: number; // facturas distintas: aceptadas + revisión + errores
  correctas: number;
  malLeidas: number;
  pctCorrectas: number;
  pctMalLeidas: number;
  revisadasAMano: number;
  pendientesDeRevision: number;
  /** Lo procesado: aceptadas por la máquina + revisadas a mano. */
  procesado: Importes;
}

/**
 * Leída correctamente = pasó TODAS las validaciones (no se compara con una respuesta).
 * Mal leída = quedó en revisión o dio error. Las duplicadas no cuentan (ya estaban).
 * Las correcciones manuales NO se suman a "correctas": ese porcentaje mide a la máquina.
 */
export function calcularTasas(m: MetricasLote): Tasas {
  const correctas = m.aceptadas.n;
  const malLeidas = m.revision.n + m.errores;
  const procesadas = correctas + malLeidas;
  const pct = (x: number) => (procesadas === 0 ? 0 : Math.round((x / procesadas) * 1000) / 10);
  return {
    procesadas,
    correctas,
    malLeidas,
    pctCorrectas: pct(correctas),
    pctMalLeidas: pct(malLeidas),
    revisadasAMano: m.manuales.n,
    pendientesDeRevision: Math.max(0, malLeidas - m.manuales.n),
    procesado: sumarImportes(m.aceptadas, m.manuales),
  };
}

export function proveedoresOrdenados(m: MetricasLote): (MetricasProveedor & { nit: string })[] {
  return Object.entries(m.proveedores)
    .filter(([, p]) => p.n > 0)
    .map(([nit, p]) => ({ nit, ...p }))
    .sort((a, b) => b.total - a.total);
}

/** Reconstruye las métricas desde una lista de eventos (scripts/recalcular-metricas.ts). */
export function metricasDesdeEventos(eventos: EventoMetrica[]): MetricasLote {
  const r = metricasVacias() as unknown as Record<string, unknown> & MetricasLote;
  for (const e of eventos) {
    const c = cambiosDe(e);
    for (const [ruta, v] of Object.entries(c.incrementos)) {
      const [g, k] = ruta.split(".");
      if (k) (r[g as "aceptadas"] as unknown as Record<string, number>)[k] += v;
      else (r as unknown as Record<string, number>)[g] += v;
    }
    for (const [nit, p] of Object.entries(c.proveedores)) {
      const actual = r.proveedores[nit] ?? { ...importesVacios(), nombre: "" };
      if (p.nombre) actual.nombre = p.nombre;
      for (const [k, v] of Object.entries(p.incrementos)) (actual as unknown as Record<string, number>)[k] += v ?? 0;
      r.proveedores[nit] = actual;
    }
  }
  return r;
}
