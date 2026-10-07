/**
 * Faixa de situação dos Colaboradores (07/10 — no lugar dos cinco cartões de
 * contagem, extraídos de pages/collaborator-management.tsx em 25/09).
 *
 * A mesma peça da Hospedagem e de Passagens (`common/fila-de-trabalho`): cada
 * bloco conta E filtra a lista pela situação; reclicar desliga. Os números
 * respeitam o tipo e a busca atuais — o que o bloco promete é o que a lista
 * mostra. Total, freelancers, casa e local (os outros cartões) foram para o
 * resumo da barra da tela e para o seletor de tipo, com o número de cada um.
 */
import { Ban, Clock, ShieldCheck, XCircle } from "lucide-react";
import { FilaDeTrabalho, type BlocoDaFilaDeTrabalho } from "@/components/common/fila-de-trabalho";
import type { CollaboratorsList } from "./use-collaborators-list";

type Situacao = "pendente" | "aprovado" | "rejeitado" | "inativo";

export function CollaboratorsStats({ porStatus, ativa, onEscolher }: {
  porStatus: CollaboratorsList["porStatus"];
  /** Situação filtrada agora (`all` = nenhuma). */
  ativa: string;
  onEscolher: (status: string) => void;
}) {
  const blocos: BlocoDaFilaDeTrabalho<Situacao>[] = [
    { key: "pendente",  rotulo: "Pendentes",  n: porStatus.pendente,  sub: "aguardando aprovação", icone: Clock,       cor: "text-warning-strong", titulo: "Cadastros esperando aprovação ou rejeição" },
    { key: "aprovado",  rotulo: "Aprovados",  n: porStatus.aprovado,  sub: "cadastros liberados",  icone: ShieldCheck, cor: "text-success",        titulo: "Cadastros aprovados (ativos e inativos)" },
    { key: "rejeitado", rotulo: "Rejeitados", n: porStatus.rejeitado, sub: "não entram na escala", icone: XCircle,     cor: "text-danger",         titulo: "Cadastros rejeitados na aprovação" },
    { key: "inativo",   rotulo: "Inativos",   n: porStatus.inativo,   sub: "fora das escalações",  icone: Ban,         cor: "text-muted-foreground", titulo: "Inativados — não aparecem nas escalações, mas seguem no histórico" },
  ];
  const situacaoAtiva = (["pendente", "aprovado", "rejeitado", "inativo"] as const).find(k => k === ativa) ?? null;
  return (
    <FilaDeTrabalho
      blocos={blocos}
      ativa={situacaoAtiva}
      onEscolher={(k) => onEscolher(k ?? "all")}
      rotulo="Situação dos cadastros"
      testid={(k) => `col-fila-${k}`}
    />
  );
}
