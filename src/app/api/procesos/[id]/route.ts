import { exigirUsuario } from "@/lib/auth/sesion";
import { noEncontrado, procesoDelUsuario, resumenProceso } from "@/lib/procesamiento/proceso";

/** Estado y métricas de un lote: 1 lectura (los contadores viven en el propio documento). */
export async function GET(request: Request, ctx: RouteContext<"/api/procesos/[id]">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const p = await procesoDelUsuario(id, u.uid);
  if (!p) return noEncontrado();
  return Response.json(resumenProceso(id, p));
}
