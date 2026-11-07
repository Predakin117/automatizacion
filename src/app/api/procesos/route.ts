import { exigirUsuario } from "@/lib/auth/sesion";
import { db } from "@/lib/firebase/admin";
import { COLECCIONES } from "@/lib/modelo/tipos";

/** Lista los lotes del usuario (solo los suyos). */
export async function GET(request: Request) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;

  const snap = await db().collection(COLECCIONES.procesos).where("uid", "==", u.uid).get();
  const procesos = snap.docs.map((d) => ({ id: d.id, estado: d.get("estado") as string }));
  return Response.json({ procesos });
}
