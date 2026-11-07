import { MIN_LETRAS_RAZON_SOCIAL, TARIFA_IMPOCONSUMO, TARIFA_IVA, TOLERANCIA } from "./constantes";
import { dvValido } from "./nit";
import type { ParcialFactura } from "./tipos";

/**
 * validar(parcial) → motivos de revisión. Vacía = la factura es aceptable.
 * "Aceptable" significa que pasó TODAS las reglas, no que sea correcta: un error que cuadre
 * aritméticamente (un dígito mal leído en el número de factura) puede pasar.
 * La misma función la usa el formulario de revisión manual (Fase 9) en el navegador.
 */
export function validar(p: ParcialFactura): string[] {
  const motivos: string[] = [];
  const cerca = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA;

  if (!p.numero) motivos.push("No se leyó el número de factura");
  if (!p.fecha) motivos.push("No se leyó la fecha de emisión");
  const letras = (p.proveedor?.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) ?? []).length;
  if (!p.proveedor || letras < MIN_LETRAS_RAZON_SOCIAL) motivos.push("No se leyó la razón social del proveedor");

  if (!p.nitProveedor) motivos.push("No se leyó el NIT del proveedor");
  else if (!dvValido(p.nitProveedor, p.dvProveedor)) {
    motivos.push("El dígito de verificación del NIT del proveedor no es válido");
  }
  // El cliente se identifica por DOCUMENTO, nunca por nombre (el OCR altera los nombres).
  if (!p.clienteDocumento) motivos.push("No se leyó el documento del cliente");
  else if (!dvValido(p.clienteDocumento, p.clienteDv)) {
    motivos.push("El dígito de verificación del documento del cliente no es válido");
  }

  if (p.subtotal === null) motivos.push("No se leyó el valor antes de IVA");
  if (p.iva === null) motivos.push("No se leyó el IVA");
  if (p.total === null) motivos.push("No se leyó el total");

  if (p.items.length === 0) motivos.push("No se leyó ningún ítem");
  let itemsCompletos = p.items.length > 0;
  p.items.forEach((it, i) => {
    if (it.cantidad === null || it.precioUnitario === null || it.subtotal === null) {
      itemsCompletos = false;
      motivos.push(`El ítem ${i + 1} no se leyó completo`);
    } else if (it.cantidad * it.precioUnitario !== it.subtotal) {
      motivos.push(`Ítem ${i + 1}: cantidad × precio no da el subtotal`);
    }
  });
  if (itemsCompletos && p.subtotal !== null) {
    const suma = p.items.reduce((a, it) => a + (it.subtotal ?? 0), 0);
    if (suma !== p.subtotal) motivos.push("Los ítems no suman el valor antes de IVA");
  }

  if (p.subtotal !== null && p.iva !== null && !cerca(p.iva, Math.round(p.subtotal * TARIFA_IVA))) {
    motivos.push("El IVA no es el 19 % del valor antes de IVA");
  }
  if (p.subtotal !== null && p.impoconsumo !== null && !cerca(p.impoconsumo, Math.round(p.subtotal * TARIFA_IMPOCONSUMO))) {
    motivos.push("El impoconsumo no es el 4 % del valor antes de IVA");
  }
  if (p.subtotal !== null && p.iva !== null && p.total !== null) {
    const suma = p.subtotal + p.iva + (p.impoconsumo ?? 0);
    if (!cerca(suma, p.total)) {
      motivos.push(
        p.impoconsumo === null && p.mencionaImpoconsumo
          ? "La factura menciona impoconsumo pero no se pudo leer su valor"
          : "El total no cuadra (valor antes de IVA + IVA + impoconsumo)",
      );
    }
  }
  return motivos;
}
