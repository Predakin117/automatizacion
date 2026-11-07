import { z } from "zod";

/**
 * Formato de lo que envía el formulario de revisión. El servidor NO confía en el navegador:
 * valida el cuerpo con este esquema y repite las reglas de negocio (validar).
 */
const importe = z.number().int().min(0).max(100_000_000_000);

export const EsquemaDatosFactura = z.object({
  numero: z.string().trim().regex(/^FE-\d{6}$/, "El número debe tener la forma FE-000123"),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .refine((f) => !Number.isNaN(Date.parse(`${f}T00:00:00Z`)) && new Date(`${f}T00:00:00Z`).toISOString().startsWith(f), "Fecha inválida"),
  proveedor: z.string().trim().min(3, "Falta la razón social").max(200),
  nitProveedor: z.string().trim().regex(/^\d{5,15}$/, "NIT del proveedor: solo dígitos, sin DV"),
  dvProveedor: z.number().int().min(0).max(9),
  clienteDocumento: z.string().trim().regex(/^\d{5,15}$/, "Documento del cliente: solo dígitos, sin DV"),
  clienteDv: z.number().int().min(0).max(9),
  clienteNombre: z.string().trim().min(3, "Falta el nombre del cliente").max(200),
  items: z
    .array(
      z.object({
        descripcion: z.string().trim().min(1, "Falta la descripción de un ítem").max(300),
        cantidad: z.number().int().min(1).max(100_000),
        precioUnitario: importe,
      }),
    )
    .min(1, "Al menos un ítem")
    .max(100),
  subtotal: importe,
  iva: importe,
  impoconsumo: importe.nullable(),
  total: importe,
});

export const EsquemaCorreccion = z.object({
  datos: EsquemaDatosFactura,
  // "Revisé la imagen y estos datos son los de la factura": permite guardar aunque algo no cuadre.
  confirmarIgnorar: z.boolean().default(false),
});
