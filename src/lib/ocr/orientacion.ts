import type { ParcialFactura } from "./tipos";

/**
 * Facturas fotografiadas o escaneadas de lado o al revés: tesseract no lee texto girado y
 * devuelve basura. Funciones PURAS para decidir cuándo probar giros y cuál lectura gana.
 * Decisión del estudiante (2026-11-07): una factura girada se endereza automáticamente y, si
 * todo cuadra, queda ACEPTADA (a revisión van las que de verdad necesitan a una persona,
 * como las borrosas). Esto se aparta del criterio de la guía, que mandaba las giradas a revisión.
 */

/** Giros a probar (grados, sentido horario). 90 y 270 primero: son los casos más comunes. */
export const ROTACIONES = [90, 270, 180] as const;
export type Rotacion = 0 | (typeof ROTACIONES)[number];

const CAMPOS_CLAVE = ["numero", "fecha", "nitProveedor", "subtotal", "total"] as const;

/** Cuántos campos clave se leyeron (0–5). */
export function camposLeidos(p: ParcialFactura): number {
  return CAMPOS_CLAVE.filter((c) => p[c] !== null).length;
}

/**
 * ¿El texto salió ilegible, como pasa con una imagen girada? Una factura derecha, aunque esté
 * borrosa, casi siempre deja leer 2 o más campos clave; girada, ninguno o uno por casualidad.
 * Así los giros (3 lecturas más) solo se prueban cuando hace falta.
 */
export function pareceGirada(p: ParcialFactura): boolean {
  return camposLeidos(p) <= 1;
}

export interface LecturaComparable {
  motivos: string[];
  parcial: ParcialFactura;
  confianza: number;
}

/** Gana la lectura con menos motivos; a igualdad, la de más campos leídos; luego, más confianza. */
export function mejorLectura<T extends LecturaComparable>(a: T, b: T): T {
  if (b.motivos.length !== a.motivos.length) return b.motivos.length < a.motivos.length ? b : a;
  const ca = camposLeidos(a.parcial);
  const cb = camposLeidos(b.parcial);
  if (ca !== cb) return cb > ca ? b : a;
  return b.confianza > a.confianza ? b : a;
}
