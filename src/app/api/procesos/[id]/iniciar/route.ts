import { exigirUsuario } from "@/lib/auth/sesion";
import { iniciarProceso } from "@/lib/procesamiento/iniciar";
import { noEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

export const maxDuration = 60;

/** Crea la cola del lote a partir de lo que realmente se subió. Idempotente. */
export async function POST(request: Request, ctx: RouteContext<"/api/procesos/[id]/iniciar">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const p = await procesoDelUsuario(id, u.uid);
  if (!p) return noEncontrado();
  if (p.estado === "terminado") return Response.json({ archivos: p.totalArchivos, nuevos: 0, estado: p.estado });
  const r = await iniciarProceso(id);
  if (r.archivos === 0) return Response.json({ error: "El lote no tiene imágenes subidas." }, { status: 400 });
  return Response.json({ ...r, estado: "ejecutando" });
}
