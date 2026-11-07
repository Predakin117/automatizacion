import ExcelJS from "exceljs";
import { db } from "@/lib/firebase/admin";
import { COLECCIONES, type ArchivoCola, type Cliente, type Factura, type Proceso } from "@/lib/modelo/tipos";
import { normalizarMetricas } from "@/lib/procesamiento/metricas";
import { refCola } from "@/lib/procesamiento/proceso";

/**
 * Excel de un lote, generado DESDE LA BASE DE DATOS (no de la memoria): muestra exactamente
 * lo guardado. Importes como NÚMEROS con formato de moneda (nunca texto) y fechas como fechas.
 * Con ~1000 filas el modo normal de exceljs basta (no hace falta streaming).
 */

const MONEDA = '"$"#,##0';

function fechaExcel(iso: string | null): Date | null {
  return iso ? new Date(`${iso}T00:00:00Z`) : null;
}

function encabezado(hoja: ExcelJS.Worksheet): void {
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnCount } };
}

export interface DatosExcel {
  facturas: (Factura & { hash: string })[];
  buffer: Buffer;
}

export async function generarExcel(procesoId: string, proceso: Proceso): Promise<DatosExcel> {
  // 1. La cola → hashes distintos (incluye las "duplicadas" de un reproceso: así el Excel de un
  //    reproceso no sale vacío).
  const cola = await refCola(procesoId).get();
  const archivos = cola.docs.map((d) => d.data() as ArchivoCola);
  const hashes = [...new Set(archivos.map((a) => a.hashArchivo).filter((h): h is string => !!h))];

  const facturasRef = db().collection(COLECCIONES.facturas);
  const facturas: (Factura & { hash: string })[] = [];
  for (let i = 0; i < hashes.length; i += 300) {
    const docs = await db().getAll(...hashes.slice(i, i + 300).map((h) => facturasRef.doc(h)));
    for (const d of docs) if (d.exists) facturas.push({ ...(d.data() as Factura), hash: d.id });
  }
  facturas.sort((a, b) => a.archivo.localeCompare(b.archivo));

  const documentos = [...new Set(facturas.map((f) => f.clienteDocumento).filter((x): x is string => !!x))];
  const clientes = new Map<string, Cliente>();
  const clientesRef = db().collection(COLECCIONES.clientes);
  for (let i = 0; i < documentos.length; i += 300) {
    const docs = await db().getAll(...documentos.slice(i, i + 300).map((c) => clientesRef.doc(c)));
    for (const d of docs) if (d.exists) clientes.set(d.id, d.data() as Cliente);
  }

  const libro = new ExcelJS.Workbook();
  libro.creator = "Procesador de facturas";

  // ── Facturas ──
  const hf = libro.addWorksheet("Facturas");
  hf.columns = [
    { header: "Archivo", key: "archivo", width: 26 },
    { header: "Número", key: "numero", width: 12 },
    { header: "Fecha", key: "fecha", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: "Proveedor", key: "proveedor", width: 38 },
    { header: "NIT proveedor", key: "nit", width: 14 },
    { header: "Documento cliente", key: "doc", width: 16 },
    { header: "Cliente", key: "cliente", width: 36 },
    { header: "Valor antes de IVA", key: "subtotal", width: 16, style: { numFmt: MONEDA } },
    { header: "IVA", key: "iva", width: 14, style: { numFmt: MONEDA } },
    { header: "Impoconsumo", key: "impoconsumo", width: 14, style: { numFmt: MONEDA } },
    { header: "Total", key: "total", width: 16, style: { numFmt: MONEDA } },
    { header: "Estado", key: "estado", width: 11 },
    { header: "Motivos", key: "motivos", width: 60 },
    { header: "Confianza OCR", key: "confianza", width: 10 },
  ];
  for (const f of facturas) {
    hf.addRow({
      archivo: f.archivo,
      numero: f.numero,
      fecha: fechaExcel(f.fecha),
      proveedor: f.proveedor,
      nit: f.nitProveedor,
      doc: f.clienteDocumento,
      cliente: f.clienteNombre,
      subtotal: f.subtotal,
      iva: f.iva,
      impoconsumo: f.impoconsumo,
      total: f.total,
      estado: f.corregidaManualmente ? "aceptada (manual)" : f.estado,
      motivos: (f.motivos ?? []).join("; "),
      confianza: f.confianzaOcr,
    });
  }
  encabezado(hf);

  // ── Ítems ──
  const hi = libro.addWorksheet("Ítems");
  hi.columns = [
    { header: "Número de factura", key: "numero", width: 14 },
    { header: "Descripción", key: "descripcion", width: 60 },
    { header: "Cantidad", key: "cantidad", width: 10 },
    { header: "Precio unitario", key: "precio", width: 16, style: { numFmt: MONEDA } },
    { header: "Subtotal", key: "subtotal", width: 16, style: { numFmt: MONEDA } },
  ];
  for (const f of facturas) {
    for (const it of f.items ?? []) {
      hi.addRow({ numero: f.numero ?? f.archivo, descripcion: it.descripcion, cantidad: it.cantidad, precio: it.precioUnitario, subtotal: it.subtotal });
    }
  }
  encabezado(hi);

  // ── Clientes ──
  const hc = libro.addWorksheet("Clientes");
  hc.columns = [
    { header: "Documento", key: "documento", width: 14 },
    { header: "Nombre", key: "nombre", width: 40 },
    { header: "Facturas", key: "n", width: 10 },
    { header: "Total comprado", key: "total", width: 18, style: { numFmt: MONEDA } },
  ];
  const porCliente = new Map<string, { n: number; total: number }>();
  for (const f of facturas) {
    if (!f.clienteDocumento || f.estado !== "aceptada") continue;
    const c = porCliente.get(f.clienteDocumento) ?? { n: 0, total: 0 };
    c.n++;
    c.total += f.total ?? 0;
    porCliente.set(f.clienteDocumento, c);
  }
  for (const [documento, c] of porCliente) {
    hc.addRow({ documento, nombre: clientes.get(documento)?.nombre ?? "", n: c.n, total: c.total });
  }
  encabezado(hc);

  // ── Resumen ──
  const m = normalizarMetricas(proceso.metricas);
  const hr = libro.addWorksheet("Resumen");
  hr.columns = [
    { header: "Concepto", key: "c", width: 34 },
    { header: "Valor", key: "v", width: 22 },
  ];
  const inicio = proceso.inicio?.toDate?.();
  const segundos = inicio ? Math.round((Date.now() - inicio.getTime()) / 1000) : null;
  const filas: [string, string | number | null][] = [
    ["Carpeta", proceso.carpeta],
    ["Total de archivos", archivos.length],
    ["Aceptadas (máquina)", m.aceptadas.n],
    ["En revisión", m.revision.n],
    ["Revisadas a mano", m.manuales.n],
    ["Duplicadas", m.duplicadas],
    ["Con error", m.errores],
    ["Clientes nuevos", m.clientesNuevos],
    ["Clientes existentes", m.clientesExistentes],
    ["Duración (s)", segundos],
  ];
  for (const [c, v] of filas) hr.addRow({ c, v });
  hr.getRow(1).font = { bold: true };

  const buffer = Buffer.from(await libro.xlsx.writeBuffer());
  return { facturas, buffer };
}

/** Nombre con la hora de Colombia: no pisa ejecuciones anteriores. */
export function nombreExcel(procesoId: string, fecha = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(fecha);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00";
  return `procesos/${procesoId}/resultado_${p("year")}-${p("month")}-${p("day")}_${p("hour")}${p("minute")}${p("second")}.xlsx`;
}

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
