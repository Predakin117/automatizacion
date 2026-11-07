import { exigirUsuario } from "@/lib/auth/sesion";
import { db } from "@/lib/firebase/admin";
import { COLECCIONES, type Factura } from "@/lib/modelo/tipos";

const LIMITE_LISTA = 200;

/**
 * Facturas del usuario pendientes de revisión humana. Solo filtros de igualdad (sin índice
 * compuesto); 1 lectura por factura listada, con tope de 200.
 */
export async function GET(request: Request) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const snap = await db()
    .collection(COLECCIONES.facturas)
    .where("uid", "==", u.uid)
    .where("estado", "==", "revision")
    .limit(LIMITE_LISTA)
    .get();
  const facturas = snap.docs
    .map((d) => {
      const f = d.data() as Factura;
      return { hash: d.id, archivo: f.archivo, numero: f.numero, proveedor: f.proveedor, total: f.total, motivos: f.motivos, procesoId: f.procesoId };
    })
    .sort((a, b) => a.archivo.localeCompare(b.archivo));
  return Response.json({ facturas, limite: LIMITE_LISTA });
}
