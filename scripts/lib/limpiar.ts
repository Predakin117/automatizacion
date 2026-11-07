import { borrarArchivos, listarCarpeta } from "../../src/lib/almacen";
import { db } from "../../src/lib/firebase/admin";
import { COLECCIONES, type Cliente, type IndiceNumero } from "../../src/lib/modelo/tipos";

/**
 * Borra SOLO lo que creó un lote. "Lo que creó" se COMPRUEBA, no se supone: dos conjuntos
 * de facturas numeran ambos desde FE-000001, así que
 *  - un índice de número se borra solo si apunta a una factura de ESTE lote;
 *  - un cliente se borra solo si lo creó ESTE lote (primerProcesoId).
 */
export async function limpiarLote(procesoId: string): Promise<Record<string, number>> {
  const f = db();
  const r = { facturas: 0, indices: 0, clientes: 0, cola: 0, archivos: 0 };
  const facturas = await f.collection(COLECCIONES.facturas).where("procesoId", "==", procesoId).get();
  const hashes = new Set(facturas.docs.map((d) => d.id));

  const escritor = f.bulkWriter();
  for (const d of facturas.docs) {
    const numero = d.get("numero") as string | null;
    if (numero) {
      const indice = await f.collection(COLECCIONES.indicesNumero).doc(numero).get();
      if (indice.exists && hashes.has((indice.data() as IndiceNumero).hashArchivo)) {
        void escritor.delete(indice.ref);
        r.indices++;
      }
    }
    const documento = d.get("clienteDocumento") as string | null;
    if (documento) {
      const cliente = await f.collection(COLECCIONES.clientes).doc(documento).get();
      if (cliente.exists && (cliente.data() as Cliente).primerProcesoId === procesoId) {
        void escritor.delete(cliente.ref);
        r.clientes++;
      }
    }
    void escritor.delete(d.ref);
    r.facturas++;
  }
  const proceso = f.collection(COLECCIONES.procesos).doc(procesoId);
  const cola = await proceso.collection(COLECCIONES.archivos).get();
  for (const d of cola.docs) {
    void escritor.delete(d.ref);
    r.cola++;
  }
  void escritor.delete(proceso);
  await escritor.close();
  r.archivos = await borrarArchivos(await listarCarpeta(`procesos/${procesoId}`));
  return r;
}
