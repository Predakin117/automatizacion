import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { COLECCIONES, TERMINADO, type Cliente, type Factura, type IndiceNumero } from "@/lib/modelo/tipos";
import { dvValido } from "@/lib/ocr/nit";
import type { ParcialFactura } from "@/lib/ocr/tipos";
import { cambiosDe, type EventoMetrica } from "./metricas";
import { aplicarMetricas } from "./metricas-firestore";
import { refCola, refProceso } from "./proceso";

export interface DatosGuardado {
  procesoId: string;
  uid: string;
  idCola: string;
  nombre: string;
  rutaArchivo: string;
  hash: string;
  parcial: ParcialFactura;
  motivos: string[];
  confianza: number | null;
}

export type ResultadoGuardado = "aceptada" | "revision" | "duplicada";

export const refFactura = (hash: string) => db().collection(COLECCIONES.facturas).doc(hash);
export const refIndice = (numero: string) => db().collection(COLECCIONES.indicesNumero).doc(numero);
export const refCliente = (documento: string) => db().collection(COLECCIONES.clientes).doc(documento);

export const motivoNumeroRepetido = (numero: string) => `El número ${numero} ya existe en otra factura`;

/**
 * Guarda una factura leída, en UNA transacción, con TODAS las lecturas antes de las
 * escrituras (regla de Firestore). Idempotente por construcción:
 *  - el ID de la factura es el SHA-256 de la imagen → el mismo archivo nunca se guarda dos veces;
 *  - el número de factura es único (indices_numero/{numero});
 *  - el ID del cliente es su documento → es imposible que existan dos clientes iguales,
 *    aunque dos lotes concurrentes lo intenten a la vez.
 * Solo una factura ACEPTADA crea índice de número y cliente: así un número o un documento mal
 * leídos nunca bloquean a otra factura ni inventan clientes. Las de revisión los crean cuando
 * una persona las corrige (Fase 9).
 */
export async function guardarFactura(d: DatosGuardado): Promise<ResultadoGuardado> {
  const facturaRef = refFactura(d.hash);
  const colaRef = refCola(d.procesoId).doc(d.idCola);
  const procesoRef = refProceso(d.procesoId);
  const p = d.parcial;
  const documentoValido = dvValido(p.clienteDocumento, p.clienteDv) ? p.clienteDocumento : null;

  return db().runTransaction(async (tx) => {
    // ── lecturas ──
    const factura = await tx.get(facturaRef);
    const indice = p.numero ? await tx.get(refIndice(p.numero)) : null;

    if (factura.exists) {
      tx.update(colaRef, cierreCola("duplicada", d.hash));
      aplicarMetricas(tx, procesoRef, cambiosDe({ tipo: "duplicada" }));
      return "duplicada";
    }

    const motivos = [...d.motivos];
    // Mismo número con OTRO archivo: no se descarta (podría ser un número mal leído; descartarla
    // perdería una factura): va a revisión con el motivo y sin crear el índice.
    if (p.numero && indice?.exists && (indice.data() as IndiceNumero).hashArchivo !== d.hash) {
      motivos.push(motivoNumeroRepetido(p.numero));
    }
    const estado = motivos.length === 0 ? "aceptada" : "revision";
    const cliente = estado === "aceptada" && documentoValido ? await tx.get(refCliente(documentoValido)) : null;

    // ── escrituras ──
    const ahora = Timestamp.now();
    const nueva: Factura = {
      numero: p.numero,
      fecha: p.fecha,
      proveedor: p.proveedor,
      nitProveedor: p.nitProveedor,
      dvProveedor: p.dvProveedor,
      clienteDocumento: documentoValido,
      clienteDocumentoLeido: p.clienteDocumento,
      clienteDv: p.clienteDv,
      clienteNombre: p.clienteNombre,
      subtotal: p.subtotal,
      iva: p.iva,
      impoconsumo: p.impoconsumo,
      total: p.total,
      estado,
      motivos,
      archivo: d.nombre,
      rutaArchivo: d.rutaArchivo,
      confianzaOcr: d.confianza,
      procesoId: d.procesoId,
      uid: d.uid,
      creadoEn: ahora,
      items: p.items.map((it) => ({
        descripcion: it.descripcion,
        cantidad: it.cantidad ?? 0,
        precioUnitario: it.precioUnitario ?? 0,
        subtotal: it.subtotal ?? 0,
      })),
    };
    tx.create(facturaRef, nueva);

    let evento: EventoMetrica;
    let clienteNuevo = false;
    if (estado === "aceptada") {
      tx.create(refIndice(p.numero!), { hashArchivo: d.hash } satisfies IndiceNumero);
      if (documentoValido && cliente && !cliente.exists) {
        // Se crea SOLO si no existe y nunca se sobrescribe su nombre.
        const c: Cliente = {
          documento: documentoValido,
          dv: p.clienteDv,
          nombre: p.clienteNombre ?? "",
          creadoEn: ahora,
          primerProcesoId: d.procesoId,
        };
        tx.create(refCliente(documentoValido), c);
        clienteNuevo = true;
      }
      evento = {
        tipo: "aceptada",
        importes: p,
        proveedor: p.nitProveedor ? { nit: p.nitProveedor, nombre: p.proveedor ?? "" } : null,
        cliente: clienteNuevo ? "nuevo" : "existente",
      };
    } else {
      evento = { tipo: "revision", importes: p };
    }
    tx.update(colaRef, {
      ...cierreCola(estado, d.hash),
      clienteNuevo,
      clienteExistente: estado === "aceptada" && !clienteNuevo,
    });
    aplicarMetricas(tx, procesoRef, cambiosDe(evento));
    return estado;
  });
}

