/**
 * Histórico de emissões (29/10, deck do dono) — aba de CONSULTA em Contratos
 * (CNPJ): as empresas pelas quais um colaborador já emitiu nota. Não é
 * relatório e não grava nada. Busca o colaborador pelo nome, mostra cada
 * empresa (CNPJ, razão social, eventos, notas, primeira e última data, valor)
 * e, ao abrir, os eventos com data, valor e situação da nota.
 * Regra (o que conta, qual CNPJ, qual data): shared/historico-de-emissoes.ts.
 */
import { useMemo, useState } from "react";
import { Building2, ChevronDown, CloudOff, FileX2, Search, UserSearch, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Collaborator } from "@shared/schema";
import { normalizarBusca } from "@shared/contratos";
import { STATUS_DE_EMISSAO_LABEL, type StatusDeEmissao } from "@shared/historico-de-emissoes";
import { StatusBadge } from "@/components/common/status-badge";
import { BotaoTentarDeNovo, EstadoDaValidacao } from "@/components/scaling-validation/validation-page/estados";
import { MOLDURA } from "@/components/scaling-approval/tokens";
import { Button } from "@/components/ui/button";
import { formatarMoeda, toTitleCase } from "@/lib/format";
import { apiErrorMessage, cn } from "@/lib/utils";
import { useHistoricoDeEmissoes, type EmpresaEmitente } from "./api";
import { dataBr } from "./pecas";

const MAX_SUGESTOES = 8;
const TH = "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
const valorTexto = (e: { valorTotal: number; semValor: number; notas: number }) =>
  e.semValor === e.notas ? "—" : formatarMoeda(e.valorTotal);

