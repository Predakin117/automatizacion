import sharp from "sharp";

/**
 * Validación de imágenes POR SUS BYTES. No se confía en el nombre ni en el content-type que
 * declara el navegador: un archivo "factura.png" puede ser cualquier cosa.
 */

export const TAMANO_MAXIMO = 4 * 1024 * 1024; // 4 MB (Vercel corta las peticiones de más de 4,5 MB)
export const PIXELES_MAXIMOS = 40_000_000; // evita "bombas" de descompresión

export type TipoImagen = "png" | "jpg";

/** Tipo real según la firma de los primeros bytes. */
export function tipoPorFirma(bytes: Uint8Array): TipoImagen | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

export const TIPO_MIME: Record<TipoImagen, string> = { png: "image/png", jpg: "image/jpeg" };

export type ResultadoValidacion =
  | { ok: true; tipo: TipoImagen; ancho: number; alto: number }
  | { ok: false; estado: 413 | 415; motivo: string };

/** Tamaño → firma → que se pueda decodificar y no sea gigantesca. */
export async function validarImagen(bytes: Buffer): Promise<ResultadoValidacion> {
  if (bytes.length === 0) return { ok: false, estado: 415, motivo: "El archivo está vacío" };
  if (bytes.length > TAMANO_MAXIMO) return { ok: false, estado: 413, motivo: "La imagen pasa de 4 MB" };
  const tipo = tipoPorFirma(bytes);
  if (!tipo) return { ok: false, estado: 415, motivo: "No es una imagen PNG o JPEG (según sus bytes)" };
  try {
    // limitInputPixels: sharp se niega a decodificar imágenes con demasiados píxeles.
    const meta = await sharp(bytes, { limitInputPixels: PIXELES_MAXIMOS }).metadata();
    const ancho = meta.width ?? 0;
    const alto = meta.height ?? 0;
    if (ancho * alto > PIXELES_MAXIMOS) return { ok: false, estado: 413, motivo: "La imagen tiene demasiados píxeles" };
    // metadata() solo lee la cabecera: decodificar de verdad detecta archivos dañados.
    await sharp(bytes, { limitInputPixels: PIXELES_MAXIMOS }).resize(8).raw().toBuffer();
    return { ok: true, tipo, ancho, alto };
  } catch {
    return { ok: false, estado: 415, motivo: "La imagen está dañada o no se puede leer" };
  }
}
