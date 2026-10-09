// Extraído de invoices.tsx em 25/09 (modularização): skeleton exibido
// enquanto as consultas do evento carregam (23/09: antes aparecia o vazio
// falso "Nenhum colaborador com Realizado enviado").
//
// 08/10 (redesenho): o esqueleto tem a geometria da tela de verdade — o
// painel das três etapas com a empresa pagadora, as abas, as pílulas e as
// linhas da lista —, com o brilho que passa das telas irmãs (`pas-osso`).
// Nada "pula" quando os dados chegam.

export function InvoicesSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Carregando notas fiscais">
      <span className="sr-only">Carregando notas fiscais…</span>
      <div aria-hidden="true" className="flex flex-col md:flex-row rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-3 flex-1">
          {[0, 1, 2].map(i => (
            <div key={i} className={`px-4 pt-3 pb-3.5 space-y-2 ${i > 0 ? "border-l border-border" : ""}`}>
              <div className="pas-osso h-3.5 w-24 max-w-full" />
              <div className="pas-osso h-5 w-16" />
              <div className="pas-osso h-3 w-20 max-w-full" />
            </div>
          ))}
        </div>
        <div className="md:w-[220px] lg:w-[300px] xl:w-[340px] px-4 py-3 space-y-2 border-t md:border-t-0 md:border-l border-border">
          <div className="pas-osso h-3 w-28" />
          <div className="pas-osso h-4 w-48 max-w-full" />
          <div className="pas-osso h-3 w-36" />
        </div>
      </div>
      <div aria-hidden="true" className="flex items-end gap-5 h-11 border-b border-border">
        <div className="pas-osso h-4 w-28 mb-3" />
        <div className="pas-osso h-4 w-32 mb-3" />
      </div>
      <div aria-hidden="true" className="flex items-center gap-1.5 overflow-hidden">
        {[64, 88, 112, 92, 96].map((w, i) => <div key={i} className="pas-osso h-8 !rounded-full shrink-0" style={{ width: w }} />)}
      </div>
      <div aria-hidden="true" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-10 bg-surface-muted border-b border-border" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
            <div className="pas-osso w-8 h-8 !rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0"><div className="pas-osso h-3.5 w-40 max-w-full" /><div className="pas-osso h-2.5 w-24" /></div>
            <div className="pas-osso h-3.5 w-20 hidden sm:block" />
            <div className="pas-osso h-[22px] w-24 hidden md:block" />
            <div className="pas-osso h-8 w-36 hidden lg:block" />
            <div className="pas-osso h-8 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
