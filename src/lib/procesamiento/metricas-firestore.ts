import { FieldValue, type DocumentReference, type Transaction, type WriteBatch } from "firebase-admin/firestore";
import type { Cambios } from "./metricas";

/**
 * Aplica los cambios de métricas al documento del lote con FieldValue.increment.
 * Es una escritura CIEGA (no lee el documento): no provoca reintentos por contención entre
 * lotes concurrentes. Se llama dentro de la misma transacción (o batch) que guarda la
 * factura: si la transacción falla, tampoco se cuentan.
 * Se usa set(..., { merge: true }) con objetos anidados: el NIT (clave numérica) va como
 * clave de un mapa y no hace falta escaparlo en una ruta con puntos.
 */
export function aplicarMetricas(
  escritor: Transaction | WriteBatch,
  procesoRef: DocumentReference,
  cambios: Cambios,
): void {
  const metricas: Record<string, unknown> = {};
  for (const [ruta, valor] of Object.entries(cambios.incrementos)) {
    const [grupo, campo] = ruta.split(".");
    if (campo) {
      const g = (metricas[grupo] ??= {}) as Record<string, unknown>;
      g[campo] = FieldValue.increment(valor);
    } else {
      metricas[grupo] = FieldValue.increment(valor);
    }
  }
  const proveedores: Record<string, Record<string, unknown>> = {};
  for (const [nit, p] of Object.entries(cambios.proveedores)) {
    const datos: Record<string, unknown> = {};
    if (p.nombre) datos.nombre = p.nombre;
    for (const [k, v] of Object.entries(p.incrementos)) if (v) datos[k] = FieldValue.increment(v);
    if (Object.keys(datos).length > 0) proveedores[nit] = datos;
  }
  if (Object.keys(proveedores).length > 0) metricas.proveedores = proveedores;
  if (Object.keys(metricas).length === 0) return;
  // Transaction.set y WriteBatch.set tienen la misma forma; TypeScript no une las firmas.
  (escritor as WriteBatch).set(procesoRef, { metricas }, { merge: true });
}
