import { exigirUsuario } from "@/lib/auth/sesion";
import { db } from "@/lib/firebase/admin";
import { COLECCIONES, type ArchivoCola, type Factura } from "@/lib/modelo/tipos";
import { noEncontrado, procesoDelUsuario, refCola } from "@/lib/procesamiento/proceso";

/**
 * Facturas de un lote (incluye las "duplicadas" de un reproceso). Cuesta ~2 lecturas por
 * factura (cola + factura): la interfaz la pide UNA vez, cuando el lote terminó.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/procesos/[id]/facturas">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  if (!(await procesoDelUsuario(id, u.uid))) return noEncontrado();

  const cola = (await refCola(id).get()).docs.map((d) => d.data() as ArchivoCola);
  const hashes = [...new Set(cola.map((a) => a.hashArchivo).filter((h): h is string => !!h))];
  const ref = db().collection(COLECCIONES.facturas);
  const facturas = [];
  for (let i = 0; i < hashes.length; i += 300) {
    const docs = await db().getAll(...hashes.slice(i, i + 300).map((h) => ref.doc(h)));
    for (const d of docs) {
      if (!d.exists) continue;
      const f = d.data() as Factura;
      if (f.uid !== u.uid) continue;
      facturas.push({
        hash: d.id,
        archivo: f.archivo,
        numero: f.numero,
        fecha: f.fecha,
        proveedor: f.proveedor,
        clienteNombre: f.clienteNombre,
        subtotal: f.subtotal,
        iva: f.iva,
        impoconsumo: f.impoconsumo,
        total: f.total,
        estado: f.estado,
        motivos: f.motivos,
        corregidaManualmente: f.corregidaManualmente ?? false,
        rotacionAplicada: f.rotacionAplicada ?? 0,
        esDeEsteLote: f.procesoId === id,
      });
    }
  }
  const errores = cola.filter((a) => a.resultado === "error" && !a.hashArchivo).map((a) => ({ archivo: a.nombre, error: a.error }));
  facturas.sort((a, b) => a.archivo.localeCompare(b.archivo));
  return Response.json({ facturas, errores });
}
