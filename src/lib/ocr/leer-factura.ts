import { extraer } from "./extractor";
import { leerImagen, type ModoLectura } from "./motor";
import type { ParcialFactura } from "./tipos";
import { validar } from "./validador";

export interface FacturaLeida {
  parcial: ParcialFactura;
  motivos: string[];
  confianza: number;
  modo: ModoLectura | "combinado";
  lecturas: number;
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

/** Gana el intento con MENOS motivos de revisión (a igualdad, el primero). */
function mejor(a: Intento, b: Intento): Intento {
  return b.motivos.length < a.motivos.length ? b : a;
}

/**
 * Estrategia de lectura:
 *  1. original → extraer → validar. Si no hay motivos, listo (la mayoría acaba aquí).
 *  2. preprocesado (sharp: grises, normalizar, ampliar, enfocar); se queda el mejor.
 *  3. encabezado invertido: su texto se ANTEPONE al mejor (recupera el texto blanco sobre
 *     fondo de color: proveedor y NIT de uno de los diseños) y se vuelve a elegir.
 * Lo que siga fallando queda en revisión: una persona lo resolverá (Fase 9).
 */
export async function leerFactura(imagen: Buffer): Promise<FacturaLeida> {
  const original = await leerImagen(imagen, "original");
  let elegido = intentar(original.texto, original.confianza, "original");
  let lecturas = 1;

  if (elegido.motivos.length > 0) {
    const pre = await leerImagen(imagen, "preprocesado");
    lecturas++;
    elegido = mejor(elegido, intentar(pre.texto, pre.confianza, "preprocesado"));
  }
  if (elegido.motivos.length > 0) {
    const enc = await leerImagen(imagen, "encabezado");
    lecturas++;
    elegido = mejor(elegido, intentar(`${enc.texto}\n${elegido.texto}`, elegido.confianza, "combinado"));
  }
  return {
    parcial: elegido.parcial,
    motivos: elegido.motivos,
    confianza: elegido.confianza,
    modo: elegido.modo,
    lecturas,
  };
}