function Escolha({ onEscolher }: { onEscolher: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const { data: todos = [], isLoading } = useQuery<Collaborator[]>({ queryKey: ["/api/collaborators"], staleTime: 60_000 });
  const sugestoes = useMemo(() => {
    const q = normalizarBusca(busca);
    if (!q) return [];
    return todos.filter((c) => normalizarBusca(c.fullName).includes(q) || String(c.collaboratorNumber) === busca.trim()).slice(0, MAX_SUGESTOES);
  }, [busca, todos]);
  return (
    <div className="w-full max-w-[460px] space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && busca) { e.preventDefault(); setBusca(""); } }}
          placeholder={isLoading ? "Carregando colaboradores…" : "Buscar colaborador pelo nome"}
          aria-label="Buscar colaborador para ver o histórico de emissões"
          className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary focus:ring-[3px] focus:ring-primary/12"
          data-testid="ctr-emissoes-busca"
        />
      </div>
      {busca.trim() && (
        <ul className="ctr-entra max-h-[260px] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-1" role="listbox" aria-label="Colaboradores encontrados">
          {sugestoes.length === 0 && <li className="px-3 py-2.5 text-xs text-muted-foreground">Ninguém com “{busca.trim()}”.</li>}
          {sugestoes.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button type="button" onClick={() => { onEscolher(c.id); setBusca(""); }} data-testid={`ctr-emissoes-sugestao-${c.id}`}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none">
                <span className="min-w-0 flex-1 break-words">{toTitleCase(c.fullName)}</span>
                <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">nº {c.collaboratorNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Eventos({ e, onAbrirContrato }: { e: EmpresaEmitente; onAbrirContrato: (id: string) => void }) {
  return (
    <div className="space-y-2.5 bg-surface-muted/50 px-3.5 py-3 sm:px-4" data-testid={`ctr-emissoes-eventos-${e.cnpj}`}>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card" aria-label={`Notas emitidas por ${e.razaoSocial}`}>
        {e.emissoes.map((m) => (
          <li key={m.notaId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
            <span className="min-w-0 flex-[1_1_220px] break-words text-sm font-medium leading-5 text-foreground">{m.eventoNome}</span>
            <span className="w-[84px] shrink-0 text-xs tabular-nums text-slate-700">{dataBr(m.data)}</span>
            <span className="w-[104px] shrink-0 text-right text-xs font-medium tabular-nums text-foreground">{m.valor == null ? "—" : formatarMoeda(m.valor)}</span>
            <StatusBadge tone={m.status === "aprovada" ? "success" : "warning"} size="sm">{STATUS_DE_EMISSAO_LABEL[m.status as StatusDeEmissao]}</StatusBadge>
          </li>
        ))}
      </ul>
      {e.contratoId
        ? <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onAbrirContrato(e.contratoId!)}>Ver contrato</Button>
        : <p className="text-2xs text-muted-foreground">Este CNPJ ainda não tem contrato cadastrado.</p>}
    </div>
  );
}

function Numeros({ e }: { e: EmpresaEmitente }) {
  return (
    <>
      <span>{plural(e.eventos, "evento", "eventos")}</span>
      <span>{plural(e.notas, "nota", "notas")}</span>
    </>
  );
}

export function HistoricoDeEmissoes({ colaboradorId, onEscolher, onAbrirContrato, largo }: {
  colaboradorId: string;
  onEscolher: (id: string) => void;
  onAbrirContrato: (id: string) => void;
  largo: boolean;
}) {
  const q = useHistoricoDeEmissoes(colaboradorId || null);
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const alternar = (cnpj: string) => setAbertas((a) => { const n = new Set(a); if (n.has(cnpj)) n.delete(cnpj); else n.add(cnpj); return n; });

  const regra = (
    <p className="text-2xs text-muted-foreground" data-testid="ctr-emissoes-regra">
      Conta nota enviada ou aprovada (pendente, devolvida e recusada ficam de fora). Nota emitida por terceiro continua com o colaborador como referência.
    </p>
  );

  if (!colaboradorId) {
    return (
      <div className="space-y-4">
        <Escolha onEscolher={onEscolher} />
        <EstadoDaValidacao icone={<UserSearch />} titulo="Escolha um colaborador" testId="ctr-emissoes-inicio"
          texto="Busque pelo nome para ver as empresas pelas quais ele já emitiu nota." />
        {regra}
      </div>
    );
  }
  if (q.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando o histórico de emissões">
        <div className="val-osso h-10 w-full max-w-[460px] rounded-lg" />
        <div className={cn(MOLDURA, "space-y-2 p-4")}>{[0, 1, 2].map((i) => <div key={i} className="val-osso h-11 w-full" />)}</div>
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="space-y-3">
        <EstadoDaValidacao tom="erro" icone={<CloudOff />} titulo="Não foi possível carregar o histórico" texto={apiErrorMessage(q.error, "Verifique sua conexão e tente novamente.")}
          acao={<><BotaoTentarDeNovo onClick={() => q.refetch()} tentando={q.isFetching} /><Button type="button" variant="outline" onClick={() => onEscolher("")}>Trocar colaborador</Button></>} />
      </div>
    );
  }
  const d = q.data!;
  const nome = toTitleCase(d.colaborador.fullName);
  const valor = d.empresas.reduce((s, e) => s + e.valorTotal, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-sm font-semibold text-foreground" data-testid="ctr-emissoes-colaborador">
          <span className="min-w-0 break-words">{nome}</span>
          <span className="shrink-0 text-2xs font-normal tabular-nums text-muted-foreground">nº {d.colaborador.collaboratorNumber}</span>
          <button type="button" onClick={() => onEscolher("")} aria-label="Trocar colaborador" data-testid="ctr-emissoes-trocar"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
        {d.empresas.length > 0 && (
          <p className="text-2xs text-muted-foreground" aria-live="polite">
            {plural(d.empresas.length, "empresa", "empresas")} · {plural(d.totalDeNotas, "nota", "notas")} · {formatarMoeda(valor)}
          </p>
        )}
      </div>
      {regra}
      {d.truncado && <p className="text-2xs font-medium text-warning" role="status">Há mais notas que o limite da consulta: aparecem as 1.000 mais recentes.</p>}

      {d.empresas.length === 0 ? (
        <EstadoDaValidacao icone={<FileX2 />} titulo={`Nenhuma emissão de ${nome}`} testId="ctr-emissoes-vazio"
          texto="Este colaborador ainda não tem nota enviada ou aprovada com CNPJ válido." />
      ) : largo ? (
        <div className={cn(MOLDURA, "overflow-hidden")}>
          <table className="w-full table-fixed text-sm" data-testid="ctr-emissoes-tabela">
            <caption className="sr-only">Empresas pelas quais {nome} já emitiu nota</caption>
            <thead className="border-b border-border bg-surface-muted">
              <tr>
                <th scope="col" className={TH}>Empresa</th>
                <th scope="col" className={cn(TH, "w-[88px]")}>Eventos</th>
                <th scope="col" className={cn(TH, "w-[72px]")}>Notas</th>
                <th scope="col" className={cn(TH, "w-[112px]")}>Primeira</th>
                <th scope="col" className={cn(TH, "w-[112px]")}>Última</th>
                <th scope="col" className={cn(TH, "w-[140px] text-right")}>Valor total</th>
                <th scope="col" className={cn(TH, "w-[48px]")}><span className="sr-only">Abrir</span></th>
              </tr>
            </thead>
            {d.empresas.map((e) => {
              const aberta = abertas.has(e.cnpj);
              return (
                <tbody key={e.cnpj} className="border-b border-border last:border-b-0" data-testid={`ctr-emissoes-empresa-${e.cnpj}`}>
                  <tr className="cursor-pointer bg-card hover:bg-surface-muted/60" onClick={() => alternar(e.cnpj)}>
                    <td className="px-3 py-3">
                      <button type="button" aria-expanded={aberta} onClick={(ev) => { ev.stopPropagation(); alternar(e.cnpj); }}
                        className="block max-w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="line-clamp-2 break-words text-sm font-semibold leading-5 text-foreground">{e.razaoSocial}</span>
                        <span className="block font-mono text-2xs tabular-nums text-muted-foreground">{e.cnpjFormatado}</span>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-xs tabular-nums text-slate-700">{e.eventos}</td>
                    <td className="px-3 py-3 text-xs tabular-nums text-slate-700">{e.notas}</td>
                    <td className="px-3 py-3 text-xs tabular-nums text-slate-700">{dataBr(e.primeiraData)}</td>
                    <td className="px-3 py-3 text-xs tabular-nums text-slate-700">{dataBr(e.ultimaData)}</td>
                    <td className="px-3 py-3 text-right text-xs font-semibold tabular-nums text-foreground">
                      {valorTexto(e)}
                      {e.semValor > 0 && e.semValor < e.notas && <span className="block text-2xs font-normal text-muted-foreground">{e.semValor} sem valor</span>}
                    </td>
                    <td className="px-2 py-3 text-right text-muted-foreground"><ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", aberta && "rotate-180")} aria-hidden="true" /></td>
                  </tr>
                  {aberta && <tr><td colSpan={7} className="p-0"><Eventos e={e} onAbrirContrato={onAbrirContrato} /></td></tr>}
                </tbody>
              );
            })}
          </table>
        </div>
      ) : (
        <ul className="grid gap-2.5" data-testid="ctr-emissoes-cartoes">
          {d.empresas.map((e) => {
            const aberta = abertas.has(e.cnpj);
            return (
              <li key={e.cnpj} className={cn(MOLDURA, "overflow-hidden")} data-testid={`ctr-emissoes-empresa-${e.cnpj}`}>
                <button type="button" aria-expanded={aberta} onClick={() => alternar(e.cnpj)}
                  className="block w-full px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="flex items-start gap-2">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold leading-5 text-foreground">{e.razaoSocial}</span>
                      <span className="block font-mono text-2xs tabular-nums text-muted-foreground">{e.cnpjFormatado}</span>
                    </span>
                    <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", aberta && "rotate-180")} aria-hidden="true" />
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-slate-700">
                    <Numeros e={e} />
                    <span>{dataBr(e.primeiraData)}{e.primeiraData !== e.ultimaData && ` → ${dataBr(e.ultimaData)}`}</span>
                    <span className="font-semibold text-foreground">{valorTexto(e)}</span>
                  </span>
                </button>
                {aberta && <Eventos e={e} onAbrirContrato={onAbrirContrato} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
