/**
 * Painéis (30/10) — Painel da escala: atrasos por evento, decisões esperando
 * e eventos lado a lado. O conteúdo mora em components/paineis/escala/.
 */
import { usePageTitle } from "@/components/common/use-page-title";
import { PageHeader } from "@/components/common/page-header";
import { usePainelEscala } from "@/components/paineis/escala/use-painel-escala";
import { PainelDaEscala, SeletorDeAba, useEstadoNaUrl } from "@/components/paineis/escala/painel-da-escala";

export default function PaineisEscalaPage() {
  usePageTitle("Painel da escala");
  const p = usePainelEscala();
  const url = useEstadoNaUrl();
  const dm = `${String(p.hoje.getDate()).padStart(2, "0")}/${String(p.hoje.getMonth() + 1).padStart(2, "0")}`;
  return (
    <div className="-mx-[var(--page-gutter)] -mt-[var(--page-gutter)]">
      <PageHeader
        variant="bar"
        title="Painel da escala"
        subtitle={`Atrasos, decisões esperando e eventos lado a lado · prazos contados de ${dm}`}
        tabs={<SeletorDeAba aba={url.aba} onAba={url.setAba} />}
        className="mx-0 mt-0"
      />
      <div className="px-[var(--page-gutter)] pt-5">
        <div className="mx-auto max-w-[1560px]">
          <PainelDaEscala p={p} aba={url.aba} onAba={url.setAba} eventos={url.eventos} onEventos={url.setEventos} />
        </div>
      </div>
    </div>
  );
}
