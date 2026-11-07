import { exigirUsuario } from "@/lib/auth/sesion";
import { subirArchivo } from "@/lib/almacen";
import { TAMANO_MAXIMO, TIPO_MIME, validarImagen } from "@/lib/imagen";
import { noEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";
import { rutaImagen } from "@/lib/rutas";

/**
 * Sube UNA imagen por petición. La API es la única que escribe en el almacén: valida con las
 * reglas del negocio y el navegador nunca recibe permisos sobre él. Orden de validación:
 * sesión (401) → lote propio y en "subiendo" (404) → índice (400) → tamaño (413)
 * → tipo real por los bytes (415) → que se pueda decodificar (415/413) → guardar.
 */

// La respuesta afirmativa "este lote es tuyo y está subiendo" se recuerda 20 s en la memoria
// de la instancia: no se lee Firestore por cada una de las 100 imágenes del lote.
const loteVerificado = new Map<string, number>();
const RECORDAR_MS = 20_000;

async function loteAbierto(id: string, uid: string): Promise<boolean> {
  const clave = `${uid}/${id}`;
  const hasta = loteVerificado.get(clave);
  if (hasta && hasta > Date.now()) return true;
  const p = await procesoDelUsuario(id, uid);
  if (!p || p.estado !== "subiendo") return false;
  loteVerificado.set(clave, Date.now() + RECORDAR_MS);
  return true;
}

function rechazo(estado: number, error: string): Response {
  return Response.json({ error }, { status: estado });
}

export async function POST(request: Request, ctx: RouteContext<"/api/procesos/[id]/imagenes">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  if (!(await loteAbierto(id, u.uid))) return noEncontrado();

  const params = new URL(request.url).searchParams;
  const indice = Number(params.get("indice"));
  const nombre = (params.get("nombre") ?? "").slice(0, 200);
  if (!Number.isInteger(indice) || indice < 0 || indice > 9999) return rechazo(400, "Índice inválido.");
  if (!nombre) return rechazo(400, "Falta el nombre del archivo.");

  // Tamaño: primero la cabecera (barato), luego los bytes reales (la cabecera puede mentir).
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > TAMANO_MAXIMO) return rechazo(413, "La imagen pasa de 4 MB.");
  const bytes = Buffer.from(await request.arrayBuffer());

  const v = await validarImagen(bytes);
  if (!v.ok) return rechazo(v.estado, v.motivo);

  // Nombre final con la extensión del tipo REAL (no la del nombre que mandó el navegador).
  const ruta = rutaImagen(id, indice, nombre, v.tipo);
  // sobrescribir: si el navegador reintenta una subida que sí había llegado, no falla.
  await subirArchivo(ruta, bytes, TIPO_MIME[v.tipo], { sobrescribir: true });
  return Response.json({ pathname: ruta }, { status: 201 });
}
