/**
 * Nombres de archivo en el almacén. Funciones puras (se usan en servidor y en el navegador).
 *   procesos/<idLote>/<NNNN>-<nombre limpio>.<ext del tipo REAL>
 * El índice NNNN hace únicos los nombres dentro del lote aunque dos archivos se llamen igual.
 */

export const EXTENSIONES_IMAGEN = /\.(png|jpe?g)$/i;

export function esImagen(nombre: string): boolean {
  return EXTENSIONES_IMAGEN.test(nombre);
}

/** Quita tildes, espacios y caracteres raros: solo [a-z0-9._-]. */
export function nombreLimpio(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? nombre;
  const limpio = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.[^.]+$/, "") // la extensión se pone según el tipo REAL
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return limpio || "archivo";
}

export function rutaImagen(idLote: string, indice: number, nombre: string, extension: "png" | "jpg"): string {
  return `procesos/${idLote}/${String(indice).padStart(4, "0")}-${nombreLimpio(nombre)}.${extension}`;
}

export function carpetaLote(idLote: string): string {
  return `procesos/${idLote}`;
}

/** ID del documento de la cola: el nombre del archivo (Firestore no admite "/" en un ID). */
export function idEnCola(ruta: string): string {
  return ruta.split("/").pop() ?? ruta;
}
