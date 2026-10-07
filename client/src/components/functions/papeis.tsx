/**
 * Peças comuns da tela de Funções (07/10, redesenho).
 *
 * A tela tem DUAS listas de pessoas por função, e quem cadastra precisa saber
 * o efeito de cada uma (regra do dono, 07/10):
 *  - Responsáveis (cadastro normal, `function_managers`) — editam as vagas da
 *    função na Escalação, pedem troca e, desde 07/10, também pedem ajuste em
 *    vaga já escalada;
 *  - Validador e Aprovador (módulo de Escala, `scaling_function_managers`).
 * Os textos moram aqui, uma vez só, e aparecem junto de cada lista (faixa da
 * lista, dica do cabeçalho, diálogo de adicionar). Só texto: a regra é do
 * servidor (`vaga-guards`, `scaling-validation-rules`).
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── O que cada papel permite ────────────────────────────────────────────────
export interface Papel {
  nome: string;
  /** Efeito, começando por verbo no plural ("editam…"). */
  efeito: string;
}

export const PAPEL_RESPONSAVEL: Papel = {
  nome: "Responsáveis",
  efeito: "editam as vagas desta função na Escalação, pedem troca e pedem ajuste em vaga já escalada.",
};
export const PAPEL_VALIDADOR: Papel = {
  nome: "Validador",
  efeito: "valida a escala sugerida da função e pede ajuste.",
};
export const PAPEL_APROVADOR: Papel = {
  nome: "Aprovador",
  efeito: "decide os pedidos e as vagas validadas da função.",
};

// ─── Nome da função ──────────────────────────────────────────────────────────
/**
 * Só a primeira letra em maiúscula. O `capitalize` do CSS fazia
 * "Executivo De Contas" com o "de" que ninguém digitou.
 */
export function nomeDaFuncao(nome: string): string {
  const n = nome.trim();
  return n ? n.charAt(0).toLocaleUpperCase("pt-BR") + n.slice(1) : n;
}

// ─── Pessoa: iniciais com cor estável ────────────────────────────────────────
const CORES_DO_AVATAR: [string, string][] = [
  ["bg-brand-soft", "text-primary"],
  ["bg-success-soft", "text-success"],
  ["bg-warning-soft", "text-warning-strong"],
  ["bg-info-soft", "text-info"],
  ["bg-danger-soft", "text-danger"],
  ["bg-muted", "text-slate-700"],
];

function corDoAvatar(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CORES_DO_AVATAR[h % CORES_DO_AVATAR.length];
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const TAMANHO = { sm: "w-6 h-6 text-[10px]", md: "w-7 h-7 text-2xs", lg: "w-8 h-8 text-2xs" } as const;

export function Avatar({ id, nome, tamanho = "md", className }: { id: string; nome: string; tamanho?: keyof typeof TAMANHO; className?: string }) {
  const [bg, txt] = corDoAvatar(id);
  return (
    <span aria-hidden="true" className={cn("inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none", TAMANHO[tamanho], bg, txt, className)}>
      {iniciais(nome)}
    </span>
  );
}

// ─── Faixa "o que esta lista faz" ────────────────────────────────────────────
export interface ItemDaFaixa {
  icone: LucideIcon;
  papel: Papel;
  /** Classe de cor do ícone. */
  cor?: string;
  /** Frase a mais depois do efeito (ex.: quem é o aprovador padrão). */
  complemento?: ReactNode;
}

/**
 * A faixa que abre a lista e diz, por extenso, o que cada papel permite.
 * Fica colada na lista (não é um aviso solto no topo da tela).
 */
export function FaixaDosPapeis({ itens, extra, className, testid }: { itens: ItemDaFaixa[]; extra?: ReactNode; className?: string; testid?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5 lg:flex-row lg:items-start lg:gap-x-8 px-4 py-3 text-xs leading-5 text-slate-600", className)} data-testid={testid}>
      {itens.map(({ icone: Icone, papel, cor, complemento }) => (
        <p key={papel.nome} className="m-0 flex items-start gap-2 min-w-0 lg:flex-1">
          <Icone className={cn("w-3.5 h-3.5 mt-[3px] shrink-0", cor ?? "text-muted-foreground")} aria-hidden="true" />
          <span className="min-w-0"><strong className="font-semibold text-foreground">{papel.nome}:</strong> {papel.efeito}{complemento && <> {complemento}</>}</span>
        </p>
      ))}
      {extra && <div className="lg:shrink-0">{extra}</div>}
    </div>
  );
}

// ─── Filtro de recorte (segmentado) ──────────────────────────────────────────
export interface OpcaoDoRecorte<K extends string> {
  id: K;
  nome: ReactNode;
  n: number;
  /** Tom do número quando > 0 (ex.: "sem responsável" em alerta). */
  alerta?: boolean;
}

/** Recorte da lista em segmentos com a contagem — mesma anatomia do seletor de visão de Eventos. */
export function FiltroSegmentado<K extends string>({ opcoes, valor, onChange, rotulo, testid }: {
  opcoes: OpcaoDoRecorte<K>[];
  valor: K;
  onChange: (v: K) => void;
  rotulo: string;
  testid: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} data-testid={testid}
      className="inline-flex shrink-0 items-center h-[34px] p-0.5 gap-0.5 rounded-lg border border-border bg-surface-muted">
      {opcoes.map(o => {
        const ativa = valor === o.id;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={ativa} onClick={() => onChange(o.id)}
            data-testid={`${testid}-${o.id}`}
            className={cn(
              "pas-alvo inline-flex items-center gap-1.5 h-full px-2.5 rounded-md text-sm whitespace-nowrap transition-[background-color,color,box-shadow] duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativa ? "bg-card text-foreground font-medium shadow-1" : "text-muted-foreground hover:text-foreground",
            )}>
            {o.nome}
            <span className={cn(
              "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-2xs font-semibold tabular-nums",
              o.alerta && o.n > 0 ? "bg-warning-soft text-warning-strong" : ativa ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground",
            )}>{o.n}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Estilos dos diálogos da tela (a régua do modal de Eventos) ──────────────
/** Cabeçalho: ícone em quadrado da marca, título e descrição; o X no canto. */
export const CABECALHO_DO_DIALOGO = "relative flex items-start gap-3.5 shrink-0 px-5 sm:px-6 pt-4 pb-3.5 pr-14 border-b border-border bg-card";
export const ICONE_DO_DIALOGO = "hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-brand-soft text-primary shrink-0";
export const FECHAR_DO_DIALOGO = "pas-alvo absolute right-3 top-3 flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const RODAPE_DO_DIALOGO = "flex items-center justify-end gap-2 shrink-0 px-5 sm:px-6 py-3 border-t border-border bg-surface-muted";
/** Rótulo de campo — o mesmo de Eventos/Passagens/Hospedagem. */
export const ROTULO = "block mb-1.5 text-xs font-medium text-slate-600";
/** Botão de ação de linha (32px; 44px no toque). */
export const BOTAO_DA_LINHA = "pas-alvo fun-acao relative z-[1] inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed";
/** Botão "+" (adicionar pessoa) — tracejado, vira marca no hover. */
export const BOTAO_ADICIONAR = "pas-alvo relative z-[1] inline-flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-slate-300 text-muted-foreground shrink-0 transition-colors hover:border-primary hover:text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
