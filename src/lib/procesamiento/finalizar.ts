import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { subirArchivo } from "@/lib/almacen";
import { TIPO_XLSX, generarExcel, nombreExcel } from "@/lib/excel/generar";
import type { Proceso } from "@/lib/modelo/tipos";
import { contarPendientes } from "./cola";
import { refProceso } from "./proceso";

const BLOQUEO_CIERRE_MS = 2 * 60 * 1000;

export type ResultadoFinalizar =
  | { listo: true; rutaExcel: string | null }
  | { listo: false; pendientes: number; cerrando?: boolean };

/** Genera el Excel desde la base, lo sube al almacén y guarda su ruta. */
export async function escribirExcel(procesoId: string, proceso: Proceso): Promise<string> {
  const { buffer } = await generarExcel(procesoId, proceso);
  const ruta = nombreExcel(procesoId);
  await subirArchivo(ruta, buffer, TIPO_XLSX, { sobrescribir: true });
  return ruta;
}

/**
 * Cierra el lote. Idempotente: si quedan archivos sin terminar responde listo: false; si
 * dos clientes llaman a la vez, solo uno "toma el cierre" (bloqueo de 2 min) y genera el Excel.
 */
export async function finalizarProceso(procesoId: string): Promise<ResultadoFinalizar> {
  const pendientes = await contarPendientes(procesoId);
  if (pendientes > 0) return { listo: false, pendientes };

  const ref = refProceso(procesoId);
  const toma = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const p = snap.data() as Proceso;
    if (p.estado === "terminado") return { yaTerminado: true as const, rutaExcel: p.rutaExcel };
    if (p.finalizandoDesde && Date.now() - p.finalizandoDesde < BLOQUEO_CIERRE_MS) return { ocupado: true as const };
    tx.update(ref, { finalizandoDesde: Date.now() });
    return { tomado: true as const };
  });
  if ("yaTerminado" in toma) return { listo: true, rutaExcel: toma.rutaExcel ?? null };
  if ("ocupado" in toma) return { listo: false, pendientes: 0, cerrando: true };

  try {
    // Se vuelve a leer: las métricas del Resumen deben ser las finales.
    const proceso = (await ref.get()).data() as Proceso;
    const rutaExcel = await escribirExcel(procesoId, proceso);
    await ref.update({ estado: "terminado", fin: Timestamp.now(), rutaExcel, finalizandoDesde: null });
    return { listo: true, rutaExcel };
  } catch (e) {
    await ref.update({ finalizandoDesde: null }); // otro intento podrá cerrar
    throw e;
  }
}
