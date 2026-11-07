import sharp from "sharp";
import { extraer } from "./extractor";
import { leerImagen, type ModoLectura } from "./motor";
import { ROTACIONES, mejorLectura, pareceGirada, type Rotacion } from "./orientacion";
import type { ParcialFactura } from "./tipos";
import { validar } from "./validador";

export interface FacturaLeida {
  parcial: ParcialFactura;
  motivos: string[];
  confianza: number;
  modo: ModoLectura | "combinado";
  lecturas: number;
  /** Grados (horario) que se giró la imagen para leerla; 0 si venía derecha. */
  rotacion: Rotacion;
}

interface Intento {
  texto: string;
  confianza: number;
  parcial: ParcialFactura;
  motivos: string[];
  modo: FacturaLeida["modo"];
}

function intentar(texto: string, confianza: number, modo: FacturaLeida["modo"]): Intento {
  const parcial = extraer(texto);
  return { texto, confianza, parcial, motivos: validar(parcial), modo };
}

/** Endereza: primero la orientación EXIF y luego el giro pedido. */
export function girar(imagen: Buffer, grados: number): Promise<Buffer> {
  return sharp(imagen, { autoOrient: true }).rotate(grados).png().toBuffer();
}

/**
 * Estrategia de lectura:
 *  0. original → extraer → validar. Si el texto salió ILEGIBLE (casi ningún campo clave, como
 *     pasa con una imagen girada), se prueban giros de 90°, 270° y 180° y se sigue con la
 *     orientación que mejor se lea. Las imágenes derechas no pagan este costo.
 *  1. Si no hay motivos, listo (la mayoría acaba aquí).
 *  2. preprocesado (sharp: grises, normalizar, ampliar, enfocar); se queda el mejor.
 *  3. encabezado invertido: su texto se ANTEPONE al mejor (recupera el texto blanco sobre
 *     fondo de color: proveedor y NIT de uno de los diseños) y se vuelve a elegir.
 * Lo que siga fallando queda en revisión: una persona lo resolverá (Fase 9).
 */
export async function leerFactura(imagen: Buffer): Promise<FacturaLeida> {
  const original = await leerImagen(imagen, "original");
  let elegido = intentar(original.texto, original.confianza, "original");
  let lecturas = 1;
  let base = imagen;
  let rotacion: Rotacion = 0;

  if (pareceGirada(elegido.parcial)) {
    for (const grados of ROTACIONES) {
      const girada = await girar(imagen, grados);
      const l = await leerImagen(girada, "original");
      lecturas++;
      const intento = intentar(l.texto, l.confianza, "original");
      if (mejorLectura(elegido, intento) === intento) {
        elegido = intento;
        base = girada;
        rotacion = grados;
      }
      if (!pareceGirada(elegido.parcial)) break; // ya se lee: no hace falta probar más giros
    }
  }

  if (elegido.motivos.length > 0) {
    const pre = await leerImagen(base, "preprocesado");
    lecturas++;
    elegido = mejorLectura(elegido, intentar(pre.texto, pre.confianza, "preprocesado"));
  }
  if (elegido.motivos.length > 0) {
    const enc = await leerImagen(base, "encabezado");
    lecturas++;
    elegido = mejorLectura(elegido, intentar(`${enc.texto}\n${elegido.texto}`, elegido.confianza, "combinado"));
  }
  return {
    parcial: elegido.parcial,
    motivos: elegido.motivos,
    confianza: elegido.confianza,
    modo: elegido.modo,
    lecturas,
    rotacion,
  };
}
