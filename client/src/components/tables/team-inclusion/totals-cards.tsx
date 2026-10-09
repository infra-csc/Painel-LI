/**
 * Resumo das vagas da Inclusão de equipe (25/09 — extraído da tabela).
 * Cada bloco é um atalho de UM recorte por vez; o multi fica na barra de filtros.
 *
 * 07/10 (redesenho): eram oito cartões coloridos com filete em cima, número de
 * 24px e "hover que sobe" — o "dashboard genérico" que as outras telas da
 * Logística já deixaram. Agora é a MESMA faixa de Passagens/Hospedagem/Eventos
 * (`common/fila-de-trabalho`), em dois grupos que dizem o que contam:
 *   · Escalação — todas, pendentes (sem colaborador), escaladas, canceladas;
 *   · Logística — aguardando passagem/hospedagem e já compradas.
 * Mesmos oito números, mesmos recortes, mesmos `data-testid`; reclicar o
 * aceso desliga (volta a "Total").
 */
import { Ban, BedDouble, CircleDashed, Hotel, Layers, Plane, PlaneTakeoff, UserCheck } from "lucide-react";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import type { InclusionFilters, TeamInclusionData } from "./use-team-inclusion-data";

type Chave = "all" | "pending" | "escalated" | "cancelado" | "passagem" | "hospedagem" | "passagem_comprada" | "hospedagem_comprada";
const TIPO: Record<Chave, "all" | "escalation" | "status"> = {
  all: "all", pending: "escalation", escalated: "escalation", cancelado: "escalation",
  passagem: "status", hospedagem: "status", passagem_comprada: "status", hospedagem_comprada: "status",
};
const TESTID: Record<Chave, string> = {
  all: "total-incluidos", pending: "total-pendentes", escalated: "total-escalados", cancelado: "total-cancelados",
  passagem: "total-passagem", hospedagem: "total-hospedagem", passagem_comprada: "total-passagem-comprada", hospedagem_comprada: "total-hospedagem-comprada",
};

const vagas = (n: number) => (n === 1 ? "vaga" : "vagas");

export function TotalsCards({ totals: t, filters, setFilters }: {
  totals: TeamInclusionData["totals"];
  filters: InclusionFilters;
  setFilters: React.Dispatch<React.SetStateAction<InclusionFilters>>;
}) {
  // Qual bloco está aceso: só com UM valor marcado (o multi é da barra).
  const ativa: Chave | null =
    filters.status.length === 0 && filters.escalationStatus.length === 0 ? "all"
    : filters.status.length === 1 && filters.escalationStatus.length === 0 && TIPO[filters.status[0] as Chave] === "status" ? (filters.status[0] as Chave)
    : filters.escalationStatus.length === 1 && filters.status.length === 0 && TIPO[filters.escalationStatus[0] as Chave] === "escalation" ? (filters.escalationStatus[0] as Chave)
    : null;

  const escolher = (k: Chave | null) => {
    if (!k || k === "all" || k === ativa) {
      setFilters(f => ({ ...f, status: [], escalationStatus: [] }));
    } else if (TIPO[k] === "status") {
      setFilters(f => ({ ...f, status: [k], escalationStatus: [] }));
    } else {
      setFilters(f => ({ ...f, escalationStatus: [k], status: [] }));
    }
  };

  const escalacao: BlocoDaFilaDeTrabalho<Chave>[] = [
    { key: "all", rotulo: "Total", n: t.incluidos, icone: Layers, cor: "text-muted-foreground", sub: vagas(t.incluidos), titulo: `${t.incluidos} vagas no recorte (busca, evento, função e colaborador)` },
    { key: "pending", rotulo: "Pendentes", n: t.pendentes, icone: CircleDashed, cor: "text-warning-strong", sub: "sem colaborador", titulo: `${t.pendentes} vagas sem colaborador nem empreita` },
    { key: "escalated", rotulo: "Escalados", n: t.escalados, icone: UserCheck, cor: "text-success", sub: "com nome ou empreita", titulo: `${t.escalados} vagas com colaborador ou empreita` },
    { key: "cancelado", rotulo: "Cancelados", n: t.cancelados, icone: Ban, cor: "text-muted-foreground", sub: t.cancelados === 1 ? "vaga cancelada" : "vagas canceladas", titulo: `${t.cancelados} vagas canceladas` },
  ];
  const logistica: BlocoDaFilaDeTrabalho<Chave>[] = [
    { key: "passagem", rotulo: "Passagem", n: t.aguardando_passagem, icone: Plane, cor: "text-warning-strong", sub: "aguardando compra", titulo: `${t.aguardando_passagem} vagas aguardando passagem` },
    { key: "hospedagem", rotulo: "Hospedagem", n: t.hospedagem, icone: BedDouble, cor: "text-warning-strong", sub: "aguardando reserva", titulo: `${t.hospedagem} vagas aguardando hospedagem` },
    { key: "passagem_comprada", rotulo: "Pass. comprada", n: t.passagem_comprada, icone: PlaneTakeoff, cor: "text-success", sub: "emitidas", titulo: `${t.passagem_comprada} vagas com passagem comprada` },
    { key: "hospedagem_comprada", rotulo: "Hosp. comprada", n: t.hospedagem_comprada, icone: Hotel, cor: "text-success", sub: "reservadas", titulo: `${t.hospedagem_comprada} vagas com hospedagem comprada` },
  ];

  const ativaDe = (grupo: BlocoDaFilaDeTrabalho<Chave>[]) => (ativa && grupo.some(b => b.key === ativa) ? ativa : null);
  return (
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2.5" data-testid="resumo-vagas">
      <FilaDeTrabalho blocos={escalacao} ativa={ativaDe(escalacao)} onEscolher={escolher} rotulo="Resumo da escalação — cada indicador filtra a lista" testid={(k) => TESTID[k]} />
      <FilaDeTrabalho blocos={logistica} ativa={ativaDe(logistica)} onEscolher={escolher} rotulo="Resumo da logística — cada indicador filtra a lista" testid={(k) => TESTID[k]} />
    </div>
  );
}
