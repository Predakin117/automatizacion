import { exigirUsuario } from "@/lib/auth/sesion";
import type { Factura } from "@/lib/modelo/tipos";
import { EsquemaCorreccion } from "@/lib/procesamiento/correccion-esquema";
import { corregirFactura } from "@/lib/procesamiento/corregir";
import { refFactura } from "@/lib/procesamiento/guardar";

const HASH = /^[0-9a-f]{64}$/;

/** Detalle de una factura (para precargar el formulario con lo que la máquina alcanzó a leer). */
export async function GET(request: Request, ctx: RouteContext<"/api/facturas/[hash]">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { hash } = await ctx.params;
  if (!HASH.test(hash)) return Response.json({ error: "No existe." }, { status: 404 });
  const f = (await refFactura(hash).get()).data() as Factura | undefined;
  if (!f || f.uid !== u.uid) return Response.json({ error: "No existe." }, { status: 404 });
  return Response.json({
    hash,
    archivo: f.archivo,
    procesoId: f.procesoId,
    estado: f.estado,
    motivos: f.motivos,
    motivosOriginales: f.motivosOriginales ?? null,
    corregidaManualmente: f.corregidaManualmente ?? false,
    corregidaPor: f.corregidaPor ?? null,
    rotacionAplicada: f.rotacionAplicada ?? 0,
    numero: f.numero,
    fecha: f.fecha,
    proveedor: f.proveedor,
    nitProveedor: f.nitProveedor,
    dvProveedor: f.dvProveedor ?? null,
    // Lo que leyó el OCR, aunque no pasara el DV: la persona lo corrige mirando la imagen.
    clienteDocumento: f.clienteDocumento ?? f.clienteDocumentoLeido ?? null,
    clienteDv: f.clienteDv ?? null,
    clienteNombre: f.clienteNombre,
    items: f.items ?? [],
    subtotal: f.subtotal,
    iva: f.iva,
    impoconsumo: f.impoconsumo,
    total: f.total,
  });
}

/**
 * Guarda la revisión manual. Respuestas: 400 (formato), 422 (validaciones sin confirmar o
 * DV inválido), 404 (no existe o es de otro usuario), 409 (la aceptó la máquina, o su número
 * ya existe en otra factura).
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/facturas/[hash]">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { hash } = await ctx.params;
  if (!HASH.test(hash)) return Response.json({ error: "No existe." }, { status: 404 });
  const cuerpo = EsquemaCorreccion.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) {
    return Response.json({ error: cuerpo.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  const r = await corregirFactura(hash, u, cuerpo.data.datos, cuerpo.data.confirmarIgnorar);
  if (!r.ok) return Response.json({ error: r.error, motivos: r.motivos }, { status: r.estado });
  return Response.json(r);
}
