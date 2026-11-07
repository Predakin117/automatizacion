import { exigirUsuario } from "@/lib/auth/sesion";
import { db } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";
import { resumenProceso } from "@/lib/procesamiento/proceso";

/**
 * Métricas de todos los lotes del usuario en UNA consulta (1 lectura por lote: los
 * contadores viven en cada documento) + el número de clientes de la base (count()).
 */
export async function GET(request: Request) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const [procesos, clientes] = await Promise.all([
    db().collection(COLECCIONES.procesos).where("uid", "==", u.uid).get(),
    db().collection(COLECCIONES.clientes).count().get(),
  ]);
  return Response.json({
    procesos: procesos.docs
      .map((d) => resumenProceso(d.id, d.data() as Proceso))
      .sort((a, b) => (a.inicio ?? 0) - (b.inicio ?? 0)),
    clientes: clientes.data().count,
  });
}
