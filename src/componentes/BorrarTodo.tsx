"use client";
import { useState } from "react";
import { postJson } from "./api";
import { Aviso } from "./ui";

/** Borra TODOS los datos de prueba (de todos los usuarios). Exige escribir BORRAR. */
export function BorrarTodo({ alTerminar }: { alTerminar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [forzar, setForzar] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "malo" | "aviso"; texto: string } | null>(null);
  const [borrando, setBorrando] = useState(false);

  async function borrar() {
    setBorrando(true);
    setMensaje(null);
    try {
      const r = await postJson("/api/datos/borrar", { confirmacion: texto, forzar });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string; borrados?: Record<string, number> };
      if (r.status === 409) {
        setForzar(true);
        setMensaje({ tono: "aviso", texto: cuerpo.error ?? "Hay lotes procesándose." });
        return;
      }
      if (!r.ok) {
        setMensaje({ tono: "malo", texto: cuerpo.error ?? `Error ${r.status}` });
        return;
      }
      setAbierto(false);
      setTexto("");
      setForzar(false);
      alTerminar();
    } finally {
      setBorrando(false);
    }
  }

  if (!abierto) {
    return (
      <button type="button" className="boton text-malo" onClick={() => setAbierto(true)}>
        Borrar todo…
      </button>
    );
  }
  return (
    <div role="dialog" aria-label="Borrar todos los datos" className="tarjeta flex max-w-lg flex-col gap-3 border-malo">
      <p className="text-sm">
        <strong className="text-malo">Esto borra TODO lo guardado, de todos los usuarios:</strong> facturas, clientes, índices,
        lotes y los archivos del almacén. Es <strong>irreversible</strong> y gasta el límite diario de borrados de Firestore.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Escribe <code className="font-semibold">BORRAR</code> para confirmar
        <input value={texto} onChange={(e) => setTexto(e.target.value)} className="campo" autoComplete="off" data-prueba="confirmar-borrado" />
      </label>
      {mensaje && <Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso>}
      <div className="flex gap-2">
        <button type="button" className="boton-peligro" disabled={texto !== "BORRAR" || borrando} onClick={() => void borrar()}>
          {borrando ? "Borrando…" : forzar ? "Borrar aunque haya lotes en proceso" : "Borrar todo"}
        </button>
        <button type="button" className="boton" onClick={() => { setAbierto(false); setTexto(""); setForzar(false); setMensaje(null); }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
