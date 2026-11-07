export default function Inicio() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Procesador de facturas</h1>
      <p className="text-lg opacity-80">
        Proyecto base desplegado. Aquí irá la subida de facturas por lotes.
      </p>
      <p className="text-sm opacity-60">
        Diagnóstico del despliegue: <code>/api/salud</code>
      </p>
    </main>
  );
}
