"use client";
import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { authCliente } from "@/lib/firebase/cliente";

function mensajeDeError(codigo: string): string {
  if (codigo.includes("invalid-credential") || codigo.includes("wrong-password") || codigo.includes("user-not-found")) {
    return "Correo o contraseña incorrectos.";
  }
  if (codigo.includes("too-many-requests")) return "Demasiados intentos. Espera unos minutos.";
  if (codigo.includes("network")) return "Sin conexión con Firebase.";
  return "No se pudo iniciar sesión.";
}

/** Solo rutas internas: evita que ?siguiente= mande a otro sitio. */
function destinoSeguro(): string {
  const s = new URLSearchParams(window.location.search).get("siguiente");
  return s && s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export default function Login() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const a = authCliente();
    try {
      // 1. Firebase verifica la contraseña y entrega un ID token (dura 1 hora).
      const credencial = await signInWithEmailAndPassword(a, correo.trim(), clave);
      const idToken = await credencial.user.getIdToken();
      // 2. El servidor lo cambia por una cookie de sesión httpOnly de 5 días.
      const r = await fetch("/api/sesion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!r.ok) {
        const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
        setError(cuerpo.error ?? `Error ${r.status}`);
        return;
      }
      // Recarga completa para que el menú y el proxy vean la cookie nueva.
      window.location.assign(destinoSeguro());
    } catch (err) {
      setError(mensajeDeError(err instanceof Error ? err.message : String(err)));
    } finally {
      // 3. La sesión real vive en la cookie; la de Firebase en el navegador sobra.
      await signOut(a).catch(() => undefined);
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Procesador de facturas</h1>
        <p className="mt-1 text-sm text-muted">Inicia sesión con tu cuenta autorizada.</p>
      </div>
      <form onSubmit={entrar} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Correo
          <input
            type="email"
            required
            autoComplete="username"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            className="campo"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contraseña
          <input
            type="password"
            required
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="campo"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-malo">
            ✕ {error}
          </p>
        )}
        <button type="submit" disabled={enviando} className="boton-primario">
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
