import { Suspense } from "react";
import { VistaProceso } from "@/componentes/VistaProceso";

/** Con cacheComponents, los params (una Promise) se leen dentro de un <Suspense>. */
async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VistaProceso id={id} />;
}

export default function Proceso({ params }: PageProps<"/procesos/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
