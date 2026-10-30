/**
 * Visão geral (30/10) — "Últimas inclusões": o resumo das últimas 24 h (quantas
 * inclusões, mudanças, passagens, hotéis e pedidos) e as linhas mais recentes,
 * com o link para a Atividade recente, que tem o feed inteiro e os filtros.
 */
import { Link } from "wouter";
import { Activity } from "lucide-react";
import type { User } from "@shared/schema";
import type { EtapaDoQuadro } from "@/components/scaling/scaling-analytics-data";
import { ErrorState } from "@/components/common/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ROTULO_DO_TIPO, TIPOS_DA_ATIVIDADE, ehNovo, etapaAtrasadaDoItem, type ItemDaAtividade, type TipoDaAtividade } from "../comum/atividade-tipos";
import { LinhaDaAtividade } from "../comum/linha-da-atividade";
import { AvisoDoBloco, CartaoDoPainel, LinkDoRodape } from "../comum/ui";

export function BlocoDeNovidades({ itens, resumo, total, carregando, erro, onTentarDeNovo, user, ultimaVisita, atrasadas, agora }: {
  itens: ItemDaAtividade[];
  resumo: Record<TipoDaAtividade, number> | null;
  total: number;
  carregando: boolean;
  erro: boolean;
  onTentarDeNovo: () => void;
  user: User | null;
  ultimaVisita: string | null;
  atrasadas: ReadonlyMap<string, EtapaDoQuadro>;
  agora: number;
}) {
  const novos = itens.filter((i) => ehNovo(i, ultimaVisita)).length;
  return (
    <CartaoDoPainel
      id="bloco-novidades"
      icone={Activity}
      tom="primary"
      titulo="Últimas inclusões e mudanças"
      subtitulo="Últimas 24 h · atualiza sozinho a cada minuto"
      testId="bloco-novidades"
      contagem={
        <span className="block leading-tight">
          <span className="block text-xl font-semibold tabular-nums text-primary" data-testid="bloco-novidades-total">{total}</span>
          <span className="block text-2xs text-muted-foreground">em 24 h</span>
        </span>
      }
      acao={<LinkDoRodape href="/paineis/atividade" testId="link-atividade-recente">Ver a atividade recente{novos > 0 ? ` · ${novos} ${novos === 1 ? "nova" : "novas"} desde a sua última visita` : ""}</LinkDoRodape>}
    >
      {resumo && (
        <div className="flex flex-wrap gap-1.5 border-b border-border bg-surface-muted/40 px-4 py-2" data-testid="resumo-novidades">
          {TIPOS_DA_ATIVIDADE.map((t) => (
            <Link
              key={t}
              href={`/paineis/atividade?tipo=${t}&periodo=24h`}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs no-underline hover:border-primary hover:text-primary ${resumo[t] > 0 ? "border-border bg-card text-foreground" : "border-transparent text-muted-foreground"}`}
            >
              <span className="font-semibold tabular-nums">{resumo[t]}</span> {ROTULO_DO_TIPO[t].toLowerCase()}
            </Link>
          ))}
        </div>
      )}
      {erro ? (
        <div className="p-4"><ErrorState title="Não foi possível carregar a atividade" description="Os outros blocos seguem valendo." onRetry={onTentarDeNovo} /></div>
      ) : carregando ? (
        <div className="space-y-3 p-4" aria-hidden="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : itens.length === 0 ? (
        <AvisoDoBloco tom="neutral" testId="bloco-novidades-vazio">Nada mudou nas últimas 24 horas.</AvisoDoBloco>
      ) : (
        <ul className="m-0 p-0">
          {itens.map((item) => (
            <LinhaDaAtividade
              key={item.id}
              item={item}
              user={user}
              novo={ehNovo(item, ultimaVisita)}
              etapaAtrasada={etapaAtrasadaDoItem(item, atrasadas)}
              compacta
              agora={agora}
            />
          ))}
        </ul>
      )}
    </CartaoDoPainel>
  );
}
