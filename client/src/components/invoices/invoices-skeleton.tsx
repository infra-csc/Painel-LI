// Extraído de invoices.tsx em 25/09 (modularização): skeleton exibido
// enquanto as consultas do evento carregam (23/09: antes aparecia o vazio
// falso "Nenhum colaborador com Realizado enviado").

export function InvoicesSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label="Carregando notas fiscais">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-card rounded-xl border border-border px-5 py-4 animate-pulse motion-reduce:animate-none flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-border shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-3 bg-border rounded w-40 max-w-full" />
            <div className="h-2.5 bg-muted rounded w-24" />
          </div>
          <div className="h-6 w-24 bg-muted rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}
