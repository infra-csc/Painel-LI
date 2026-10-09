/**
 * Lista de Usuários — tabela larga que vira cartão no estreito (08/10).
 *
 * A troca é pela LARGURA ÚTIL (o menu compacto muda o espaço sem mudar a
 * janela): abaixo de ~960px viram cartões, em duas colunas a partir de 600px.
 * Linha e cartão mostram a mesma coisa: quem é (nome + e-mail), o perfil, o
 * que o perfil abre, a situação da conta, desde quando, e as ações.
 *
 * O nome é o botão que abre a edição, e o ::after dele cobre a linha inteira
 * (clicar em qualquer ponto abre; o teclado chega pelo nome). Mapa de acesso e
 * ações ficam por cima (`relative z-[1]`).
 */
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import type { User } from "@shared/schema";
import { DataTable, type ColunaDaTabela } from "@/components/common/data-table";
import { useLarguraUtil } from "@/components/common/use-largura-util";
import { cn } from "@/lib/utils";
import { dataCurta, estadoDaConta, nomeDaPessoa } from "./acesso";
import { AvatarDoUsuario, MapaDeAcesso, PerfilDoUsuario, SituacaoDaConta } from "./pecas";

export const PAGE_SIZE = 25;
const TD = "px-4 py-3 align-middle";

export interface PropsDaLista {
  rows: User[];
  /** Id de quem está logado — ganha a etiqueta "Você". */
  meuId?: string;
  onAbrir: (u: User) => void;
  /** Ações da conta. `rotulado`: com texto (cartão). */
  acoes: (u: User, rotulado: boolean) => ReactNode;
  emptyState: ReactNode;
  rodape?: ReactNode;
}

function NomeQueAbre({ u, onAbrir, className }: { u: User; onAbrir: (u: User) => void; className?: string }) {
  const nome = nomeDaPessoa(u.name);
  return (
    <button
      type="button"
      onClick={() => onAbrir(u)}
      title={nome}
      className={cn("usr-abrir block max-w-full truncate text-left text-sm font-semibold leading-5 text-foreground rounded-sm focus-visible:outline-none", className)}
      data-testid={`text-user-name-${u.id}`}
    >
      {nome}
    </button>
  );
}

function Voce() {
  return <span className="shrink-0 inline-flex items-center h-[18px] px-1.5 rounded bg-brand-soft text-2xs font-semibold text-primary">Você</span>;
}

/** Selo da permissão especial (aprova cenotécnica) — fica junto do perfil. */
export function SeloCenotecnica() {
  return (
    <span className="inline-flex items-center gap-1 h-[22px] px-1.5 rounded-md border border-primary/25 text-2xs font-medium text-primary whitespace-nowrap" title="Pode aprovar escalações de cenotécnica">
      <ShieldCheck className="w-3 h-3" aria-hidden="true" /> Aprova cenotécnica
    </span>
  );
}

function celulaUsuario(u: User, props: Pick<PropsDaLista, "meuId" | "onAbrir">) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <AvatarDoUsuario nome={u.name} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <NomeQueAbre u={u} onAbrir={props.onAbrir} />
          {u.id === props.meuId && <Voce />}
        </div>
        <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground" data-testid={`text-user-email-${u.id}`}>{u.email}</p>
      </div>
    </div>
  );
}

function celulaPerfil(u: User) {
  return (
    <div className="flex flex-col items-start gap-1">
      <PerfilDoUsuario role={u.role} />
      {u.area?.trim() && <span className="max-w-full truncate text-xs text-muted-foreground" title={`Área: ${u.area}`}>{u.area}</span>}
    </div>
  );
}

function celulaAcesso(u: User) {
  return (
    <div className="flex flex-col items-start gap-1">
      <MapaDeAcesso u={u} nome={nomeDaPessoa(u.name)}
        extra={u.canApproveCenotecnica ? <>Permissão especial: <strong className="font-semibold text-foreground">aprova escalações de cenotécnica</strong>.</> : undefined} />
      {u.canApproveCenotecnica && <SeloCenotecnica />}
    </div>
  );
}

/** Situação da conta e, embaixo, desde quando ela existe (data do cadastro). */
function celulaSituacao(u: User) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <SituacaoDaConta u={u} />
      <span className="usr-esmaece text-2xs text-muted-foreground tabular-nums whitespace-nowrap" title="Data do cadastro">desde {dataCurta(u.createdAt)}</span>
    </div>
  );
}

const Linha = ({ u, ...props }: Omit<PropsDaLista, "rows" | "emptyState" | "rodape"> & { u: User }) => {
  const estado = estadoDaConta(u);
  const apagada = estado === "inativo" || estado === "rejeitado";
  return (
    <tr className={cn("usr-linha border-t border-border first:border-t-0", estado === "pendente" && "usr-pendente", apagada && "usr-apagada")} data-testid={`usr-linha-${u.id}`}>
      <td className={cn(TD, "pl-5 usr-esmaece")}>{celulaUsuario(u, props)}</td>
      <td className={cn(TD, "usr-esmaece")}>{celulaPerfil(u)}</td>
      <td className={cn(TD, "usr-esmaece")}>{celulaAcesso(u)}</td>
      <td className={TD}>{celulaSituacao(u)}</td>
      <td className={cn(TD, "pl-2 pr-4")}>{props.acoes(u, false)}</td>
    </tr>
  );
};

