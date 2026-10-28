/**
 * Uma pessoa na Presença no evento (27/10).
 *
 * Fechado (o que se lê de relance numa lista de 100+): quem é, a situação
 * principal (um selo só: sem registro, sem saída, na arena, pronto para
 * fechar, enviado ao DP…), a confirmação, o CNPJ com o selo de contrato, a
 * linha do tempo dos dias (cada dia abre as ações dele) e, para produção/DP,
 * o valor calculado e o "Check-out final" quando está pronto.
 *
 * Aberto: ocorrências (com remover), a confirmação do colaborador por
 * extenso, o CNPJ informado, o acesso ao portal (senha, código, bloqueio,
 * termo) e o valor com a memória de cálculo.
 *
 * 28/10 (Fase 2 manual): a situação da nota/pagamento (OC emitida, NF
 * enviada, devolvida, programado, pago) num selo e no bloco "Nota fiscal e
 * pagamento"; produção e DP enviam a NF como representante.
 *
 * 28/10 (Fase 3 — prazos): o prazo do check-out final ("Check-out final até
 * 31/10", "… atrasado 2 dias") ao lado da situação, enquanto a prestação não
 * foi ao DP; a contestação mostra se o DP já respondeu (e a resposta).
 */
import { memo, type ReactNode } from "react";
import {
  BadgeCheck, Camera, CameraOff, CheckCheck, ChevronDown, CircleDashed, FileUp, KeyRound, Loader2, LockKeyhole, MoreHorizontal, Send, ShieldAlert, Trash2, TriangleAlert, UserRoundCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Chip } from "@/components/budget/budget-card";
import { SeloContratoAtivo } from "@/components/contratos/pecas";
import { toTitleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LinhaDosDias, type AcoesDoDia } from "./linha-dos-dias";
import {
  contarSelfies, dataHoraBr, diaComSemana, foiParaODp, prontoParaFechar, reais, seloDoCnpj, seloPrincipal, textoDoAjuste,
} from "./presenca-utils";
import type { NotaFiscalDaPresenca, PermissoesDaPresenca, PrestacaoDaPresenca } from "./tipos";
import type { EstadoDoPagamento } from "@shared/honorarios-pagamento";
import type { Tom } from "@/components/budget/budget-card";
import { SeloDoPrazo } from "@/components/honorarios/prazo";

export interface AcoesDaPessoa extends AcoesDoDia {
  lancarOcorrencia: () => void;
  removerOcorrencia: (id: string) => void;
  confirmar: () => void;
  checkoutFinal: () => void;
  gerarCodigo: () => void;
  verSelfies: () => void;
  /** NF como representante (28/10) — só quando `notaFiscal.podeEnviar`. */
  enviarNota: () => void;
}

const TOM_DA_NOTA: Record<EstadoDoPagamento, Tom> = {
  sem_oc: "neutro", com_oc: "marca", nf_enviada: "alerta", nf_devolvida: "alerta", nf_recusada: "perigo", nf_aprovada: "info", programado: "info", pago: "ok",
};

const ddmmIso = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

/** O selo da nota/pagamento: "Pago em 25/10", "NF devolvida", "OC emitida"… */
function rotuloDaNota(n: NotaFiscalDaPresenca): string {
  return n.estado === "pago" && n.pagoEm ? `Pago em ${ddmmIso(n.pagoEm)}` : n.rotulo;
}

/** O que a nota espera agora, por extenso (o bloco aberto). */
function fraseDaNota(n: NotaFiscalDaPresenca): string {
  switch (n.estado) {
    case "sem_oc": return "Aguardando a OC do DP (depois da Conferência DP).";
    case "com_oc": return "OC emitida — aguardando a nota fiscal do colaborador (ou envie como representante).";
    case "nf_enviada": return "Nota enviada — em conferência no DP.";
    case "nf_devolvida": return "Nota devolvida pelo DP — o colaborador corrige e reenvia (ou você, como representante).";
    case "nf_recusada": return "Nota recusada em definitivo pelo DP.";
    case "nf_aprovada": return "Nota aprovada — aguardando o lançamento no M4.";
    case "programado": return "Lançada no M4 — pagamento programado.";
    case "pago": return n.pagoEm ? `Pago em ${ddmmIso(n.pagoEm)}.` : "Pago.";
  }
}

