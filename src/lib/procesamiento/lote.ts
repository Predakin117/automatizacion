import { createHash } from "node:crypto";
import { descargarArchivo } from "@/lib/almacen";
import { leerFactura } from "@/lib/ocr/leer-factura";
import { MAX_INTENTOS, devolver, liberarConError, reclamar, type Reclamado } from "./cola";
import { guardarFactura, guardarFallo, marcarDuplicada, refFactura } from "./guardar";

/** Archivos por invocación: con ~1,5–5 s por factura caben holgados en el presupuesto. */
export const ARCHIVOS_POR_LOTE = 4;
/** De los 300 s máximos de Vercel Hobby, a los 200 s se devuelven los que falten. */
export const PRESUPUESTO_MS = 200_000;

export interface ResumenLote {
  reclamados: number;
  aceptadas: number;
  revision: number;
  duplicadas: number;
  errores: number;
  reintentos: number;
  devueltos: number;
  ms: number;
  msPorArchivo: number[];
}

function mensaje(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}

async function procesarArchivo(procesoId: string, uid: string, a: Reclamado, r: ResumenLote): Promise<void> {
  let hash: string | null = null;
  try {
    const imagen = await descargarArchivo(a.rutaArchivo);
    hash = createHash("sha256").update(imagen).digest("hex");
    // Atajo previo al OCR: si la imagen ya se guardó, no se gasta CPU (reprocesar pasa de
    // minutos a segundos).
    if ((await refFactura(hash).get()).exists) {
      await marcarDuplicada(procesoId, a.id, hash);
      r.duplicadas++;
      return;
    }
    const leida = await leerFactura(imagen);
    const resultado = await guardarFactura({
      procesoId,
      uid,
      idCola: a.id,
      nombre: a.nombre,
      rutaArchivo: a.rutaArchivo,
      hash,
      parcial: leida.parcial,
      motivos: leida.motivos,
      confianza: leida.confianza,
      rotacion: leida.rotacion,
    });
    if (resultado === "aceptada") r.aceptadas++;
    else if (resultado === "revision") r.revision++;
    else r.duplicadas++;
  } catch (e) {
    // Un error en una imagen NO detiene el lote.
    if (a.intentos < MAX_INTENTOS) {
      await liberarConError(procesoId, a.id, mensaje(e));
      r.reintentos++;
    } else {
      await guardarFallo({ procesoId, uid, idCola: a.id, nombre: a.nombre, rutaArchivo: a.rutaArchivo, hash, error: mensaje(e) });
      r.errores++;
    }
  }
}

/** Una invocación de /lote: reclama hasta 4 archivos y los procesa en serie. */
export async function procesarLote(procesoId: string, uid: string): Promise<ResumenLote> {
  const t0 = Date.now();
  const r: ResumenLote = {
    reclamados: 0, aceptadas: 0, revision: 0, duplicadas: 0, errores: 0,
    reintentos: 0, devueltos: 0, ms: 0, msPorArchivo: [],
  };
  const archivos = await reclamar(procesoId, ARCHIVOS_POR_LOTE);
  r.reclamados = archivos.length;
  for (const [i, a] of archivos.entries()) {
    if (Date.now() - t0 > PRESUPUESTO_MS) {
      const resto = archivos.slice(i).map((x) => x.id);
      await devolver(procesoId, resto);
      r.devueltos = resto.length;
      break;
    }
    const t = Date.now();
    await procesarArchivo(procesoId, uid, a, r);
    r.msPorArchivo.push(Date.now() - t);
  }
  r.ms = Date.now() - t0;
  return r;
}
