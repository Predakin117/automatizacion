import { TARIFA_IMPOCONSUMO, TARIFA_IVA } from "@/lib/ocr/constantes";
import type { ParcialFactura } from "@/lib/ocr/tipos";
import { validar } from "@/lib/ocr/validador";

/**
 * Revisión manual (Fase 9): funciones PURAS compartidas por el formulario (navegador) y el
 * servidor. Las dos partes usan la MISMA validación que el OCR (validar, Fase 4).
 */

export interface ItemManual {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

export interface DatosFactura {
  numero: string;
  fecha: string; // yyyy-mm-dd
  proveedor: string;
  nitProveedor: string;
  dvProveedor: number;
  clienteDocumento: string;
  clienteDv: number;
  clienteNombre: string;
  items: ItemManual[];
  subtotal: number;
  iva: number;
  impoconsumo: number | null; // null = la factura no lleva impoconsumo
  total: number;
}

export function aParcial(d: DatosFactura): ParcialFactura {
  return {
    numero: d.numero || null,
    fecha: d.fecha || null,
    proveedor: d.proveedor || null,
    nitProveedor: d.nitProveedor || null,
    dvProveedor: d.dvProveedor,
    clienteDocumento: d.clienteDocumento || null,
    clienteDv: d.clienteDv,
    clienteNombre: d.clienteNombre || null,
    items: d.items.map((it) => ({ ...it, subtotal: it.cantidad * it.precioUnitario })),
    subtotal: d.subtotal,
    iva: d.iva,
    impoconsumo: d.impoconsumo,
    mencionaImpoconsumo: d.impoconsumo !== null,
    total: d.total,
  };
}

/** Totales propuestos desde los ítems: IVA 19 %, impoconsumo 4 % solo si la factura lo trae. */
export function proponerTotales(items: ItemManual[], conImpoconsumo: boolean) {
  const subtotal = items.reduce((a, it) => a + it.cantidad * it.precioUnitario, 0);
  const iva = Math.round(subtotal * TARIFA_IVA);
  const impoconsumo = conImpoconsumo ? Math.round(subtotal * TARIFA_IMPOCONSUMO) : null;
  return { subtotal, iva, impoconsumo, total: subtotal + iva + (impoconsumo ?? 0) };
}

/**
 * Motivos que NO se pueden ignorar: el dígito de verificación. El cliente se identifica por su
 * documento; con un DV inválido no se podría crear (ni se sabría cuál es): hay que corregirlo.
 */
export function esBloqueante(motivo: string): boolean {
  return motivo.includes("dígito de verificación");
}

export interface Revision {
  motivos: string[];
  bloqueantes: string[];
  ignorables: string[];
}

export function revisar(d: DatosFactura): Revision {
  const motivos = validar(aParcial(d));
  return {
    motivos,
    bloqueantes: motivos.filter(esBloqueante),
    ignorables: motivos.filter((m) => !esBloqueante(m)),
  };
}