function Bloco({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="prs-bloco">
      <header className="flex flex-wrap items-center gap-x-2 min-h-7">
        <h4 className="prs-legenda m-0 min-w-0">{titulo}</h4>
        {acao && <div className="ml-auto shrink-0">{acao}</div>}
      </header>
      <div className="mt-1.5 text-xs leading-5 text-slate-700">{children}</div>
    </section>
  );
}

const ACAO_PEQUENA = "pas-alvo inline-flex items-center gap-1 h-7 px-2 rounded-md whitespace-nowrap text-xs font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const CartaoDaPessoa = memo(function CartaoDaPessoa({ p, hoje, permissoes, verValores, aberto, destacado, removendo, onAlternar, acoes }: {
  p: PrestacaoDaPresenca;
  hoje: string;
  permissoes: PermissoesDaPresenca;
  /** Produção, DP e admin veem os valores; a Área de Função não. */
  verValores: boolean;
  aberto: boolean;
  destacado: boolean;
  /** Ocorrência sendo removida agora (id), para o giro no botão. */
  removendo: string | null;
  onAlternar: () => void;
  acoes: AcoesDaPessoa;
}) {
  const nome = p.colaborador ? toTitleCase(p.colaborador.nome) : "Sem colaborador";
  const selo = seloPrincipal(p, hoje);
  const travada = foiParaODp(p);
  const pronto = prontoParaFechar(p);
  const nSelfies = contarSelfies(p);
  const nExpurgadas = p.dias.reduce((n, d) => n + (d.entrada?.fotoExpurgada ? 1 : 0) + (d.saida?.fotoExpurgada ? 1 : 0), 0);
  const podeCheckout = permissoes.checkoutFinal && p.checkoutFinal.podeFazer;
  const podeConfirmar = p.podeConfirmar && !travada;
  const ultimoDia = p.dias[p.dias.length - 1]?.dia;
  const tipo = p.colaborador?.tipo === "freela" ? "Freela" : p.colaborador?.tipo ? "Casa" : null;
  // O prazo da produção só enquanto a bola está com ela (antes do envio ao DP, ou depois da devolução).
  const prazoDoCheckout = !travada ? p.prazos?.checkoutFinal ?? null : null;
  const contestacao = p.confirmacao?.contestacaoDoColaborador ?? null;

  return (
    <article
      className={cn("prs-pessoa", aberto && "prs-pessoa-aberta", destacado && "pla-destaque", travada && "prs-pessoa-travada")}
      data-actual-id={p.actualId}
      aria-label={nome}
      data-testid={`prs-pessoa-${p.actualId}`}
    >
      <div className="prs-pessoa-topo">
        <div className="prs-pessoa-quem min-w-0">
          <h3 className="m-0 text-sm font-semibold leading-5 text-foreground break-words">{nome}</h3>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {p.funcao.nome ?? "Sem função"}
            {tipo && <><span aria-hidden="true"> · </span>{tipo}</>}
            {p.colaborador?.numero ? <span className="tabular-nums"><span aria-hidden="true"> · </span>nº {p.colaborador.numero}</span> : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Chip tom={selo.tom} title={selo.dica}>{selo.rotulo}</Chip>
            {prazoDoCheckout && (
              <SeloDoPrazo p={prazoDoCheckout} nome={prazoDoCheckout.etapa === "corrigir_prestacao" ? "Reenvio ao DP" : "Check-out final"}
                className="px-1" testid={`prs-prazo-${p.actualId}`} />
            )}
            {p.confirmacao ? (
              <Chip tom="ok" title={`Confirmou em ${dataHoraBr(p.confirmacao.confirmadoEm)}${p.confirmacao.por === "representante" ? " (pelo representante)" : ""}`}>
                <CheckCheck className="w-3 h-3" aria-hidden="true" />Confirmou{p.confirmacao.por === "representante" ? " (rep.)" : ""}
              </Chip>
            ) : ultimoDia && hoje > ultimoDia && !travada ? (
              <Chip tom="alerta" title="O último dia passou e o colaborador ainda não confirmou os dias e o CNPJ">Não confirmou</Chip>
            ) : null}
            {p.confirmacao?.contestacao && (
              <Chip tom={contestacao?.respondida ? "neutro" : "alerta"} title={`${p.confirmacao.contestacao}${contestacao?.respondida ? " — o DP respondeu" : ""}`}>
                {contestacao?.respondida ? <CheckCheck className="w-3 h-3" aria-hidden="true" /> : <TriangleAlert className="w-3 h-3" aria-hidden="true" />}
                {contestacao?.respondida ? "Contestação respondida" : "Contestou"}
              </Chip>
            )}
            {p.cnpj.informado && <span className="text-2xs tabular-nums text-muted-foreground" title={`CNPJ ${p.cnpj.origem === "checkout_final" ? "do check-out final" : "confirmado"}: ${p.cnpj.rotulo}`}>{p.cnpj.informado}</span>}
            <SeloContratoAtivo situacao={p.cnpj.informado ? seloDoCnpj(p.cnpj.situacao) : p.situacaoContratual} mostrarQuandoAtivo={!!p.cnpj.informado} />
            {p.notaFiscal && p.notaFiscal.estado !== "sem_oc" && (
              <Chip tom={TOM_DA_NOTA[p.notaFiscal.estado]} title={fraseDaNota(p.notaFiscal)}>
                {p.notaFiscal.estado === "pago" && <BadgeCheck className="w-3 h-3" aria-hidden="true" />}{rotuloDaNota(p.notaFiscal)}
              </Chip>
            )}
            {p.acesso.bloqueadoAte && <Chip tom="perigo" title={`Errou a senha várias vezes — bloqueado até ${dataHoraBr(p.acesso.bloqueadoAte)}. Um código novo destrava.`}><LockKeyhole className="w-3 h-3" aria-hidden="true" />Portal bloqueado</Chip>}
          </div>
        </div>

        <div className="prs-pessoa-dias min-w-0">
          <LinhaDosDias dias={p.dias} hoje={hoje} permissoes={permissoes} travada={travada} acoes={acoes} nome={nome} />
        </div>

        <div className="prs-pessoa-fim">
          {verValores && (
            <div className="prs-valor text-right">
              <span className="block text-2xs text-muted-foreground">{p.checkoutFinal.feito ? "Valor final" : "Calculado"}</span>
              <span className="block text-sm font-semibold tabular-nums text-foreground">{reais(p.checkoutFinal.feito && p.checkoutFinal.valorFinal != null ? p.checkoutFinal.valorFinal : p.calculo.valorCalculado)}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            {podeCheckout && pronto && (
              <Button type="button" size="sm" onClick={acoes.checkoutFinal} className="h-8 rounded-lg px-2.5 gap-1.5 text-xs" data-testid={`prs-checkout-${p.actualId}`}>
                <Send className="w-3.5 h-3.5" aria-hidden="true" />Check-out final
              </Button>
            )}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="pas-alvo inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Ações de ${nome}`} data-testid={`prs-acoes-${p.actualId}`}>
                  <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[240px]">
                {podeCheckout && (
                  <DropdownMenuItem onSelect={acoes.checkoutFinal} data-testid={`prs-menu-checkout-${p.actualId}`}>
                    <Send className="w-4 h-4 mr-2 text-primary" aria-hidden="true" />Check-out final…
                  </DropdownMenuItem>
                )}
                {!travada && (
                  <DropdownMenuItem onSelect={acoes.lancarOcorrencia} data-testid={`prs-menu-ocorrencia-${p.actualId}`}>
                    <TriangleAlert className="w-4 h-4 mr-2 text-warning-strong" aria-hidden="true" />Lançar ocorrência…
                  </DropdownMenuItem>
                )}
                {p.notaFiscal?.podeEnviar && (
                  <DropdownMenuItem onSelect={acoes.enviarNota} data-testid={`prs-menu-nota-${p.actualId}`}>
                    <FileUp className="w-4 h-4 mr-2 text-primary" aria-hidden="true" />{p.notaFiscal.estado === "nf_devolvida" ? "Reenviar a nota fiscal…" : "Enviar a nota fiscal…"}
                  </DropdownMenuItem>
                )}
                {podeConfirmar && (
                  <DropdownMenuItem onSelect={acoes.confirmar} data-testid={`prs-menu-confirmar-${p.actualId}`}>
                    <UserRoundCheck className="w-4 h-4 mr-2 text-success-strong" aria-hidden="true" />Confirmar pelo colaborador…
                  </DropdownMenuItem>
                )}
                {permissoes.verFotos && nSelfies > 0 && (
                  <DropdownMenuItem onSelect={acoes.verSelfies}>
                    <Camera className="w-4 h-4 mr-2 text-muted-foreground" aria-hidden="true" />Ver as selfies ({nSelfies})
                  </DropdownMenuItem>
                )}
                {permissoes.gerarCodigo && p.colaborador && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={acoes.gerarCodigo} data-testid={`prs-menu-codigo-${p.actualId}`}>
                      <KeyRound className="w-4 h-4 mr-2 text-muted-foreground" aria-hidden="true" />Gerar código de acesso…
                    </DropdownMenuItem>
                  </>
                )}
                {travada && !permissoes.gerarCodigo && !(permissoes.verFotos && nSelfies > 0) && (
                  <p className="m-0 px-2 py-1.5 text-xs text-muted-foreground">Enviado ao DP — nada muda por aqui.</p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="button" onClick={onAlternar} aria-expanded={aberto} aria-label={`${aberto ? "Recolher" : "Ver"} detalhes de ${nome}`}
              className="pas-alvo inline-flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`prs-detalhar-${p.actualId}`}>
              <ChevronDown className={cn("w-4 h-4 transition-transform duration-200 motion-reduce:transition-none", aberto && "rotate-180")} aria-hidden="true" />
              <span className="prs-acao-texto">{aberto ? "Recolher" : "Detalhes"}</span>
            </button>
          </div>
        </div>
      </div>

      {aberto && (
        <div className="prs-pessoa-corpo prs-entra">
          <Bloco titulo={`Ocorrências${p.ocorrencias.length ? ` (${p.ocorrencias.length})` : ""}`}
            acao={!travada ? <button type="button" className={ACAO_PEQUENA} onClick={acoes.lancarOcorrencia}>+ Lançar</button> : undefined}>
            {p.ocorrencias.length === 0 ? (
              <p className="m-0 text-muted-foreground">Nenhuma ocorrência.</p>
            ) : (
              <ul className="m-0 p-0 list-none space-y-1.5">
                {p.ocorrencias.map((o) => (
                  <li key={o.id} className="prs-ocorrencia">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 font-medium text-foreground">
                        {o.rotulo}
                        {o.dia && <span className="font-normal text-slate-600"> · {diaComSemana(o.dia)}</span>}
                        {o.horas != null && <span className="font-normal text-slate-600 tabular-nums"> · {o.horas.toLocaleString("pt-BR")} h</span>}
                      </p>
                      {o.substituto && <p className="m-0 text-slate-600">No lugar: {o.substituto.nome ? toTitleCase(o.substituto.nome) : "—"}</p>}
                      {o.observacao && <p className="m-0 text-slate-600 break-words">{o.observacao}</p>}
                      <p className="m-0 text-2xs text-muted-foreground">{o.criadoPorNome ?? "—"} · {dataHoraBr(o.criadoEm)}</p>
                    </div>
                    {!travada && (
                      <button type="button" onClick={() => acoes.removerOcorrencia(o.id)} disabled={removendo === o.id}
                        className="pas-alvo inline-flex items-center justify-center w-7 h-7 shrink-0 rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Remover ${o.rotulo.toLowerCase()}${o.dia ? ` de ${diaComSemana(o.dia)}` : ""}`} data-testid={`prs-remover-ocorrencia-${o.id}`}>
                        {removendo === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <Bloco titulo="Confirmação e CNPJ"
            acao={podeConfirmar && !p.confirmacao ? <button type="button" className={ACAO_PEQUENA} onClick={acoes.confirmar}>Confirmar pelo colaborador</button> : undefined}>
            {p.confirmacao ? (
              <div className="space-y-1">
                <p className="m-0 flex items-center gap-1.5 font-medium text-success"><CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  Confirmou {p.confirmacao.dias.length} {p.confirmacao.dias.length === 1 ? "dia" : "dias"} em {dataHoraBr(p.confirmacao.confirmadoEm)}
                </p>
                <p className="m-0 text-slate-600">{p.confirmacao.por === "representante" ? `Pelo representante${p.confirmacao.porUsuario?.nome ? ` (${p.confirmacao.porUsuario.nome})` : ""}` : "Pelo próprio colaborador, no app"}</p>
                {p.confirmacao.contestacao && <blockquote className="m-0 mt-1 rounded-md border-l-[3px] border-warning-strong bg-warning-soft/50 px-2.5 py-1.5 italic">“{p.confirmacao.contestacao}”</blockquote>}
                {contestacao?.respondida && contestacao.resposta && (
                  <p className="m-0 text-slate-600 break-words"><span className="font-medium text-foreground">Resposta do DP{contestacao.respondidaPorNome ? ` (${contestacao.respondidaPorNome})` : ""}:</span> {contestacao.resposta}</p>
                )}
                {p.confirmacao.contestacao && !contestacao?.respondida && <p className="m-0 text-2xs text-muted-foreground">Aguardando a resposta do DP.</p>}
                {podeConfirmar && <button type="button" className={cn(ACAO_PEQUENA, "-ml-2")} onClick={acoes.confirmar}>Refazer a confirmação</button>}
              </div>
            ) : (
              <p className="m-0 text-muted-foreground">
                {travada ? "Foi ao DP sem a confirmação do colaborador." : p.podeConfirmar ? "Ainda não confirmou. A pessoa confirma no app (ou você, como representante)." : "A confirmação abre depois do último dia de trabalho."}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-slate-600">CNPJ:</span>
              {p.cnpj.informado ? (
                <>
                  <span className="font-medium tabular-nums text-foreground">{p.cnpj.informado}</span>
                  <SeloContratoAtivo situacao={seloDoCnpj(p.cnpj.situacao)} mostrarQuandoAtivo />
                  <span className="basis-full text-2xs text-muted-foreground break-words">
                    {p.cnpj.razaoSocial ? `${p.cnpj.razaoSocial} · ` : ""}{p.cnpj.origem === "checkout_final" ? "informado no check-out final" : "da confirmação"}
                    {p.cnpj.situacao !== "contrato_ativo" ? ` · ${p.cnpj.rotulo}` : ""}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">não informado</span>
              )}
            </div>
          </Bloco>

          <Bloco titulo="Acesso ao app"
            acao={permissoes.gerarCodigo && p.colaborador ? <button type="button" className={ACAO_PEQUENA} onClick={acoes.gerarCodigo}><KeyRound className="w-3.5 h-3.5" aria-hidden="true" />Gerar código</button> : undefined}>
            <ul className="m-0 p-0 list-none space-y-1">
              <li className="flex items-start gap-1.5">
                {p.acesso.temSenha ? <CheckCheck className="w-3.5 h-3.5 mt-[3px] shrink-0 text-success-strong" aria-hidden="true" /> : <CircleDashed className="w-3.5 h-3.5 mt-[3px] shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span className="min-w-0">{p.acesso.temSenha ? <>Tem senha{p.acesso.ultimoAcessoEm ? <span className="text-muted-foreground"> · último acesso {dataHoraBr(p.acesso.ultimoAcessoEm)}</span> : null}</> : "Ainda não criou a senha"}</span>
              </li>
              {p.acesso.codigoValidoAte && (
                <li className="flex items-start gap-1.5"><KeyRound className="w-3.5 h-3.5 mt-[3px] shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0">Código válido até <span className="tabular-nums">{dataHoraBr(p.acesso.codigoValidoAte)}</span></span></li>
              )}
              {p.acesso.bloqueadoAte && (
                <li className="flex items-start gap-1.5 text-danger"><ShieldAlert className="w-3.5 h-3.5 mt-[3px] shrink-0" aria-hidden="true" /><span className="min-w-0">Bloqueado até <span className="tabular-nums">{dataHoraBr(p.acesso.bloqueadoAte)}</span> — um código novo destrava</span></li>
              )}
              <li className="flex items-start gap-1.5">
                {p.acesso.termoAceito ? <CheckCheck className="w-3.5 h-3.5 mt-[3px] shrink-0 text-success-strong" aria-hidden="true" /> : <CircleDashed className="w-3.5 h-3.5 mt-[3px] shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span className="min-w-0">{p.acesso.termoAceito ? "Aceitou o termo de uso das selfies" : "Ainda não aceitou o termo de uso das selfies"}</span>
              </li>
              <li className="flex items-start gap-1.5 text-muted-foreground"><Camera className="w-3.5 h-3.5 mt-[3px] shrink-0" aria-hidden="true" /><span className="min-w-0">{nSelfies} {nSelfies === 1 ? "selfie" : "selfies"} nesta prestação</span></li>
              {nExpurgadas > 0 && (
                <li className="flex items-start gap-1.5 text-muted-foreground" data-testid={`prs-expurgadas-${p.actualId}`}><CameraOff className="w-3.5 h-3.5 mt-[3px] shrink-0" aria-hidden="true" /><span className="min-w-0">{nExpurgadas} {nExpurgadas === 1 ? "foto apagada" : "fotos apagadas"} pela política de guarda (os horários ficam)</span></li>
              )}
            </ul>
          </Bloco>

          {p.notaFiscal && p.notaFiscal.estado !== "sem_oc" && (
            <Bloco titulo="Nota fiscal e pagamento"
              acao={p.notaFiscal.podeEnviar ? <button type="button" className={ACAO_PEQUENA} onClick={acoes.enviarNota} data-testid={`prs-enviar-nota-${p.actualId}`}><FileUp className="w-3.5 h-3.5" aria-hidden="true" />{p.notaFiscal.estado === "nf_devolvida" ? "Reenviar" : "Enviar nota fiscal"}</button> : undefined}>
              <div className="space-y-1" data-testid={`prs-nota-${p.actualId}`}>
                <p className="m-0"><Chip tom={TOM_DA_NOTA[p.notaFiscal.estado]}>{rotuloDaNota(p.notaFiscal)}</Chip></p>
                {p.notaFiscal.estado !== "pago" && <p className="m-0 text-slate-600">{fraseDaNota(p.notaFiscal)}</p>}
                {p.notaFiscal.oc && (
                  <p className="m-0"><span className="text-slate-600">OC</span> <span className="font-mono font-semibold text-foreground">{p.notaFiscal.oc.numero}</span>
                    {verValores && p.notaFiscal.oc.valor != null && <span className="tabular-nums text-slate-600"> · {reais(p.notaFiscal.oc.valor)}</span>}
                  </p>
                )}
                {p.notaFiscal.nota && (
                  <p className="m-0"><span className="text-slate-600">NF</span> <span className="font-medium text-foreground tabular-nums">{p.notaFiscal.nota.numero ?? "sem nº"}</span>
                    {verValores && p.notaFiscal.nota.valor != null && <span className="tabular-nums text-slate-600"> · {reais(p.notaFiscal.nota.valor)}</span>}
                  </p>
                )}
                {p.notaFiscal.nota?.status === "devolvida" && p.notaFiscal.nota.comentarioDoDp && (
                  <blockquote className="m-0 mt-1 rounded-md border-l-[3px] border-warning-strong bg-warning-soft/50 px-2.5 py-1.5 italic">“{p.notaFiscal.nota.comentarioDoDp}”</blockquote>
                )}
              </div>
            </Bloco>
          )}

          {verValores && (
            <Bloco titulo="Valor">
              {p.checkoutFinal.feito && p.checkoutFinal.valorFinal != null ? (
                <p className="m-0">
                  <span className="font-semibold text-foreground tabular-nums">{reais(p.checkoutFinal.valorFinal)}</span>
                  <span className="text-slate-600"> no check-out final ({textoDoAjuste(p.checkoutFinal.valorCalculado ?? p.calculo.valorCalculado, p.checkoutFinal.valorFinal)} sobre {reais(p.checkoutFinal.valorCalculado ?? p.calculo.valorCalculado)})</span>
                  {p.checkoutFinal.em && <span className="block text-2xs text-muted-foreground">{p.checkoutFinal.por?.nome ?? "—"} · {dataHoraBr(p.checkoutFinal.em)}</span>}
                </p>
              ) : (
                <ol className="prs-memoria prs-memoria-compacta">
                  {p.calculo.linhas.map((l, i) => <li key={i} className={cn(i === p.calculo.linhas.length - 1 && "prs-memoria-total")}>{l}</li>)}
                </ol>
              )}
            </Bloco>
          )}
        </div>
      )}
    </article>
  );
});
