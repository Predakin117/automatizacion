"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EsquemaDatosFactura } from "@/lib/procesamiento/correccion-esquema";
import { proponerTotales, revisar, type DatosFactura } from "@/lib/procesamiento/correccion";
import { api, apiJson } from "./api";
import { pesos } from "./formato";
import type { Pendiente } from "./ListaRevision";
import { Aviso, Insignia, Tarjeta } from "./ui";

interface Detalle {
  hash: string;
  archivo: string;
  procesoId: string;
  estado: "aceptada" | "revision";
  motivos: string[];
  motivosOriginales: string[] | null;
  corregidaManualmente: boolean;
  corregidaPor: string | null;
  rotacionAplicada: number;
  numero: string | null;
  fecha: string | null;
  proveedor: string | null;
  nitProveedor: string | null;
  dvProveedor: number | null;
  clienteDocumento: string | null;
  clienteDv: number | null;
  clienteNombre: string | null;
  items: { descripcion: string; cantidad: number; precioUnitario: number }[];
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number | null;
  total: number | null;
}

/** Estado del formulario: todo como texto (lo que escribe la persona), se convierte al guardar. */
interface Campos {
  numero: string;
  fecha: string;
  proveedor: string;
  nitProveedor: string;
  dvProveedor: string;
  clienteDocumento: string;
  clienteDv: string;
  clienteNombre: string;
  items: { descripcion: string; cantidad: string; precioUnitario: string }[];
  conImpoconsumo: boolean;
  subtotal: string;
  iva: string;
  impoconsumo: string;
  total: string;
}

const txt = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/[.\s$]/g, "")));
const itemVacio = () => ({ descripcion: "", cantidad: "1", precioUnitario: "" });

function camposDesde(d: Detalle): Campos {
  return {
    numero: txt(d.numero),
    fecha: txt(d.fecha),
    proveedor: txt(d.proveedor),
    nitProveedor: txt(d.nitProveedor),
    dvProveedor: txt(d.dvProveedor),
    clienteDocumento: txt(d.clienteDocumento),
    clienteDv: txt(d.clienteDv),
    clienteNombre: txt(d.clienteNombre),
    // Una factura con error del OCR no trae ítems: siempre al menos una fila.
    items: d.items.length > 0 ? d.items.map((it) => ({ descripcion: it.descripcion, cantidad: txt(it.cantidad), precioUnitario: txt(it.precioUnitario) })) : [itemVacio()],
    conImpoconsumo: d.impoconsumo !== null && d.impoconsumo > 0,
    subtotal: txt(d.subtotal),
    iva: txt(d.iva),
    impoconsumo: txt(d.impoconsumo),
    total: txt(d.total),
  };
}

function aDatos(c: Campos): DatosFactura {
  return {
    numero: c.numero.trim().toUpperCase(),
    fecha: c.fecha.trim(),
    proveedor: c.proveedor.trim(),
    nitProveedor: c.nitProveedor.replace(/\D/g, ""),
    dvProveedor: num(c.dvProveedor),
    clienteDocumento: c.clienteDocumento.replace(/\D/g, ""),
    clienteDv: num(c.clienteDv),
    clienteNombre: c.clienteNombre.trim(),
    items: c.items.map((it) => ({ descripcion: it.descripcion.trim(), cantidad: num(it.cantidad), precioUnitario: num(it.precioUnitario) })),
    subtotal: num(c.subtotal),
    iva: num(c.iva),
    impoconsumo: c.conImpoconsumo ? num(c.impoconsumo) : null,
    total: num(c.total),
  };
}

/** Página de revisión: carga la factura y monta el formulario con key={hash}. */
export function RevisionFactura({ hash }: { hash: string }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    apiJson<Detalle>(`/api/facturas/${hash}`)
      .then((d) => vivo && setDetalle(d))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [hash]);
  if (error) return <Aviso>{error}</Aviso>;
  if (!detalle || detalle.hash !== hash) return <p className="text-muted">Cargando…</p>;
  // key={hash}: React NO reutiliza el formulario de la factura anterior (con sus campos, su
  // confirmación y su mensaje): se podrían guardar datos de una factura sobre otra.
  return <FormularioFactura key={hash} detalle={detalle} />;
}

