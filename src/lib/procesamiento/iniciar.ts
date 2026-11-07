import { db } from "@/lib/firebase/admin";
import { listarCarpeta } from "@/lib/almacen";
import type { ArchivoCola } from "@/lib/modelo/tipos";
import { carpetaLote, esImagen, idEnCola } from "@/lib/rutas";
import { refCola, refProceso } from "./proceso";

const YA_EXISTE = 6; // código gRPC ALREADY_EXISTS

/**
 * Crea la cola del lote: un documento por imagen del almacén. El ID sale del nombre del
 * archivo y se usa create(): repetir la llamada NO duplica (los que ya existen se ignoran).
 * No depende de ningún aviso del almacén: lista lo que realmente se subió.
 */
export async function iniciarProceso(procesoId: string): Promise<{ archivos: number; nuevos: number }> {
  const rutas = (await listarCarpeta(carpetaLote(procesoId))).filter(esImagen);
  const cola = refCola(procesoId);
  let nuevos = 0;
  // BulkWriter agrupa y reintenta escrituras (un batch admite solo 500 operaciones).
  const escritor = db().bulkWriter();
  escritor.onWriteError((e) => e.code !== YA_EXISTE && e.failedAttempts < 3);
  const promesas = rutas.map((ruta) => {
    const doc: ArchivoCola = {
      rutaArchivo: ruta,
      nombre: ruta.split("/").pop()!.replace(/^\d{4}-/, ""),
      estado: "pendiente",
      resultado: null,
      clienteNuevo: false,
      clienteExistente: false,
      hashArchivo: null,
      intentos: 0,
      error: null,
      disponibleDesde: 0,
    };
    return escritor
      .create(cola.doc(idEnCola(ruta)), doc)
      .then(() => nuevos++)
      .catch((e: { code?: number }) => {
        if (e.code !== YA_EXISTE) throw e; // ya estaba en la cola: idempotente
      });
  });
  await escritor.close();
  await Promise.all(promesas);
  await refProceso(procesoId).update({ estado: "ejecutando", totalArchivos: rutas.length });
  return { archivos: rutas.length, nuevos };
}
