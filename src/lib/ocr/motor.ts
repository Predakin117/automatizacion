import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";

/**
 * Motor de OCR (tesseract.js, WASM). Un solo worker por instancia, guardado en globalThis
 * para reutilizarlo entre invocaciones de la misma función caliente (arrancarlo cuesta
 * varios segundos). La imagen llega como Buffer descargado del almacén, nunca del disco.
 */

// Datos del idioma desde el paquete npm: sin descargas de red. Son .traineddata.gz.
const RUTA_IDIOMA = path.join(process.cwd(), "node_modules/@tesseract.js-data/spa/4.0.0_best_int");

const TOPE_ARRANQUE_MS = 60_000;
const TOPE_LECTURA_MS = 60_000;

export type ModoLectura = "original" | "preprocesado" | "encabezado";

export interface Lectura {
  texto: string;
  confianza: number; // 0–100
}

const global = globalThis as unknown as { __workerOcr?: Promise<Worker> };

/**
 * El worker corre en un hilo aparte: si no puede cargar un archivo, el hilo muere en
 * silencio y la promesa NUNCA se resuelve. Sin tope, la función se colgaría hasta el
 * límite de Vercel (504). Con tope falla con un mensaje claro y el lote reintenta.
 */
function conTope<T>(promesa: Promise<T>, ms: number, que: string): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const tope = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error(`OCR: ${que} superó ${ms / 1000} s`)), ms);
  });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(temporizador));
}

function obtenerWorker(): Promise<Worker> {
  if (!global.__workerOcr) {
    global.__workerOcr = conTope(
      createWorker("spa", 1, {
        langPath: RUTA_IDIOMA,
        gzip: true,
        cachePath: os.tmpdir(), // en Vercel solo /tmp es escribible
        cacheMethod: "none",
      }),
      TOPE_ARRANQUE_MS,
      "arrancar el worker",
    );
    // Si el arranque falla, se olvida para que el próximo intento cree uno nuevo.
    global.__workerOcr.catch(() => descartarWorker());
  }
  return global.__workerOcr;
}

function descartarWorker(): void {
  const actual = global.__workerOcr;
  global.__workerOcr = undefined;
  actual?.then((w) => w.terminate()).catch(() => undefined);
}

/** Prepara la imagen según el modo. */
export async function prepararImagen(imagen: Buffer, modo: ModoLectura): Promise<Buffer> {
  if (modo === "original") return imagen;
  if (modo === "preprocesado") {
    const meta = await sharp(imagen).metadata();
    const ancho = Math.round((meta.width ?? 1000) * 1.5);
    return sharp(imagen)
      .rotate() // respeta la orientación EXIF
      .grayscale()
      .normalize()
      .resize({ width: ancho })
      .sharpen()
      .png()
      .toBuffer();
  }
  // Encabezado: franja superior del 30 % INVERTIDA. Recupera el texto blanco sobre fondo de
  // color (proveedor y NIT de uno de los diseños), que tesseract no lee tal cual.
  const girada = await sharp(imagen).rotate().toBuffer();
  const meta = await sharp(girada).metadata();
  const ancho = meta.width ?? 1000;
  const alto = meta.height ?? 1000;
  return sharp(girada)
    .extract({ left: 0, top: 0, width: ancho, height: Math.max(1, Math.round(alto * 0.3)) })
    .grayscale()
    .negate({ alpha: false })
    .normalize()
    .resize({ width: Math.round(ancho * 1.5) })
    .png()
    .toBuffer();
}

export async function leerImagen(imagen: Buffer, modo: ModoLectura = "original"): Promise<Lectura> {
  const preparada = await prepararImagen(imagen, modo);
  const worker = await obtenerWorker();
  try {
    const r = await conTope(worker.recognize(preparada), TOPE_LECTURA_MS, `leer (${modo})`);
    return { texto: r.data.text ?? "", confianza: Math.round(r.data.confidence ?? 0) };
  } catch (e) {
    // Un worker que se colgó no sirve: se descarta y el siguiente intento arranca otro.
    descartarWorker();
    throw e;
  }
}

/** Para scripts: libera el worker y deja terminar el proceso. */
export async function cerrarMotor(): Promise<void> {
  const actual = global.__workerOcr;
  global.__workerOcr = undefined;
  if (actual) await (await actual).terminate();
}
