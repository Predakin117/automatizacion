import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import type { Cliente, Factura, IndiceNumero } from "@/lib/modelo/tipos";
import { aParcial, revisar, type DatosFactura } from "./correccion";
import { refCliente, refFactura, refIndice } from "./guardar";
import { cambiosDe } from "./metricas";
import { aplicarMetricas } from "./metricas-firestore";
import { refProceso } from "./proceso";

export type ResultadoCorreccion =
  | { ok: true; clienteNuevo: boolean }
  | { ok: false; estado: 404 | 409 | 422; error: string; motivos?: string[] };

class Rechazo extends Error {
  constructor(public estado: 404 | 409, mensaje: string) {
    super(mensaje);
  }
}

/**
 * Guarda la corrección de una persona en UNA transacción (lecturas antes que escrituras):
 * la factura pasa a "aceptada" con los datos de la persona y constancia de quién decidió qué;
 * se crea el índice del número (liberando el anterior si cambió), el cliente si no existe y
 * pasa el DV, y se actualizan los contadores del lote (solo la DIFERENCIA si es una reedición).
 */
export async function corregirFactura(
  hash: string,
  usuario: { uid: string; email: string },
  datos: DatosFactura,
  confirmarIgnorar: boolean,
): Promise<ResultadoCorreccion> {
  const r = revisar(datos);
  if (r.bloqueantes.length > 0) return { ok: false, estado: 422, error: "Hay datos que no se pueden aceptar.", motivos: r.motivos };
  if (r.ignorables.length > 0 && !confirmarIgnorar) {
    return { ok: false, estado: 422, error: "Hay validaciones sin confirmar.", motivos: r.motivos };
  }
  const p = aParcial(datos);

  try {
    return await db().runTransaction(async (tx) => {
      // ── lecturas ──
      const snap = await tx.get(refFactura(hash));
      const f = snap.data() as Factura | undefined;
      if (!f || f.uid !== usuario.uid) throw new Rechazo(404, "No existe.");
      if (f.estado === "aceptada" && !f.corregidaManualmente) {
        throw new Rechazo(409, "Esta factura ya la aceptó la máquina; no hace falta revisarla.");
      }
      const indice = await tx.get(refIndice(datos.numero));
      if (indice.exists && (indice.data() as IndiceNumero).hashArchivo !== hash) {
        throw new Rechazo(409, `El número ${datos.numero} ya existe en otra factura.`);
      }
      const numeroAnterior = f.corregidaManualmente && f.numero && f.numero !== datos.numero ? f.numero : null;
      const indiceAnterior = numeroAnterior ? await tx.get(refIndice(numeroAnterior)) : null;
      const cliente = await tx.get(refCliente(datos.clienteDocumento));

      // ── escrituras ──
      const ahora = Timestamp.now();
      tx.update(refFactura(hash), {
        numero: datos.numero,
        fecha: datos.fecha,
        proveedor: datos.proveedor,
        nitProveedor: datos.nitProveedor,
        dvProveedor: datos.dvProveedor,
        clienteDocumento: datos.clienteDocumento,
        clienteDv: datos.clienteDv,
        clienteNombre: datos.clienteNombre,
        subtotal: datos.subtotal,
        iva: datos.iva,
        impoconsumo: datos.impoconsumo,
        total: datos.total,
        items: p.items.map((it) => ({ descripcion: it.descripcion, cantidad: it.cantidad!, precioUnitario: it.precioUnitario!, subtotal: it.subtotal! })),
        estado: "aceptada",
        motivos: [],
        corregidaManualmente: true,
        corregidaPor: usuario.email,
        corregidaEn: ahora,
        // Qué decía la máquina (solo la primera vez: una reedición no lo pisa).
        motivosOriginales: f.corregidaManualmente ? (f.motivosOriginales ?? []) : f.motivos,
        validacionesIgnoradas: r.ignorables,
      } satisfies Partial<Factura>);
      tx.set(refIndice(datos.numero), { hashArchivo: hash } satisfies IndiceNumero);
      if (indiceAnterior?.exists && (indiceAnterior.data() as IndiceNumero).hashArchivo === hash) {
        tx.delete(indiceAnterior.ref); // libera el número anterior
      }
      let clienteNuevo = false;
      if (!cliente.exists) {
        const c: Cliente = {
          documento: datos.clienteDocumento,
          dv: datos.clienteDv,
          nombre: datos.clienteNombre,
          creadoEn: ahora,
          primerProcesoId: f.procesoId,
        };
        tx.create(cliente.ref, c);
        clienteNuevo = true;
      }
      const reedicion = !!f.corregidaManualmente;
      aplicarMetricas(
        tx,
        refProceso(f.procesoId),
        cambiosDe({
          tipo: "manual",
          importes: p,
          antes: reedicion ? f : null,
          proveedor: { nit: datos.nitProveedor, nombre: datos.proveedor },
          proveedorAntes: reedicion && f.nitProveedor ? { nit: f.nitProveedor } : null,
          cliente: clienteNuevo ? "nuevo" : null,
        }),
      );
      // Marca de cambio en el lote (para saber que su Excel quedó desactualizado).
      tx.set(refProceso(f.procesoId), { ultimaCorreccion: FieldValue.serverTimestamp() }, { merge: true });
      return { ok: true as const, clienteNuevo };
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, estado: e.estado, error: e.message };
    throw e;
  }
}