function Campo({ etiqueta, valor, cambiar, ancho = "", tipo = "text", prueba }: { etiqueta: string; valor: string; cambiar: (v: string) => void; ancho?: string; tipo?: string; prueba?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${ancho}`}>
      {etiqueta}
      <input type={tipo} value={valor} onChange={(e) => cambiar(e.target.value)} className="campo" data-prueba={prueba} />
    </label>
  );
}

function FormularioFactura({ detalle }: { detalle: Detalle }) {
  const router = useRouter();
  const [c, setC] = useState<Campos>(() => camposDesde(detalle));
  // Si la máquina tuvo que enderezarla, se muestra ya derecha.
  const [rotacion, setRotacion] = useState(detalle.rotacionAplicada ?? 0);
  const [zoom, setZoom] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poner = <K extends keyof Campos>(k: K, v: Campos[K]) => {
    setC((x) => ({ ...x, [k]: v }));
    setConfirmado(false);
  };
  const ponerItem = (i: number, k: "descripcion" | "cantidad" | "precioUnitario", v: string) => {
    setC((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
    setConfirmado(false);
  };

  const datos = useMemo(() => aDatos(c), [c]);
  const formato = EsquemaDatosFactura.safeParse(datos);
  // Validación en vivo con las MISMAS reglas que el servidor (y que el OCR).
  const revision = formato.success ? revisar(datos) : null;
  const totalesPropuestos = proponerTotales(
    datos.items.map((it) => ({ ...it, cantidad: it.cantidad || 0, precioUnitario: it.precioUnitario || 0 })),
    c.conImpoconsumo,
  );

  function recalcular() {
    setC((x) => ({
      ...x,
      subtotal: String(totalesPropuestos.subtotal),
      iva: String(totalesPropuestos.iva),
      impoconsumo: totalesPropuestos.impoconsumo === null ? "" : String(totalesPropuestos.impoconsumo),
      total: String(totalesPropuestos.total),
    }));
    setConfirmado(false);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await api(`/api/facturas/${detalle.hash}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ datos, confirmarIgnorar: confirmado }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string; motivos?: string[] };
      if (!r.ok) {
        setError(`${cuerpo.error ?? `Error ${r.status}`}${cuerpo.motivos?.length ? ` ${cuerpo.motivos.join("; ")}` : ""}`);
        return;
      }
      // Salta a la siguiente pendiente.
      const { facturas } = await apiJson<{ facturas: Pendiente[] }>("/api/facturas");
      const siguiente = facturas.find((f) => f.hash !== detalle.hash);
      router.push(siguiente ? `/revision/${siguiente.hash}` : "/revision");
    } finally {
      setGuardando(false);
    }
  }

  const hayIgnorables = (revision?.ignorables.length ?? 0) > 0;
  const puedeGuardar = formato.success && revision !== null && revision.bloqueantes.length === 0 && (!hayIgnorables || confirmado);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Tarjeta className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{detalle.archivo}</span>
          <div className="ml-auto flex gap-1">
            <button type="button" className="boton px-2 py-1 text-sm" aria-label="Girar a la izquierda" onClick={() => setRotacion((r) => (r + 270) % 360)}>↺</button>
            <button type="button" className="boton px-2 py-1 text-sm" aria-label="Girar a la derecha" onClick={() => setRotacion((r) => (r + 90) % 360)}>↻</button>
            <button type="button" className="boton px-2 py-1 text-sm" onClick={() => setZoom((z) => !z)}>{zoom ? "Ajustar" : "Ampliar"}</button>
          </div>
        </div>
        <div className={`rounded border border-borde bg-fondo ${zoom ? "max-h-[80vh] overflow-auto" : ""}`}>
          {/* <img> y no next/image: la imagen es privada, se sirve con la cookie de sesión y no debe pasar por el optimizador. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/facturas/${detalle.hash}/imagen${rotacion ? `?rotar=${rotacion}` : ""}`}
            alt={`Factura ${detalle.archivo}`}
            className={zoom ? "max-w-none" : "h-auto w-full"}
            style={zoom ? { width: "180%" } : undefined}
            data-prueba="imagen-factura"
          />
        </div>
        {detalle.motivos.length > 0 && (
          <div className="mt-3 text-xs text-muted">
            <strong>La máquina no la aceptó porque:</strong> {detalle.motivos.join("; ")}
          </div>
        )}
      </Tarjeta>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        {detalle.corregidaManualmente && <Aviso tono="aviso">Ya la revisó {detalle.corregidaPor}. Si guardas, se reemplaza su corrección.</Aviso>}
        <Tarjeta titulo="Factura">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Número" valor={c.numero} cambiar={(v) => poner("numero", v)} prueba="numero" />
            <Campo etiqueta="Fecha de emisión" tipo="date" valor={c.fecha} cambiar={(v) => poner("fecha", v)} prueba="fecha" />
            <Campo etiqueta="Proveedor (razón social)" valor={c.proveedor} cambiar={(v) => poner("proveedor", v)} ancho="sm:col-span-2" prueba="proveedor" />
            <Campo etiqueta="NIT del proveedor (sin DV)" valor={c.nitProveedor} cambiar={(v) => poner("nitProveedor", v)} prueba="nit" />
            <Campo etiqueta="DV" valor={c.dvProveedor} cambiar={(v) => poner("dvProveedor", v)} prueba="dv" />
            <Campo etiqueta="Cliente" valor={c.clienteNombre} cambiar={(v) => poner("clienteNombre", v)} ancho="sm:col-span-2" prueba="cliente" />
            <Campo etiqueta="Documento del cliente (sin DV)" valor={c.clienteDocumento} cambiar={(v) => poner("clienteDocumento", v)} prueba="documento" />
            <Campo etiqueta="DV del cliente" valor={c.clienteDv} cambiar={(v) => poner("clienteDv", v)} prueba="dv-cliente" />
          </div>
        </Tarjeta>

        <Tarjeta titulo="Ítems">
          <div className="flex flex-col gap-2">
            {c.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_8rem_auto] items-end gap-2">
                <Campo etiqueta={i === 0 ? "Descripción" : ""} valor={it.descripcion} cambiar={(v) => ponerItem(i, "descripcion", v)} />
                <Campo etiqueta={i === 0 ? "Cant." : ""} valor={it.cantidad} cambiar={(v) => ponerItem(i, "cantidad", v)} />
                <Campo etiqueta={i === 0 ? "Precio" : ""} valor={it.precioUnitario} cambiar={(v) => ponerItem(i, "precioUnitario", v)} />
                <button type="button" className="boton px-2 py-2 text-sm" aria-label="Quitar ítem" disabled={c.items.length === 1} onClick={() => setC((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}>
                  ✕
                </button>
                <span className="col-span-4 -mt-1 text-right text-xs text-muted cifra">
                  Subtotal: {pesos((num(it.cantidad) || 0) * (num(it.precioUnitario) || 0))}
                </span>
              </div>
            ))}
            <button type="button" className="boton w-fit text-sm" onClick={() => setC((x) => ({ ...x, items: [...x.items, itemVacio()] }))}>
              + Agregar ítem
            </button>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Totales">
          <label className="mb-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c.conImpoconsumo} onChange={(e) => poner("conImpoconsumo", e.target.checked)} />
            La factura lleva impoconsumo (4 %, telefonía y datos móviles)
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Valor antes de IVA" valor={c.subtotal} cambiar={(v) => poner("subtotal", v)} prueba="subtotal" />
            <Campo etiqueta="IVA" valor={c.iva} cambiar={(v) => poner("iva", v)} prueba="iva" />
            {c.conImpoconsumo && <Campo etiqueta="Impoconsumo" valor={c.impoconsumo} cambiar={(v) => poner("impoconsumo", v)} prueba="impoconsumo" />}
            <Campo etiqueta="Total" valor={c.total} cambiar={(v) => poner("total", v)} prueba="total" />
          </div>
          <p className="mt-2 text-xs text-muted">
            Propuesta desde los ítems: {pesos(totalesPropuestos.subtotal)} + IVA {pesos(totalesPropuestos.iva)}
            {totalesPropuestos.impoconsumo !== null ? ` + impoconsumo ${pesos(totalesPropuestos.impoconsumo)}` : ""} = {pesos(totalesPropuestos.total)}.{" "}
            <button type="button" className="text-acento hover:underline" onClick={recalcular}>
              Recalcular
            </button>
          </p>
        </Tarjeta>

        {!formato.success && <Aviso tono="aviso">{formato.error.issues.map((i) => i.message).filter((m, k, a) => a.indexOf(m) === k).join("; ")}</Aviso>}
        {revision && revision.bloqueantes.length > 0 && (
          <Aviso>{revision.bloqueantes.join("; ")}. Corrígelo mirando la imagen: sin un DV válido no se puede identificar al cliente.</Aviso>
        )}
        {revision && hayIgnorables && (
          <div className="flex flex-col gap-2 rounded-md bg-malo-suave p-3 text-sm" data-prueba="motivos-formulario">
            <p className="text-malo">✕ Esto no cuadra: {revision.ignorables.join("; ")}.</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} data-prueba="confirmar" />
              Revisé la imagen y estos datos son los de la factura
            </label>
          </div>
        )}
        {revision && revision.motivos.length === 0 && <p className="text-sm text-bueno">✓ Todo cuadra.</p>}
        {error && <Aviso>{error}</Aviso>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="boton-primario" disabled={!puedeGuardar || guardando} data-prueba="guardar">
            {guardando ? "Guardando…" : hayIgnorables ? "Guardar de todos modos" : "Guardar y seguir"}
          </button>
          <Link href="/revision" className="text-sm text-acento hover:underline">Volver a la lista</Link>
          <Link href={`/procesos/${detalle.procesoId}`} className="text-sm text-acento hover:underline">Ver el lote</Link>
          {detalle.estado === "aceptada" && <Insignia tono="bueno">Aceptada</Insignia>}
        </div>
      </form>
    </div>
  );
}
