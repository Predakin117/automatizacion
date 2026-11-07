import type { EstadoProceso, MetricasLote } from "./tipos";

/** Lo que la API devuelve de un lote (GET /api/procesos, /api/procesos/[id], /api/metricas). */
export interface ResumenProceso {
  id: string;
  carpeta: string;
  estado: EstadoProceso;
  totalArchivos: number;
  inicio: number | null;
  fin: number | null;
  rutaExcel: string | null;
  metricas: MetricasLote;
}

/** Archivos ya resueltos de un lote (para la barra de avance), leídos de sus contadores. */
export function terminados(p: ResumenProceso): number {
  const m = p.metricas;
  return m.aceptadas.n + m.revision.n + m.errores + m.duplicadas;
}
