/**
 * Tipos de las colecciones de Firestore.
 *
 * Firestore no tiene UNIQUE: la unicidad se consigue usando el valor único como ID del
 * documento y creándolo dentro de una transacción.
 *   clientes/{documento}         → no puede haber dos clientes con el mismo NIT/CC
 *   facturas/{sha256 de imagen}  → el mismo archivo nunca se guarda dos veces
 *   indices_numero/{FE-000123}   → el número de factura es único
 *   procesos/{auto}              → un lote; su cola en procesos/{id}/archivos/{nombreBlob}
 *
 * Importes: pesos COP como ENTEROS (nunca decimales ni texto).
 */
import type { Timestamp } from "firebase-admin/firestore";

export const COLECCIONES = {
  clientes: "clientes",
  facturas: "facturas",
  indicesNumero: "indices_numero",
  procesos: "procesos",
  archivos: "archivos", // subcolección de procesos
} as const;

export interface Cliente {
  documento: string; // sin puntos, guion ni DV
  dv: number | null;
  nombre: string;
  creadoEn: Timestamp;
  primerProcesoId: string;
}

export interface Item {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export type EstadoFactura = "aceptada" | "revision";

export interface Factura {
  numero: string | null;
  fecha: string | null; // emisión, yyyy-mm-dd
  proveedor: string | null;
  nitProveedor: string | null;
  dvProveedor: number | null;
  clienteDocumento: string | null; // null si no pasó el DV
  clienteDocumentoLeido: string | null; // lo que leyó el OCR (aunque no pase el DV)
  clienteDv: number | null;
  clienteNombre: string | null;
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number | null;
  total: number | null;
  estado: EstadoFactura;
  motivos: string[];
  archivo: string; // nombre original
  rutaArchivo: string; // ruta en el bucket de Supabase
  confianzaOcr: number | null;
  /** Grados (horario) que se giró la imagen para leerla (enderezado automático); 0 si venía derecha. */
  rotacionAplicada?: number;
  procesoId: string;
  uid: string;
  creadoEn: Timestamp;
  items: Item[];
  // Fase 9: revisión manual
  corregidaManualmente?: boolean;
  corregidaPor?: string;
  corregidaEn?: Timestamp;
  motivosOriginales?: string[];
  validacionesIgnoradas?: string[];
}

export interface IndiceNumero {
  hashArchivo: string;
}

export type EstadoProceso = "subiendo" | "ejecutando" | "terminado";

/** Importes acumulados de un grupo de facturas. */
export interface Importes {
  n: number;
  subtotal: number;
  iva: number;
  impoconsumo: number;
  total: number;
}

export interface MetricasProveedor extends Importes {
  nombre: string;
}

export interface MetricasLote {
  aceptadas: Importes;
  revision: Importes;
  manuales: Importes;
  errores: number;
  duplicadas: number;
  clientesNuevos: number;
  clientesExistentes: number;
  proveedores: Record<string, MetricasProveedor>; // clave: NIT del proveedor
}

export interface Proceso {
  uid: string;
  carpeta: string;
  estado: EstadoProceso;
  totalArchivos: number;
  inicio: Timestamp;
  fin: Timestamp | null;
  rutaExcel: string | null;
  finalizandoDesde: number | null; // ms de época; bloqueo del cierre
  metricas?: Partial<MetricasLote>;
}

export type EstadoArchivo = "pendiente" | "procesando" | "ok";
export type ResultadoArchivo = "aceptada" | "revision" | "duplicada" | "error";

/**
 * Un elemento de la cola. `disponibleDesde` es un arrendamiento (ms de época):
 * 0 mientras espera, ahora + 5 min mientras alguien lo procesa (caduca solo si la
 * función se cae) y Number.MAX_SAFE_INTEGER cuando terminó. Así la cola se consulta
 * con un solo campo y no hace falta un índice compuesto.
 */
export interface ArchivoCola {
  rutaArchivo: string;
  nombre: string;
  estado: EstadoArchivo;
  resultado: ResultadoArchivo | null;
  clienteNuevo: boolean;
  clienteExistente: boolean;
  hashArchivo: string | null;
  intentos: number;
  error: string | null;
  disponibleDesde: number;
}

export const TERMINADO = Number.MAX_SAFE_INTEGER;
