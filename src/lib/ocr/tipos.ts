/** Lo que el extractor obtiene del texto del OCR. Lo que no encuentra queda en null: nunca se inventa. */
export interface ItemLeido {
  descripcion: string;
  cantidad: number | null;
  precioUnitario: number | null;
  subtotal: number | null;
}

export interface ParcialFactura {
  numero: string | null;
  fecha: string | null; // emisión, yyyy-mm-dd
  proveedor: string | null;
  nitProveedor: string | null;
  dvProveedor: number | null;
  clienteDocumento: string | null;
  clienteDv: number | null;
  clienteNombre: string | null;
  items: ItemLeido[];
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number | null;
  mencionaImpoconsumo: boolean;
  total: number | null;
}