function cierreCola(resultado: "aceptada" | "revision" | "duplicada" | "error", hash: string | null) {
  return { estado: "ok", resultado, hashArchivo: hash, disponibleDesde: TERMINADO };
}

/** Atajo previo al OCR: la imagen ya está guardada (1 lectura en vez de minutos de CPU). */
export async function marcarDuplicada(procesoId: string, idCola: string, hash: string): Promise<void> {
  const batch = db().batch();
  batch.update(refCola(procesoId).doc(idCola), cierreCola("duplicada", hash));
  aplicarMetricas(batch, refProceso(procesoId), cambiosDe({ tipo: "duplicada" }));
  await batch.commit();
}

/**
 * Tras agotar los intentos: si se pudo leer la imagen (hay hash), la factura queda en
 * revisión con el motivo del error (no se pierde; una persona la ingresa a mano).
 */
export async function guardarFallo(
  d: Omit<DatosGuardado, "parcial" | "motivos" | "confianza" | "hash"> & { hash: string | null; error: string },
): Promise<void> {
  const colaRef = refCola(d.procesoId).doc(d.idCola);
  const procesoRef = refProceso(d.procesoId);
  await db().runTransaction(async (tx) => {
    const factura = d.hash ? await tx.get(refFactura(d.hash)) : null;
    if (factura?.exists) {
      tx.update(colaRef, cierreCola("duplicada", d.hash));
      aplicarMetricas(tx, procesoRef, cambiosDe({ tipo: "duplicada" }));
      return;
    }
    if (d.hash) {
      const vacia: Factura = {
        numero: null, fecha: null, proveedor: null, nitProveedor: null, dvProveedor: null,
        clienteDocumento: null, clienteDocumentoLeido: null, clienteDv: null, clienteNombre: null,
        subtotal: null, iva: null, impoconsumo: null, total: null,
        estado: "revision",
        motivos: [`Error al leer la imagen: ${d.error}`],
        archivo: d.nombre, rutaArchivo: d.rutaArchivo, confianzaOcr: null,
        procesoId: d.procesoId, uid: d.uid, creadoEn: Timestamp.now(), items: [],
      };
      tx.create(refFactura(d.hash), vacia);
    }
    tx.update(colaRef, { ...cierreCola("error", d.hash), error: d.error });
    aplicarMetricas(tx, procesoRef, cambiosDe({ tipo: "error" }));
  });
}
