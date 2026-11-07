/**
 * Tarifas tributarias parametrizadas (verifícalas con un contador; pueden cambiar).
 * - IVA general: 19 %.
 * - Impuesto nacional al consumo (INC, "impoconsumo") en telefonía y datos móviles: 4 %,
 *   sobre el valor SIN IVA; convive con el IVA: total = subtotal + IVA + impoconsumo.
 *   (Simplificación del generador: 4 % sobre todo el servicio.)
 */
export const TARIFA_IVA = 0.19;
export const TARIFA_IMPOCONSUMO = 0.04;
/** Tolerancia de redondeo, en pesos. */
export const TOLERANCIA = 1;
/** Mínimo de letras para que una razón social se considere legible. */
export const MIN_LETRAS_RAZON_SOCIAL = 6;
