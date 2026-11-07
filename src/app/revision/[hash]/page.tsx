import { Suspense } from "react";
import { RevisionFactura } from "@/componentes/FormularioFactura";

async function Contenido({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  return <RevisionFactura hash={hash} />;
}

export default function RevisarFactura({ params }: PageProps<"/revision/[hash]">) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Revisar factura</h1>
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
