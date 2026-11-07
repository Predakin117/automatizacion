/**
 * Dígito de verificación (DV) del NIT, algoritmo de la DIAN.
 * Pesos aplicados a los dígitos de DERECHA a IZQUIERDA; r = suma mod 11; dv = r > 1 ? 11 − r : r.
 * Detecta cerca del 98 % de los errores de un dígito, NO todos: no es una garantía.
 */
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function calcularDv(numero: string): number | null {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length === 0 || digitos.length > PESOS.length) return null;
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    suma += Number(digitos[digitos.length - 1 - i]) * PESOS[i];
  }
  const r = suma % 11;
  return r > 1 ? 11 - r : r;
}

export function dvValido(numero: string | null, dv: number | null): boolean {
  if (!numero || dv === null) return false;
  return calcularDv(numero) === dv;
}
