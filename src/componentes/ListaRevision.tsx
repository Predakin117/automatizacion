"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiJson } from "./api";
import { pesos } from "./formato";
import { Aviso, Insignia, Tarjeta } from "./ui";

export interface Pendiente {
  hash: string;
  archivo: string;
  numero: string | null;
  proveedor: string | null;
  total: number | null;
  motivos: string[];
}

export function ListaRevision() {
  const [lista, setLista] = useState<Pendiente[] | null>(null);
  const [limite, setLimite] = useState(200);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    apiJson<{ facturas: Pendiente[]; limite: number }>("/api/facturas")
      .then((d) => {
        if (!vivo) return;
        setLista(d.facturas);
        setLimite(d.limite);
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, []);

  if (error) return <Aviso>{error}</Aviso>;
  if (!lista) return <p className="text-muted">Cargando…</p>;
  if (lista.length === 0) {
    return (
      <Tarjeta>
        <p>
          <Insignia tono="bueno">Al día</Insignia> No hay facturas esperando revisión.
        </p>
      </Tarjeta>
    );
  }
  return (
    <Tarjeta titulo={`${lista.length}${lista.length === limite ? "+" : ""} facturas esperan a una persona`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm" data-prueba="lista-revision">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-2 pr-3">Archivo</th>
              <th className="py-2 pr-3">Número</th>
              <th className="py-2 pr-3">Proveedor</th>
              <th className="py-2 pr-3 text-right">Total leído</th>
              <th className="py-2">Por qué la máquina no la aceptó</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((f) => (
              <tr key={f.hash} className="border-t border-borde align-top">
                <td className="py-2 pr-3">
                  <Link href={`/revision/${f.hash}`} className="font-medium text-acento hover:underline">
                    {f.archivo}
                  </Link>
                </td>
                <td className="cifra py-2 pr-3">{f.numero ?? "—"}</td>
                <td className="py-2 pr-3">{f.proveedor ?? "—"}</td>
                <td className="cifra py-2 pr-3 text-right">{pesos(f.total)}</td>
                <td className="py-2 text-xs text-muted">{f.motivos.join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