function Cartao({ u, ...props }: Omit<PropsDaLista, "rows" | "emptyState" | "rodape"> & { u: User }) {
  const estado = estadoDaConta(u);
  const apagada = estado === "inativo" || estado === "rejeitado";
  return (
    <article className={cn("usr-cartao relative flex flex-col gap-3 h-full rounded-xl border border-border bg-card px-3.5 pt-3 pb-2.5", estado === "pendente" && "usr-pendente", apagada && "usr-apagada")}
      data-testid={`usr-cartao-${u.id}`}>
      <div className="usr-esmaece flex items-start gap-3 min-w-0">
        <AvatarDoUsuario nome={u.name} tamanho="lg" className="!w-10 !h-10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <NomeQueAbre u={u} onAbrir={props.onAbrir} className="text-[15px]" />
            {u.id === props.meuId && <Voce />}
          </div>
          <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground" data-testid={`text-user-email-${u.id}`}>{u.email}</p>
        </div>
        <span className="shrink-0 pt-0.5"><SituacaoDaConta u={u} /></span>
      </div>
      <div className="usr-esmaece flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <PerfilDoUsuario role={u.role} />
          {u.area?.trim() && <span className="truncate text-xs text-muted-foreground">{u.area}</span>}
        </span>
        {u.canApproveCenotecnica && <SeloCenotecnica />}
        <MapaDeAcesso u={u} nome={nomeDaPessoa(u.name)} />
      </div>
      <div className="relative z-[1] mt-auto flex items-center gap-2 border-t border-border pt-2 -mx-1">
        <span className="usr-esmaece pl-1 text-2xs text-muted-foreground tabular-nums whitespace-nowrap">
          Desde {dataCurta(u.createdAt)}
        </span>
        <div className="ml-auto">{props.acoes(u, true)}</div>
      </div>
    </article>
  );
}

export function UsuariosLista({ rows, emptyState, rodape, ...props }: PropsDaLista) {
  const { ref, largura } = useLarguraUtil<HTMLDivElement>();
  // Antes da primeira medida, a janela decide (evita a tabela piscar no celular).
  const util = largura ?? (typeof window !== "undefined" ? window.innerWidth - 32 : 1200);
  const emCartoes = util < 960;
  const duasColunas = emCartoes && util >= 600;

  const columns: ColunaDaTabela<User>[] = [
    // Larguras em % (somam 77%) + Ações em px: cabe a partir de 960px e
    // reparte a sobra no monitor largo, sem um buraco depois do e-mail.
    { key: "usuario", header: "Usuário", papel: "principal", headerClassName: "pl-5 w-[30%]", cell: u => celulaUsuario(u, props) },
    { key: "perfil", header: "Perfil", headerClassName: "w-[17%]", cell: celulaPerfil },
    { key: "acesso", header: "Acesso", headerClassName: "w-[17%]", headerTip: "Telas que o perfil abre, por grupo do menu: Cadastros, Operacional, Financeiro e Gestão", cell: celulaAcesso },
    { key: "situacao", header: "Situação", headerClassName: "w-[13%]", headerTip: "Situação da conta e desde quando ela existe", cell: celulaSituacao },
    { key: "acoes", header: "Ações", align: "right", width: 212, papel: "acoes", headerClassName: "pr-4", cell: u => props.acoes(u, false) },
  ];

  return (
    <div ref={ref} className="min-w-0">
      {rows.length === 0 ? emptyState : emCartoes ? (
        <>
          <DataTable columns={columns} rows={rows} getRowId={u => u.id} caption="Usuários do sistema"
            cardMode="always" cardListClassName={cn("gap-2", duasColunas && "grid grid-cols-2")}
            cardRender={u => <Cartao u={u} {...props} />} data-testid="usr-cartoes" />
          {rodape && <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden">{rodape}</div>}
        </>
      ) : (
        <div className="usr-moldura rounded-xl border border-border bg-card">
          <DataTable columns={columns} rows={rows} getRowId={u => u.id} caption="Usuários do sistema"
            cardMode="never" density="compact" className="usr-rolagem" tableClassName="usr-tabela table-fixed"
            rowRender={u => <Linha key={u.id} u={u} {...props} />} data-testid="usr-tabela" />
          {rodape}
        </div>
      )}
    </div>
  );
}

export function PaginacaoDeUsuarios({ total, pagina, totalDePaginas, irPara }: { total: number; pagina: number; totalDePaginas: number; irPara: (p: number) => void }) {
  const seta = "pas-alvo w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-card text-slate-600 hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  // Janela de até 5 números que acompanha a página atual.
  const janela = Math.min(totalDePaginas, 5);
  const inicio = Math.max(1, Math.min(pagina - Math.floor(janela / 2), totalDePaginas - janela + 1));
  const de = Math.min((pagina - 1) * PAGE_SIZE + 1, total);
  const ate = Math.min(pagina * PAGE_SIZE, total);
  return (
    <div className="px-4 sm:px-5 py-2.5 border-t border-border bg-surface-muted rounded-b-xl flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-testid="usr-paginacao">
      <p className="m-0 text-xs text-muted-foreground tabular-nums">
        <span className="font-medium text-slate-700">{de}–{ate}</span> de <span className="font-medium text-slate-700">{total}</span> {total === 1 ? "usuário" : "usuários"}
      </p>
      {totalDePaginas > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginação">
          <button type="button" onClick={() => irPara(Math.max(1, pagina - 1))} disabled={pagina === 1} aria-label="Página anterior" className={seta}>
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          {Array.from({ length: janela }, (_, i) => inicio + i).map(p => (
            <button key={p} type="button" onClick={() => irPara(p)} aria-label={`Página ${p}`} aria-current={pagina === p ? "page" : undefined}
              className={cn(
                "pas-alvo min-w-8 h-8 px-2 flex items-center justify-center rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pagina === p ? "bg-primary text-primary-foreground font-semibold" : "text-slate-600 hover:bg-muted",
              )}>
              {p}
            </button>
          ))}
          <button type="button" onClick={() => irPara(Math.min(totalDePaginas, pagina + 1))} disabled={pagina === totalDePaginas} aria-label="Próxima página" className={seta}>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
