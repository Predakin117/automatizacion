"use client";
import Link from "next/link";
import { useState } from "react";
import { calcularTasas, proveedoresOrdenados, sumarMetricas } from "@/lib/procesamiento/metricas";
import { terminados } from "@/lib/modelo/vista";
import { BorrarTodo } from "./BorrarTodo";
import { entero, fechaHora, pesos, porcentaje } from "./formato";
import { useMetricas } from "./useMetricas";
import { Aviso, Barra, BarraDoble, Cifra, EstadoLote, Tarjeta } from "./ui";

function Medidor({ titulo, icono, pct, n, total, tono }: { titulo: string; icono: string; pct: number; n: number; total: number; tono: "bueno" | "malo" }) {
  return (
    <div className="tarjeta flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={tono === "bueno" ? "text-bueno" : "text-malo"} aria-hidden>{icono}</span>
        {titulo}
      </div>
      <span className={`cifra text-4xl font-semibold ${tono === "bueno" ? "text-bueno" : "text-malo"}`}>{porcentaje(pct)}</span>
      <Barra valor={n} total={total} tono={tono} alto="h-3" />
      <span className="text-sm text-muted">
        <span className="cifra">{entero(n)}</span> de <span className="cifra">{entero(total)}</span> facturas
      </span>
    </div>
  );
}

