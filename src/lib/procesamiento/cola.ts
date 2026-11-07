import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { TERMINADO, type ArchivoCola } from "@/lib/modelo/tipos";
import { refCola } from "./proceso";

/** Arrendamiento: tiempo que un archivo queda reservado mientras alguien lo procesa. */
export const ARRENDAMIENTO_MS = 5 * 60 * 1000;
export const MAX_INTENTOS = 3;

export interface Reclamado extends ArchivoCola {
  id: string;
}

/**
 * Reclama hasta `n` archivos de la cola dentro de UNA transacción. Dos invocaciones
 * concurrentes nunca toman el mismo archivo (la transacción se reintenta si hay conflicto)
 * y los que quedaron "procesando" por una función caída vuelven a estar disponibles cuando
 * caduca su arrendamiento. Una sola condición sobre un solo campo: sin índice compuesto.
 */
export async function reclamar(procesoId: string, n: number): Promise<Reclamado[]> {
  const cola = refCola(procesoId);
  return db().runTransaction(async (tx) => {
    const ahora = Date.now();
    const snap = await tx.get(
      cola.where("disponibleDesde", "<=", ahora).orderBy("disponibleDesde").limit(n),
    );
    const r: Reclamado[] = [];
    for (const d of snap.docs) {
      const datos = d.data() as ArchivoCola;
      tx.update(d.ref, {
        estado: "procesando",
        intentos: FieldValue.increment(1),
        disponibleDesde: ahora + ARRENDAMIENTO_MS,
      });
      r.push({ ...datos, id: d.id, intentos: datos.intentos + 1 });
    }
    return r;
  });
}

/** Devuelve archivos a la cola SIN contarlos como intento (se acabó el tiempo del lote). */
export async function devolver(procesoId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = db().batch();
  for (const id of ids) {
    batch.update(refCola(procesoId).doc(id), {
      estado: "pendiente",
      intentos: FieldValue.increment(-1),
      disponibleDesde: 0,
    });
  }
  await batch.commit();
}

/** Un intento falló pero quedan intentos: vuelve a la cola con el error registrado. */
export async function liberarConError(procesoId: string, id: string, error: string): Promise<void> {
  await refCola(procesoId).doc(id).update({ estado: "pendiente", error, disponibleDesde: 0 });
}

/** Archivos que aún no terminan (esperando o en proceso). count() cuesta ≥ 1 lectura. */
export async function contarPendientes(procesoId: string): Promise<number> {
  const snap = await refCola(procesoId).where("disponibleDesde", "<", TERMINADO).count().get();
  return snap.data().count;
}
