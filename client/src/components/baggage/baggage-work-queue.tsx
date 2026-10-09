/**
 * A fila por companhia aérea.
 *
 * A tela já agregava bagagens por CIA, mas o número só aparecia dentro da aba
 * de relatório — quem estava na lista não via, e não tinha como recortar por
 * companhia. Aqui cada bloco conta E filtra, e reclicar o ativo desliga.
 *
 * 08/10 (redesenho): a MESMA fila de Passagens e Hospedagem
 * (`common/fila-de-trabalho`) — filete da ativa que cresce do centro, fundo de
 * marca na escolhida, 2 × 2 no celular. O avião vem na cor da companhia (a
 * mesma da borda da linha e da etiqueta no bilhete), e o número grande é o de
 * bagagens, com o valor ao lado. Antes o número aparecia duas vezes ("18 · 18
 * bagagens").
 */
import { PlaneTakeoff } from "lucide-react";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import { CIA_ORDEM, formatCurrency, type CiaGroup } from "./baggage-core";
import type { ResumoDaCia } from "./baggage-logic";

/** A cor de texto de cada companhia — a mesma família de `CIA_STYLE`. */
export const CIA_TEXTO: Record<CiaGroup, string> = {
  Azul: "text-info", Gol: "text-warning-strong", TAM: "text-danger", Outros: "text-muted-foreground",
};

export default function BaggageWorkQueue({ contagens, ativa, onEscolher }: {
  contagens: Record<CiaGroup, ResumoDaCia>;
  ativa: CiaGroup | null;
  onEscolher: (c: CiaGroup | null) => void;
}) {
  const blocos: BlocoDaFilaDeTrabalho<CiaGroup>[] = CIA_ORDEM.map((cia) => {
    const r = contagens[cia];
    const bagagens = r.bags === 1 ? "bagagem" : "bagagens";
    return {
      key: cia,
      rotulo: cia,
      n: r.bags,
      sub: r.bags === 0 ? bagagens : `${bagagens} · ${formatCurrency(r.cents)}`,
      titulo: r.records === 0
        ? `Nenhuma bagagem ${cia === "Outros" ? "em outras companhias" : `na ${cia}`} neste recorte`
        : `${r.bags} ${bagagens} em ${r.records} ${r.records === 1 ? "solicitação" : "solicitações"} · ${formatCurrency(r.cents)}${
          ativa === cia ? " — clique de novo para ver todas" : ""}`,
      icone: PlaneTakeoff,
      cor: CIA_TEXTO[cia],
    };
  });

  return (
    <FilaDeTrabalho
      blocos={blocos}
      ativa={ativa}
      onEscolher={onEscolher}
      rotulo="Bagagens por companhia aérea"
      testid={(cia) => `fila-cia-${cia.toLowerCase()}`}
    />
  );
}