export function PanelMetricas() {
  const { datos, error, recargar } = useMetricas();
  const [seleccion, setSeleccion] = useState("todos");

  if (error) return <Aviso>{error}</Aviso>;
  if (!datos) return <p className="text-muted">Cargando métricas…</p>;
  const { procesos } = datos;
  if (procesos.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-muted">Aún no hay lotes. <Link href="/" className="text-acento hover:underline">Procesa facturas</Link> para ver métricas.</p>
        <BorrarTodo alTerminar={() => void recargar()} />
      </div>
    );
  }

  const elegidos = seleccion === "todos" ? procesos : procesos.filter((p) => p.id === seleccion);
  const m = sumarMetricas(elegidos.map((p) => p.metricas));
  const t = calcularTasas(m);
  const proveedores = proveedoresOrdenados(m);
  const maxProveedor = proveedores[0]?.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <label className="flex items-center gap-2 text-sm">
        Ver
        <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)} className="campo" data-prueba="selector-lote">
          <option value="todos">Todos los lotes ({procesos.length})</option>
          {procesos.map((p, i) => (
            <option key={p.id} value={p.id}>
              Lote {i + 1}: {p.carpeta}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <Medidor titulo="Leídas correctamente" icono="✓" pct={t.pctCorrectas} n={t.correctas} total={t.procesadas} tono="bueno" />
        <Medidor titulo="Mal leídas (a revisión)" icono="✕" pct={t.pctMalLeidas} n={t.malLeidas} total={t.procesadas} tono="malo" />
      </div>
      <p className="text-xs text-muted">
        <strong>Leída correctamente</strong> = pasó todas las validaciones (no se compara con una respuesta conocida: un error que
        cuadre aritméticamente podría pasar). <strong>Mal leída</strong> = quedó en revisión o dio error. Los porcentajes son sobre las
        facturas distintas procesadas; las duplicadas no cuentan porque ya estaban. Lo revisado a mano no cambia estos porcentajes.
      </p>
      {t.malLeidas > 0 && (
        <p className="text-sm">
          De las <span className="cifra">{entero(t.malLeidas)}</span> mal leídas, <span className="cifra text-bueno">{entero(t.revisadasAMano)}</span> ya
          se revisaron a mano y <span className="cifra text-malo">{entero(t.pendientesDeRevision)}</span> esperan a una persona.{" "}
          {t.pendientesDeRevision > 0 && <Link href="/revision" className="text-acento hover:underline">Revisarlas →</Link>}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Cifra etiqueta="Facturas procesadas" valor={entero(t.procesadas)} />
        <Cifra etiqueta="Duplicadas" valor={entero(m.duplicadas)} nota="ya estaban guardadas" />
        <Cifra etiqueta="Clientes en la base" valor={entero(datos.clientes)} nota={`${entero(m.clientesNuevos)} nuevos en ${seleccion === "todos" ? "estos lotes" : "este lote"}`} />
      </div>

      <Tarjeta titulo="Lo procesado (aceptadas por la máquina + revisadas a mano)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cifra etiqueta="Antes de IVA" valor={pesos(t.procesado.subtotal)} />
          <Cifra etiqueta="IVA" valor={pesos(t.procesado.iva)} />
          <Cifra etiqueta="Impoconsumo" valor={pesos(t.procesado.impoconsumo)} />
          <Cifra etiqueta="Total" valor={pesos(t.procesado.total)} />
        </div>
        {t.pendientesDeRevision > 0 && (
          <p className="mt-3 text-xs text-muted">No incluye las {entero(t.pendientesDeRevision)} facturas que siguen en revisión.</p>
        )}
      </Tarjeta>

      <Tarjeta titulo="Por razón social">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-2 pr-3">Proveedor</th>
                <th className="py-2 pr-3">NIT</th>
                <th className="py-2 pr-3 text-right">Facturas</th>
                <th className="py-2 pr-3 text-right">Antes de IVA</th>
                <th className="py-2 pr-3 text-right">IVA</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="w-32 py-2" />
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.nit} className="border-t border-borde">
                  <td className="py-2 pr-3">{p.nombre}</td>
                  <td className="cifra py-2 pr-3">{p.nit}</td>
                  <td className="cifra py-2 pr-3 text-right">{p.n}</td>
                  <td className="cifra py-2 pr-3 text-right">{pesos(p.subtotal)}</td>
                  <td className="cifra py-2 pr-3 text-right">{pesos(p.iva)}</td>
                  <td className="cifra py-2 pr-3 text-right font-medium">{pesos(p.total)}</td>
                  <td className="py-2"><Barra valor={p.total} total={maxProveedor} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Por lote">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" data-prueba="tabla-lotes">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-2 pr-3">Lote</th>
                <th className="py-2 pr-3">Inicio</th>
                <th className="py-2 pr-3 text-right">Correctas</th>
                <th className="py-2 pr-3 text-right">Mal leídas</th>
                <th className="w-28 py-2 pr-3" />
                <th className="py-2 pr-3 text-right">Total aceptado</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {procesos.map((p, i) => {
                const tp = calcularTasas(p.metricas);
                return (
                  <tr key={p.id} className="border-t border-borde">
                    <td className="py-2 pr-3">
                      <span className="text-muted">{i + 1}.</span> {p.carpeta}
                    </td>
                    <td className="py-2 pr-3 text-muted">{fechaHora(p.inicio)}</td>
                    <td className="cifra py-2 pr-3 text-right text-bueno">✓ {tp.correctas} ({porcentaje(tp.pctCorrectas)})</td>
                    <td className="cifra py-2 pr-3 text-right text-malo">✕ {tp.malLeidas} ({porcentaje(tp.pctMalLeidas)})</td>
                    <td className="py-2 pr-3"><BarraDoble buenas={tp.correctas} malas={tp.malLeidas} /></td>
                    <td className="cifra py-2 pr-3 text-right">{pesos(tp.procesado.total)}</td>
                    <td className="py-2 pr-3">
                      <EstadoLote estado={p.estado} />
                      {p.estado !== "terminado" && <span className="cifra ml-1 text-xs text-muted">{terminados(p)}/{p.totalArchivos}</span>}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {p.rutaExcel && <a href={`/api/procesos/${p.id}/excel`} className="mr-3 text-acento hover:underline">Excel</a>}
                      <Link href={`/procesos/${p.id}`} className="text-acento hover:underline">Detalle</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div>
        <BorrarTodo alTerminar={() => void recargar()} />
      </div>
    </div>
  );
}
