import { db } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";
import { normalizarMetricas } from "./metricas";

export function refProceso(id: string) {
  return db().collection(COLECCIONES.procesos).doc(id);
}

export function refCola(id: string) {
  return refProceso(id).collection(COLECCIONES.archivos);
}

/** El lote si existe Y es del usuario; si no, null (la ruta responde 404: no se revela que existe). */
export async function procesoDelUsuario(id: string, uid: string): Promise<(Proceso & { id: string }) | null> {
  if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return null;
  const snap = await refProceso(id).get();
  if (!snap.exists) return null;
  const datos = snap.data() as Proceso;
  return datos.uid === uid ? { id, ...datos } : null;
}

export function noEncontrado(): Response {
  return Response.json({ error: "No existe." }, { status: 404 });
}

/** Resumen de un lote para la interfaz (sin datos internos). */
export function resumenProceso(id: string, p: Proceso) {
  return {
    id,
    carpeta: p.carpeta,
    estado: p.estado,
    totalArchivos: p.totalArchivos,
    inicio: p.inicio?.toMillis?.() ?? null,
    fin: p.fin?.toMillis?.() ?? null,
    rutaExcel: p.rutaExcel,
    metricas: normalizarMetricas(p.metricas),
  };
}
