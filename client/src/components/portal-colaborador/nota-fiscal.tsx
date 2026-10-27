/**
 * Nota fiscal e pagamento no portal do colaborador (28/10, Fase 2 manual do
 * Módulo de Honorários — etapas 5 a 7).
 *
 * - `BlocoDaNotaEPagamento`: na tela do evento, a situação de hoje (aguardando
 *   a OC → OC emitida → NF enviada/devolvida/recusada/aprovada → pagamento
 *   programado → pago), a ação quando há (Enviar nota fiscal / Enviar de
 *   novo), as etapas e os números (OC, nota, conta mascarada).
 * - `TelaDaNotaFiscal`: o envio. O que deve constar na nota (cada item com
 *   "Copiar"), o PDF ou a FOTO da nota em papel (reduzida no navegador, como
 *   a selfie), o valor da nota (aviso se diferente da OC — não bloqueia, o DP
 *   confere), nº e CNPJ opcionais e, só quando ainda não há conta gravada, a
 *   conta do CNPJ (gravada cifrada pelo mesmo serviço do DP).
 *
 * As regras (quem pode enviar, estados, frases) moram no servidor e em
 * shared/honorarios-pagamento.ts; aqui só se decide o que mostrar.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, BadgeCheck, CalendarClock, Check, CheckCircle2, CircleDollarSign, Clock, Copy, ExternalLink, FileText, Landmark, Lock,
  Paperclip, RefreshCw, Send, XCircle, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isApiError } from "@/lib/queryClient";
import { digitosDoCnpj, erroDoCnpj, mascararCnpj } from "@shared/cnpj";
import { reaisDaPresenca } from "@shared/presenca";
import {
  nomeDoBanco, TIPO_DE_PIX_LABEL, TIPOS_DE_CONTA, TIPOS_DE_PIX, validarPagamento, type DadosDePagamento,
  type TipoDeConta, type TipoDePix,
} from "@shared/pagamento";
import { CHAVE_PRESTACOES, codigoDoErro, ehErroDeRede, enviarNotaFiscal, mensagemDoErro, urlDoArquivoDaNota } from "./api";
import { prepararFotoDaNota } from "./captura";
import { centavosDoTexto, dataCurta, dataEHora, mascararReais, tamanhoDoArquivo } from "./formatos";
import { CabecalhoDoEvento, VoltarPara } from "./evento";
import { Aviso, BotaoPrincipal, BotaoSecundario, CampoDoPortal, TituloDaSecao } from "./pecas";
import type { ContaDoPortal, NotaEPagamentoDoPortal, PrestacaoDoPortal } from "./tipos";

export const TAMANHO_MAXIMO_DA_NOTA = 10 * 1024 * 1024;

const rotaDoEnvio = (p: PrestacaoDoPortal) => `/evento/${p.id}/nota-fiscal`;

// ── Peças ───────────────────────────────────────────────────────────────────

/** Link para o arquivo da própria nota (abre numa aba nova, com a sessão do portal). */
export function LinkDaNota({ p, children = "Ver a nota enviada", className }: { p: PrestacaoDoPortal; children?: ReactNode; className?: string }) {
  return (
    <a
      href={urlDoArquivoDaNota(p.id)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[15px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
      <span className="sr-only">(abre em outra aba)</span>
    </a>
  );
}

/** Comentário do DP em destaque (devolução e recusa). */
function ComentarioDoDp({ texto, tom }: { texto: string; tom: "atencao" | "erro" }) {
  return (
    <figure className={cn("m-0 mt-3 rounded-lg border-l-4 bg-card px-3.5 py-3", tom === "erro" ? "border-danger-strong" : "border-warning-strong")}>
      <figcaption className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Comentário do DP</figcaption>
      <blockquote className="m-0 mt-1 whitespace-pre-line text-[15px] font-medium leading-snug text-foreground">{texto}</blockquote>
    </figure>
  );
}

/** A conta já cadastrada, sempre mascarada. */
export function ContaMascarada({ conta, className }: { conta: ContaDoPortal; className?: string }) {
  const m = conta.mascarada ?? {};
  const linhas: [string, string | null | undefined][] = [
    ["Banco", m.banco],
    ["Agência", m.agencia],
    ["Conta", m.conta ? `${m.conta}${m.tipoConta ? ` · ${m.tipoConta}` : ""}` : null],
    ["PIX", m.pixChave ? `${m.pixTipo ? `${m.pixTipo}: ` : ""}${m.pixChave}` : null],
    ["Titular", m.titular],
  ];
  return (
    <dl className={cn("m-0 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm", className)}>
      {linhas.filter(([, v]) => v).map(([r, v]) => (
        <div key={r} className="contents">
          <dt className="text-muted-foreground">{r}</dt>
          <dd className="m-0 min-w-0 break-words font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── O bloco da tela do evento ───────────────────────────────────────────────

/** Quando a nota foi enviada: no reenvio, a última atualização é o reenvio; depois disso, vale a data do envio. */
const quandoEnviou = (n: NotaEPagamentoDoPortal): string | null =>
  (n.estado === "nf_enviada" ? n.nota?.atualizadaEm ?? n.nota?.enviadaEm : n.nota?.enviadaEm) ?? null;

interface Cabeca { tom: "neutro" | "acao" | "andamento" | "atencao" | "erro" | "ok"; icone: LucideIcon; titulo: string }

const CAIXA: Record<Cabeca["tom"], { caixa: string; icone: string; titulo: string }> = {
  neutro: { caixa: "border-border bg-card", icone: "bg-muted text-muted-foreground", titulo: "text-foreground" },
  acao: { caixa: "border-primary/20 bg-brand-soft", icone: "bg-primary text-primary-foreground", titulo: "text-foreground" },
  andamento: { caixa: "border-info/15 bg-info-soft", icone: "bg-card text-info", titulo: "text-foreground" },
  atencao: { caixa: "border-warning/25 bg-warning-soft", icone: "bg-card text-warning", titulo: "text-foreground" },
  erro: { caixa: "border-danger/20 bg-danger-soft", icone: "bg-card text-danger", titulo: "text-foreground" },
  ok: { caixa: "border-success/20 bg-success-soft/70", icone: "bg-card text-success", titulo: "text-foreground" },
};

function cabecaDoEstado(n: NotaEPagamentoDoPortal): Cabeca {
  switch (n.estado) {
    case "sem_oc": return { tom: "neutro", icone: Clock, titulo: "Aguardando a ordem de compra" };
    case "com_oc": return { tom: "acao", icone: Send, titulo: "OC emitida: envie a nota fiscal" };
    case "nf_enviada": return { tom: "andamento", icone: FileText, titulo: "Nota enviada · em conferência no DP" };
    case "nf_devolvida": return { tom: "atencao", icone: AlertTriangle, titulo: "O DP devolveu a sua nota" };
    case "nf_recusada": return { tom: "erro", icone: XCircle, titulo: "Nota recusada pelo DP" };
    case "nf_aprovada": return { tom: "ok", icone: CheckCircle2, titulo: "Nota aprovada" };
    case "programado": return { tom: "ok", icone: CalendarClock, titulo: n.programadoPara ? `Pagamento programado para ${dataCurta(n.programadoPara)}` : "Pagamento programado" };
    case "pago": return { tom: "ok", icone: BadgeCheck, titulo: n.pagoEm ? `Pago em ${dataCurta(n.pagoEm)}` : "Pago" };
    default: return { tom: "neutro", icone: Clock, titulo: n.rotulo };
  }
}

type SituacaoDaEtapa = "feita" | "agora" | "atencao" | "erro" | "depois";

/** As 4 etapas: OC → nota → conferência do DP → pagamento. */
export function etapasDoPagamento(n: NotaEPagamentoDoPortal): { id: string; titulo: string; detalhe: string | null; situacao: SituacaoDaEtapa }[] {
  const e = n.estado;
  const ordem = ["sem_oc", "com_oc", "nf_enviada", "nf_aprovada", "programado", "pago"];
  const pos = e === "nf_devolvida" || e === "nf_recusada" ? 2 : ordem.indexOf(e);
  const enviada = quandoEnviou(n);
  return [
    {
      id: "oc", titulo: "Ordem de compra (OC)",
      detalhe: n.oc ? `nº ${n.oc.numero}${n.oc.data ? ` · ${dataCurta(n.oc.data)}` : ""}` : "o DP emite depois de aprovar a prestação",
      situacao: e === "sem_oc" ? "agora" : "feita",
    },
    {
      id: "nota", titulo: "Nota fiscal",
      detalhe: e === "com_oc" ? "você envia por aqui" : e === "nf_devolvida" ? "devolvida — envie de novo" : enviada && pos >= 2 ? `enviada em ${dataCurta(enviada.slice(0, 10))}` : null,
      situacao: e === "com_oc" ? "agora" : e === "nf_devolvida" ? "atencao" : pos >= 2 ? "feita" : "depois",
    },
    {
      id: "conferencia", titulo: "Conferência do DP",
      detalhe: e === "nf_enviada" ? "número da OC, valor e CNPJ" : e === "nf_recusada" ? "recusada — fale com o DP" : pos >= 3 ? "nota aprovada" : null,
      situacao: e === "nf_enviada" ? "agora" : e === "nf_recusada" ? "erro" : pos >= 3 ? "feita" : "depois",
    },
    {
      id: "pagamento", titulo: "Pagamento",
      detalhe: e === "pago" && n.pagoEm ? `pago em ${dataCurta(n.pagoEm)}` : e === "programado" && n.programadoPara ? `programado para ${dataCurta(n.programadoPara)}` : e === "nf_aprovada" ? "o DP programa a data" : null,
      situacao: e === "pago" ? "feita" : e === "programado" || e === "nf_aprovada" ? "agora" : "depois",
    },
  ];
}

const PONTO_DA_ETAPA: Record<SituacaoDaEtapa, string> = {
  feita: "bg-success-strong text-white border-success-strong",
  agora: "bg-card border-primary text-primary",
  atencao: "bg-warning-strong text-white border-warning-strong",
  erro: "bg-danger-strong text-white border-danger-strong",
  depois: "bg-card border-border text-muted-foreground",
};
const ROTULO_DA_ETAPA: Record<SituacaoDaEtapa, string> = { feita: "feita", agora: "agora", atencao: "precisa de você", erro: "recusada", depois: "depois" };

function Etapas({ n }: { n: NotaEPagamentoDoPortal }) {
  const etapas = etapasDoPagamento(n);
  return (
    <ol className="m-0 list-none p-0" aria-label="Etapas até o pagamento">
      {etapas.map((et, i) => (
        <li key={et.id} className="relative flex gap-3 pb-3.5 last:pb-0">
          {i < etapas.length - 1 && (
            <span className={cn("absolute left-[11px] top-6 h-[calc(100%-20px)] w-0.5", et.situacao === "feita" ? "bg-success-strong/50" : "bg-border")} aria-hidden="true" />
          )}
          <span className={cn("relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", PONTO_DA_ETAPA[et.situacao])} aria-hidden="true">
            {et.situacao === "feita" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : et.situacao === "erro" ? <XCircle className="h-3.5 w-3.5" /> : et.situacao === "atencao" ? <AlertTriangle className="h-3 w-3" /> : <span className={cn("h-2 w-2 rounded-full", et.situacao === "agora" ? "bg-primary" : "bg-border")} />}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={cn("m-0 text-sm leading-tight", et.situacao === "depois" ? "font-medium text-muted-foreground" : "font-semibold text-foreground")}>
              {et.titulo}<span className="sr-only"> — {ROTULO_DA_ETAPA[et.situacao]}</span>
            </p>
            {et.detalhe && <p className="m-0 mt-0.5 text-[13px] leading-snug text-muted-foreground">{et.detalhe}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function corpoDoEstado(n: NotaEPagamentoDoPortal): ReactNode {
  const valorOc = n.oc?.valor != null ? reaisDaPresenca(n.oc.valor) : null;
  const enviada = quandoEnviou(n);
  switch (n.estado) {
    case "sem_oc":
      return <>Tudo certo por aqui: o DP ainda vai emitir a ordem de compra (OC) deste trabalho. Quando ela sair, o botão para enviar a nota fiscal aparece nesta tela.</>;
    case "com_oc":
      return <>Ordem de compra nº <strong className="font-semibold tabular-nums">{n.oc?.numero}</strong>{valorOc && <> no valor de <strong className="font-semibold tabular-nums">{valorOc}</strong></>}. Emita a nota com esses dados e envie o PDF ou uma foto dela.</>;
    case "nf_enviada":
      return <>{enviada ? <>Você enviou em {dataEHora(enviada)}. </> : null}O DP confere o número da OC, o valor e o CNPJ. Se algo não bater, ele devolve com um comentário aqui.</>;
    case "nf_devolvida":
      return <>Corrija o que o DP pediu, emita a nota de novo e envie por aqui.</>;
    case "nf_recusada":
      return <>Esta nota não segue. Fale com o DP para saber como fazer.</>;
    case "nf_aprovada":
      return <>Agora o DP programa o pagamento. A data aparece aqui assim que sair.</>;
    case "programado":
      return <>{valorOc ? <>O valor da OC, <strong className="font-semibold tabular-nums">{valorOc}</strong>, </> : "O pagamento "}cai na conta do CNPJ{n.contaBancaria.cadastrada ? " cadastrada abaixo" : ""}. Se a data mudar, ela muda aqui também.</>;
    case "pago":
      return <>{valorOc ? <><strong className="font-semibold tabular-nums">{valorOc}</strong> pagos </> : "Pagamento feito "}na conta do CNPJ{n.contaBancaria.cadastrada ? " cadastrada abaixo" : ""}. Confira no extrato; qualquer dúvida, fale com o DP.</>;
    default:
      return <>{n.frase}</>;
  }
}

export function BlocoDaNotaEPagamento({ p }: { p: PrestacaoDoPortal }) {
  const [, navegar] = useLocation();
  const n = p.notaEPagamento;
  if (!n) return null;
  const cabeca = cabecaDoEstado(n);
  const c = CAIXA[cabeca.tom];
  const Icone = cabeca.icone;
  const nota = n.nota;
  const temDetalhes = !!n.oc || !!nota || n.contaBancaria.cadastrada;
  return (
    <div className="space-y-3">
      <div className={cn("rounded-xl border px-4 py-4", c.caixa)} data-testid="bloco-nota-e-pagamento" data-estado={n.estado}>
        <div className="flex items-start gap-3">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", c.icone)}>
            <Icone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("m-0 text-[17px] font-bold leading-snug tracking-tight", c.titulo)}>{cabeca.titulo}</p>
            <p className="m-0 mt-1 text-sm leading-snug text-foreground/80">{corpoDoEstado(n)}</p>
          </div>
        </div>
        {(n.estado === "nf_devolvida" || n.estado === "nf_recusada") && nota?.comentarioDoDp && (
          <ComentarioDoDp texto={nota.comentarioDoDp} tom={n.estado === "nf_recusada" ? "erro" : "atencao"} />
        )}
        {n.podeEnviarNf ? (
          <BotaoPrincipal type="button" className="mt-4" icone={n.estado === "nf_devolvida" ? RefreshCw : Send} onClick={() => navegar(rotaDoEnvio(p))}>
            {n.estado === "nf_devolvida" ? "Enviar de novo" : "Enviar nota fiscal"}
          </BotaoPrincipal>
        ) : n.estado === "com_oc" && n.motivoNaoPodeEnviar ? (
          <p className="m-0 mt-3 text-[13px] text-muted-foreground">{n.motivoNaoPodeEnviar}</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-4">
        <Etapas n={n} />
      </div>

      {temDetalhes && (
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          <dl className="m-0 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            {n.oc?.valor != null && (<><dt className="text-muted-foreground">Valor da OC</dt><dd className="m-0 font-semibold tabular-nums">{reaisDaPresenca(n.oc.valor)}</dd></>)}
            {nota && (
              <>
                <dt className="text-muted-foreground">Sua nota</dt>
                <dd className="m-0 min-w-0 font-medium tabular-nums">
                  {nota.numero ? `nº ${nota.numero}` : "sem número informado"}
                  {nota.valor != null && <> · {reaisDaPresenca(nota.valor)}</>}
                  {nota.valor != null && n.oc?.valor != null && nota.valor !== n.oc.valor && (
                    <span className="block text-[13px] font-medium text-warning">Diferente do valor da OC</span>
                  )}
                </dd>
              </>
            )}
          </dl>
          {nota?.temArquivo && <LinkDaNota p={p} className="mt-1.5">{n.estado === "nf_devolvida" ? "Ver a nota que você enviou" : "Ver a nota enviada"}</LinkDaNota>}
          {n.contaBancaria.cadastrada && (
            <div className={cn(n.oc || nota ? "mt-3 border-t border-border pt-3" : "")}>
              <p className="m-0 mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
                <Landmark className="h-4 w-4" aria-hidden="true" /> Conta para receber
              </p>
              <ContaMascarada conta={n.contaBancaria} />
              <p className="m-0 mt-2 text-[12px] text-muted-foreground">Para trocar a conta, fale com o DP.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Copiar ──────────────────────────────────────────────────────────────────

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // cai no jeito antigo
  }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");
  useEffect(() => {
    if (estado === "parado") return;
    const t = setTimeout(() => setEstado("parado"), 2200);
    return () => clearTimeout(t);
  }, [estado]);
  return (
    <button
      type="button"
      onClick={async () => setEstado((await copiarTexto(texto)) ? "copiado" : "falhou")}
      aria-label={`Copiar ${rotulo}`}
      className={cn(
        "inline-flex h-11 min-w-[92px] shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        estado === "copiado" ? "border-success/30 bg-success-soft text-success" : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {estado === "copiado" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      <span aria-live="polite">{estado === "copiado" ? "Copiado" : estado === "falhou" ? "Selecione" : "Copiar"}</span>
    </button>
  );
}

function LinhaCopiavel({ rotulo, valor, copiar, multilinha }: { rotulo: string; valor: ReactNode; copiar: string; multilinha?: boolean }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{rotulo}</p>
        <p className={cn("m-0 mt-0.5 select-all break-words text-[15px] font-semibold leading-snug text-foreground", multilinha ? "font-medium" : "tabular-nums")}>{valor}</p>
      </div>
      <BotaoCopiar texto={copiar} rotulo={rotulo.toLowerCase()} />
    </li>
  );
}

// ── O formulário de envio ───────────────────────────────────────────────────

interface ArquivoEscolhido { blob: Blob; nome: string; tipo: "pdf" | "imagem"; tamanho: number }

interface FormDaConta { banco: string; agencia: string; conta: string; tipoConta: TipoDeConta | ""; titular: string; pixTipo: TipoDePix | ""; pixChave: string }

type CampoDoErro = "arquivo" | "valor" | "cnpj" | "titular" | keyof DadosDePagamento;

/** A conta do formulário no formato da validação compartilhada (shared/pagamento). */
const dadosDaConta = (c: FormDaConta): DadosDePagamento => ({
  banco: c.banco.trim() || null, agencia: c.agencia.trim() || null, conta: c.conta.trim() || null, tipoConta: c.tipoConta || null,
  pixTipo: c.pixTipo || null, pixChave: c.pixChave.trim() || null, titular: c.titular.trim() || null, email: null,
});

/** Erros da conta: banco + agência + conta + tipo + titular obrigatórios; PIX opcional (mas válido). */
export function errosDaConta(c: FormDaConta): Partial<Record<CampoDoErro, string>> {
  const e: Partial<Record<CampoDoErro, string>> = { ...validarPagamento(dadosDaConta(c)) };
  if (!c.banco.trim()) e.banco = "Informe o banco.";
  if (!c.agencia.trim()) e.agencia = "Informe a agência.";
  if (!c.conta.trim()) e.conta = "Informe a conta.";
  if (!c.tipoConta) e.tipoConta = "Escolha o tipo de conta.";
  if (!c.titular.trim()) e.titular = "Informe o titular da conta.";
  return e;
}

/** O que dizer quando o envio falha (e qual campo marcar). */
export function erroDoEnvio(erro: unknown): { titulo?: string; texto: string; campo?: CampoDoErro; recarregar?: boolean } {
  if (ehErroDeRede(erro)) {
    return { titulo: "Sem conexão", texto: "A nota não foi enviada. O arquivo e o que você digitou continuam aqui — tente de novo quando o sinal voltar." };
  }
  if (!isApiError(erro)) return { texto: "Não foi possível enviar a nota. Tente de novo." };
  const codigo = codigoDoErro(erro);
  if (erro.status === 413) return { titulo: "Arquivo grande demais", texto: "O arquivo passa de 10 MB. Envie o PDF original da nota (costuma ser bem menor) ou uma foto.", campo: "arquivo" };
  if (erro.status === 415) return { titulo: "Esse arquivo não serve", texto: "A nota tem que ser PDF ou foto (JPG ou PNG).", campo: "arquivo" };
  if (codigo === "sem_chave") {
    return { titulo: "Sistema de pagamento em manutenção", texto: "A sua nota NÃO foi enviada: o cadastro da conta bancária está fora do ar agora. Avise o DP e tente de novo mais tarde." };
  }
  if (codigo === "conta_obrigatoria") return { titulo: "Falta a conta para receber", texto: "Informe a conta bancária do CNPJ que emite a nota.", campo: "conta" };
  if (codigo === "conta_ja_cadastrada") {
    return { titulo: "A sua conta já está cadastrada", texto: "Atualizamos a tela: agora é só enviar a nota de novo (sem a conta). Para trocar a conta, fale com o DP.", recarregar: true };
  }
  if (erro.status === 409) return { titulo: "A situação da nota mudou", texto: `${mensagemDoErro(erro)} Atualizamos a tela.`, recarregar: true };
  const campo = typeof erro.body?.campo === "string" ? (erro.body.campo as string) : null;
  const mapa: Record<string, CampoDoErro> = { valorNota: "valor", cnpjNota: "cnpj", arquivo: "arquivo", tipoConta: "tipoConta", pixTipo: "pixTipo", conta: "conta" };
  return { texto: mensagemDoErro(erro, "Não foi possível enviar a nota. Tente de novo."), campo: campo ? mapa[campo] : undefined };
}

function Rotulo({ htmlFor, children, opcional }: { htmlFor: string; children: ReactNode; opcional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold">
      {children}{opcional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
    </label>
  );
}

function ErroDoCampo({ id, texto }: { id: string; texto?: string }) {
  return texto ? <p id={id} className="m-0 text-[13px] font-medium text-danger">{texto}</p> : null;
}

/** `comConta`: a conta foi informada NESTE envio (a lista recarrega por trás e o `p` já não pede conta). */
function NotaEnviada({ p, prestacao, comConta }: { p: PrestacaoDoPortal; prestacao: PrestacaoDoPortal; comConta: boolean }) {
  const [, navegar] = useLocation();
  const n = prestacao.notaEPagamento;
  const nota = n?.nota;
  return (
    <div role="status" aria-live="polite" className="casca-surgir">
      <div className="flex flex-col items-center px-2 pt-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft ring-8 ring-success-soft/50">
          <CheckCircle2 className="h-9 w-9 text-success-strong" aria-hidden="true" />
        </span>
        <h1 className="m-0 mt-5 text-2xl font-bold tracking-tight">Nota fiscal enviada</h1>
        <p className="m-0 mt-1.5 text-[15px] text-muted-foreground">{p.evento.nome}{n?.oc ? ` · OC nº ${n.oc.numero}` : ""}</p>
      </div>
      <dl className="m-0 mt-6 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-4 text-sm">
        {nota?.arquivoNome && (<><dt className="text-muted-foreground">Arquivo</dt><dd className="m-0 min-w-0 break-words font-medium [overflow-wrap:anywhere]">{nota.arquivoNome}</dd></>)}
        {nota?.valor != null && (<><dt className="text-muted-foreground">Valor da nota</dt><dd className="m-0 font-semibold tabular-nums">{reaisDaPresenca(nota.valor)}</dd></>)}
        {nota?.numero && (<><dt className="text-muted-foreground">Nº da nota</dt><dd className="m-0 font-medium tabular-nums">{nota.numero}</dd></>)}
        {nota?.enviadaEm && (<><dt className="text-muted-foreground">Enviada</dt><dd className="m-0 font-medium">{dataEHora(nota.atualizadaEm ?? nota.enviadaEm)}</dd></>)}
      </dl>
      {nota?.temArquivo && <div className="mt-1 text-center"><LinkDaNota p={prestacao} /></div>}
      {n?.contaBancaria.cadastrada && comConta && (
        <div className="mt-3 rounded-xl border border-border bg-card px-4 py-4">
          <p className="m-0 mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"><Lock className="h-4 w-4" aria-hidden="true" /> Conta guardada (protegida)</p>
          <ContaMascarada conta={n.contaBancaria} />
        </div>
      )}
      <Aviso tom="info" className="mt-3" titulo="E agora?">
        O DP confere o número da OC, o valor e o CNPJ. Se algo não bater, ele devolve com um comentário e você vê no evento. Depois vem a data do pagamento.
      </Aviso>
      <div className="mt-6 space-y-2">
        <BotaoPrincipal type="button" onClick={() => navegar(`/evento/${p.id}`)}>Voltar ao evento</BotaoPrincipal>
        <BotaoSecundario onClick={() => navegar("/")}>Ir para meus eventos</BotaoSecundario>
      </div>
    </div>
  );
}

/** Rótulo curto do tipo de conta (cabe em 3 botões lado a lado no celular). */
const TIPO_CURTO: Record<TipoDeConta, string> = { corrente: "Corrente", poupanca: "Poupança", pagamento: "Pagamento" };

const CLASSE_SELECT = "h-12 w-full rounded-lg border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-[invalid=true]:border-danger";

export function TelaDaNotaFiscal({ p }: { p: PrestacaoDoPortal }) {
  const queryClient = useQueryClient();
  const base = useId();
  const id = (k: string) => `${base}-${k}`;
  const n = p.notaEPagamento ?? null;
  const pedirConta = !!n?.contaBancaria.podeInformar;

  const [arquivo, setArquivo] = useState<ArquivoEscolhido | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [valor, setValor] = useState("");
  const [numero, setNumero] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [conta, setConta] = useState<FormDaConta>(() => ({
    banco: "", agencia: "", conta: "", tipoConta: "", titular: p.confirmacao?.razaoSocial ?? "", pixTipo: "", pixChave: "",
  }));
  const [erros, setErros] = useState<Partial<Record<CampoDoErro, string>>>({});
  const [falha, setFalha] = useState<ReturnType<typeof erroDoEnvio> | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feita, setFeita] = useState<{ prestacao: PrestacaoDoPortal; comConta: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const falhaRef = useRef<HTMLDivElement>(null);

  // URL da prévia da foto: criada a cada imagem nova e liberada depois.
  useEffect(() => {
    if (!arquivo || arquivo.tipo !== "imagem") { setPrevia(null); return; }
    const url = URL.createObjectURL(arquivo.blob);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  useEffect(() => { if (falha) falhaRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" }); }, [falha]);

  if (feita) return <NotaEnviada p={p} prestacao={feita.prestacao} comConta={feita.comConta} />;

  if (!n || !n.podeEnviarNf || !n.instrucoes) {
    return (
      <div>
        <VoltarPara texto="Voltar ao evento" para={`/evento/${p.id}`} />
        <CabecalhoDoEvento p={p} />
        <Aviso tom="info" className="mt-6" titulo="O envio da nota não está aberto">
          {n?.motivoNaoPodeEnviar ?? "A nota fiscal é enviada depois da ordem de compra (OC) — o DP ainda vai emiti-la."}
        </Aviso>
      </div>
    );
  }

  const inst = n.instrucoes;
  const devolvida = n.estado === "nf_devolvida";
  const centavos = centavosDoTexto(valor);
  const divergente = centavos != null && centavos !== inst.valor;
  const banco = nomeDoBanco(conta.banco);

  const limparErro = (k: CampoDoErro) => { setErros((e) => (e[k] ? { ...e, [k]: undefined } : e)); };
  const mudarConta = (k: keyof FormDaConta, v: string) => { setConta((c) => ({ ...c, [k]: v })); limparErro(k as CampoDoErro); };

  async function escolher(f: File | undefined) {
    if (!f) return;
    limparErro("arquivo");
    setFalha(null);
    const pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (pdf) {
      if (f.size > TAMANHO_MAXIMO_DA_NOTA) { setErros((e) => ({ ...e, arquivo: `Esse PDF tem ${tamanhoDoArquivo(f.size)} — o máximo é 10 MB.` })); return; }
      setArquivo({ blob: f, nome: f.name || "nota-fiscal.pdf", tipo: "pdf", tamanho: f.size });
      return;
    }
    if (!f.type.startsWith("image/")) { setErros((e) => ({ ...e, arquivo: "Envie o PDF da nota ou uma foto dela." })); return; }
    setPreparando(true);
    try {
      const blob = await prepararFotoDaNota(f);
      const nome = blob.type === "image/png" ? "nota-fiscal.png" : "nota-fiscal.jpg";
      setArquivo({ blob, nome, tipo: "imagem", tamanho: blob.size });
    } catch (erro) {
      setErros((e) => ({ ...e, arquivo: erro instanceof Error ? erro.message : "Não consegui ler essa foto." }));
    } finally {
      setPreparando(false);
    }
  }

  function focar(campo: CampoDoErro) {
    const alvo = campo === "arquivo" ? document.getElementById(id("arquivo-botao")) : document.getElementById(id(campo));
    alvo?.focus();
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const novos: Partial<Record<CampoDoErro, string>> = {};
    if (!arquivo) novos.arquivo = "Anexe a nota: o PDF ou uma foto dela.";
    if (centavos == null) novos.valor = "Informe o valor da nota.";
    const erroCnpj = erroDoCnpj(cnpj);
    if (erroCnpj) novos.cnpj = erroCnpj;
    if (pedirConta) Object.assign(novos, errosDaConta(conta));
    setErros(novos);
    setFalha(null);
    const ordem: CampoDoErro[] = ["arquivo", "valor", "cnpj", "banco", "agencia", "conta", "tipoConta", "titular", "pixTipo", "pixChave"];
    const primeiro = ordem.find((k) => novos[k]);
    if (primeiro) return focar(primeiro);
    setEnviando(true);
    try {
      const r = await enviarNotaFiscal({
        actualId: p.id, arquivo: arquivo!.blob, nomeDoArquivo: arquivo!.nome, valorNota: centavos!,
        numeroNota: numero.trim() || null, cnpjNota: digitosDoCnpj(cnpj) || null,
        conta: pedirConta ? {
          banco: conta.banco.trim(), agencia: conta.agencia.trim(), conta: conta.conta.trim(), tipoConta: conta.tipoConta,
          titular: conta.titular.trim().replace(/\s+/g, " "), pixTipo: conta.pixChave.trim() ? conta.pixTipo || null : null, pixChave: conta.pixChave.trim() || null,
        } : null,
      });
      setFeita({ prestacao: r.prestacao, comConta: pedirConta });
      if (!navigator.userAgent.includes("jsdom")) window.scrollTo({ top: 0 });
      void queryClient.invalidateQueries({ queryKey: CHAVE_PRESTACOES });
    } catch (erro) {
      const f = erroDoEnvio(erro);
      // Erro de um campo: aparece no campo (e o foco vai para ele); o resto, no aviso acima do botão.
      if (f.campo) {
        const campo = f.campo;
        setErros((x) => ({ ...x, [campo]: f.texto }));
        setTimeout(() => focar(campo), 0);
      } else {
        setFalha(f);
      }
      if (f.recarregar) void queryClient.invalidateQueries({ queryKey: CHAVE_PRESTACOES });
    } finally {
      setEnviando(false);
    }
  }

  const desc = (k: CampoDoErro, extra?: string) => [erros[k] ? id(`${k}-erro`) : null, extra].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={enviar} noValidate>
      <VoltarPara texto="Voltar ao evento" para={`/evento/${p.id}`} />
      <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-primary">{devolvida ? "Reenviar a nota fiscal" : "Enviar a nota fiscal"}</p>
      <CabecalhoDoEvento p={p} />

      {devolvida && (
        <Aviso tom="atencao" className="mt-5" titulo="O DP devolveu a nota anterior">
          {n.nota?.comentarioDoDp ? <ComentarioDoDp texto={n.nota.comentarioDoDp} tom="atencao" /> : "Confira os dados abaixo e envie a nota corrigida."}
          {n.nota?.temArquivo && <LinkDaNota p={p} className="mt-1">Ver a nota que você enviou</LinkDaNota>}
        </Aviso>
      )}

      {/* O que deve constar na nota */}
      <section aria-labelledby={id("instrucoes")} className="mt-7">
        <TituloDaSecao id={id("instrucoes")}>O que deve constar na nota</TituloDaSecao>
        <p className="m-0 mb-2.5 text-[13px] leading-snug text-muted-foreground">Use estes dados no emissor de notas da sua prefeitura (ou no app do MEI). Toque em “Copiar” e cole lá.</p>
        <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-xl border border-border bg-card p-0">
          {inst.tomador.nome ? (
            <LinhaCopiavel rotulo="Tomador (para quem é a nota)" valor={inst.tomador.nome} copiar={inst.tomador.nome} multilinha />
          ) : (
            <li className="px-4 py-3 text-sm text-muted-foreground">Tomador: o DP informa a empresa que contrata este evento.</li>
          )}
          {inst.tomador.cnpj && <LinhaCopiavel rotulo="CNPJ do tomador" valor={mascararCnpj(inst.tomador.cnpj)} copiar={mascararCnpj(inst.tomador.cnpj)} />}
          <LinhaCopiavel rotulo="Valor" valor={reaisDaPresenca(inst.valor)} copiar={reaisDaPresenca(inst.valor).replace(/^R\$\s*/, "")} />
          <LinhaCopiavel rotulo="Nº da ordem de compra (OC)" valor={inst.oc} copiar={inst.oc} />
          <LinhaCopiavel rotulo="Descrição sugerida" valor={inst.descricaoSugerida} copiar={inst.descricaoSugerida} multilinha />
        </ul>
      </section>

      {/* Arquivo */}
      <section aria-labelledby={id("arquivo-titulo")} className="mt-7">
        <TituloDaSecao id={id("arquivo-titulo")}>A nota</TituloDaSecao>
        <input
          ref={inputRef}
          id={id("arquivo")}
          data-testid="portal-arquivo-da-nota"
          type="file"
          accept="application/pdf,image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; void escolher(f); }}
        />
        {arquivo ? (
          <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-card p-3">
            {arquivo.tipo === "imagem" && previa ? (
              <img src={previa} alt="Prévia da foto da nota" className="h-16 w-14 shrink-0 rounded-md border border-border object-cover" />
            ) : (
              <span className="flex h-16 w-14 shrink-0 items-center justify-center rounded-md bg-danger-soft text-danger">
                <FileText className="h-7 w-7" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[15px] font-semibold">{arquivo.tipo === "pdf" ? arquivo.nome : "Foto da nota"}</p>
              <p className="m-0 mt-0.5 flex items-center gap-1 text-[13px] text-success"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{arquivo.tipo === "pdf" ? "PDF" : "Foto"} · {tamanhoDoArquivo(arquivo.tamanho)} · pronto</p>
            </div>
            <button
              id={id("arquivo-botao")}
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-11 shrink-0 items-center rounded-lg px-3 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Trocar
            </button>
          </div>
        ) : (
          <button
            id={id("arquivo-botao")}
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={preparando}
            aria-describedby={desc("arquivo", id("arquivo-dica"))}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-card px-4 py-6 text-center transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70",
              erros.arquivo ? "border-danger/60" : "border-border",
            )}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-primary">
              {preparando ? <RefreshCw className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Paperclip className="h-5 w-5" aria-hidden="true" />}
            </span>
            <span className="text-base font-semibold text-foreground">{preparando ? "Preparando a foto…" : "Anexar a nota"}</span>
            <span id={id("arquivo-dica")} className="text-[13px] leading-snug text-muted-foreground">PDF da nota ou foto da nota em papel · até 10 MB</span>
          </button>
        )}
        <ErroDoCampo id={id("arquivo-erro")} texto={erros.arquivo} />
      </section>

      {/* Dados da nota */}
      <section aria-labelledby={id("dados")} className="mt-7 space-y-4">
        <TituloDaSecao id={id("dados")}>Dados da nota</TituloDaSecao>
        <div className="space-y-1.5">
          <Rotulo htmlFor={id("valor")}>Valor da nota</Rotulo>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-medium text-muted-foreground" aria-hidden="true">R$</span>
            <CampoDoPortal
              id={id("valor")} inputMode="numeric" autoComplete="off" placeholder="0,00" className="pl-11 tabular-nums"
              value={valor} onChange={(ev) => { setValor(mascararReais(ev.target.value)); limparErro("valor"); }}
              invalido={!!erros.valor} aria-describedby={desc("valor", id("valor-dica"))}
            />
          </div>
          <ErroDoCampo id={id("valor-erro")} texto={erros.valor} />
          {divergente ? (
            <p id={id("valor-dica")} role="status" className="m-0 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] font-medium leading-snug text-warning">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Diferente do valor da OC ({reaisDaPresenca(inst.valor)}). Pode enviar assim — o DP confere e, se precisar, devolve.</span>
            </p>
          ) : (
            <p id={id("valor-dica")} className="m-0 text-[13px] text-muted-foreground">Digite o valor que está na nota. O da OC é {reaisDaPresenca(inst.valor)}.</p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Rotulo htmlFor={id("numero")} opcional>Nº da nota</Rotulo>
            <CampoDoPortal id={id("numero")} inputMode="numeric" autoComplete="off" maxLength={40} placeholder="Ex.: 1234" value={numero} onChange={(ev) => setNumero(ev.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Rotulo htmlFor={id("cnpj")} opcional>CNPJ da nota</Rotulo>
            <CampoDoPortal
              id={id("cnpj")} inputMode="numeric" autoComplete="off" placeholder="00.000.000/0000-00" className="tabular-nums"
              value={cnpj} onChange={(ev) => { setCnpj(mascararCnpj(ev.target.value)); limparErro("cnpj"); }}
              invalido={!!erros.cnpj} aria-describedby={desc("cnpj", id("cnpj-dica"))}
            />
            <ErroDoCampo id={id("cnpj-erro")} texto={erros.cnpj} />
          </div>
        </div>
        <p id={id("cnpj-dica")} className="m-0 -mt-2 text-[13px] leading-snug text-muted-foreground">
          CNPJ em branco = o que você confirmou{p.confirmacao?.cnpj ? <> (<span className="tabular-nums">{p.confirmacao.cnpj}</span>)</> : ""}.
        </p>
      </section>

      {/* Conta */}
      <section aria-labelledby={id("conta-titulo")} className="mt-7">
        <TituloDaSecao id={id("conta-titulo")}>Conta para receber</TituloDaSecao>
        {pedirConta ? (
          <fieldset className="m-0 min-w-0 space-y-4 rounded-xl border border-border bg-card p-4">
            <legend className="sr-only">Conta bancária do CNPJ</legend>
            <p className="m-0 flex items-start gap-2.5 text-[13px] leading-snug text-foreground/80">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>É a conta do CNPJ que emite a nota — o pagamento cai nela. Fica guardada de forma protegida (criptografada) e só o DP vê. Depois de enviada, mudanças passam pelo DP.</span>
            </p>
            <div className="grid grid-cols-[104px,1fr] items-start gap-3">
              <div className="space-y-1.5">
                <Rotulo htmlFor={id("banco")}>Banco</Rotulo>
                <CampoDoPortal
                  id={id("banco")} inputMode="numeric" maxLength={3} placeholder="341" autoComplete="off" className="tabular-nums"
                  value={conta.banco} onChange={(ev) => mudarConta("banco", ev.target.value.replace(/\D/g, ""))}
                  invalido={!!erros.banco} aria-describedby={desc("banco", id("banco-nome"))}
                />
              </div>
              <p id={id("banco-nome")} aria-live="polite" className={cn("m-0 flex min-h-12 items-center self-end text-[13px] leading-snug", banco ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {banco ?? (conta.banco.length === 3 ? "Fora da lista dos mais usados — confira o código." : "Código do banco (3 números)")}
              </p>
            </div>
            <ErroDoCampo id={id("banco-erro")} texto={erros.banco} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Rotulo htmlFor={id("agencia")}>Agência</Rotulo>
                <CampoDoPortal id={id("agencia")} inputMode="numeric" maxLength={7} placeholder="1234" autoComplete="off" className="tabular-nums"
                  value={conta.agencia} onChange={(ev) => mudarConta("agencia", ev.target.value)} invalido={!!erros.agencia} aria-describedby={desc("agencia")} />
                <ErroDoCampo id={id("agencia-erro")} texto={erros.agencia} />
              </div>
              <div className="space-y-1.5">
                <Rotulo htmlFor={id("conta")}>Conta com dígito</Rotulo>
                <CampoDoPortal id={id("conta")} inputMode="numeric" maxLength={16} placeholder="12345-6" autoComplete="off" className="tabular-nums"
                  value={conta.conta} onChange={(ev) => mudarConta("conta", ev.target.value)} invalido={!!erros.conta} aria-describedby={desc("conta")} />
                <ErroDoCampo id={id("conta-erro")} texto={erros.conta} />
              </div>
            </div>
            <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={desc("tipoConta")}>
              <legend className="mb-1.5 p-0 text-sm font-semibold">Tipo de conta</legend>
              <div className="grid grid-cols-3 gap-2" id={id("tipoConta")} tabIndex={-1}>
                {TIPOS_DE_CONTA.map((t) => (
                  <label key={t} className={cn(
                    "flex min-h-12 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-[13px] font-semibold leading-tight transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    conta.tipoConta === t ? "border-primary bg-brand-soft text-primary" : erros.tipoConta ? "border-danger/60" : "border-border hover:bg-muted/60",
                  )}>
                    <input type="radio" name={id("tipo")} value={t} checked={conta.tipoConta === t} onChange={() => mudarConta("tipoConta", t)} className="sr-only" />
                    {TIPO_CURTO[t]}
                  </label>
                ))}
              </div>
              <ErroDoCampo id={id("tipoConta-erro")} texto={erros.tipoConta} />
            </fieldset>
            <div className="space-y-1.5">
              <Rotulo htmlFor={id("titular")}>Titular da conta</Rotulo>
              <CampoDoPortal id={id("titular")} maxLength={120} autoComplete="off" placeholder="Nome ou razão social do titular"
                value={conta.titular} onChange={(ev) => mudarConta("titular", ev.target.value)} invalido={!!erros.titular} aria-describedby={desc("titular")} />
              <ErroDoCampo id={id("titular-erro")} texto={erros.titular} />
            </div>
            <div className="border-t border-border pt-4">
              <p className="m-0 text-sm font-semibold">PIX <span className="font-normal text-muted-foreground">(opcional)</span></p>
              <div className="mt-1.5 grid grid-cols-[minmax(0,140px),1fr] gap-3">
                <div className="space-y-1.5">
                  <label htmlFor={id("pixTipo")} className="sr-only">Tipo da chave PIX</label>
                  <select id={id("pixTipo")} className={CLASSE_SELECT} value={conta.pixTipo} aria-invalid={!!erros.pixTipo || undefined}
                    onChange={(ev) => mudarConta("pixTipo", ev.target.value)} aria-describedby={desc("pixTipo")}>
                    <option value="">Tipo</option>
                    {TIPOS_DE_PIX.map((t) => <option key={t} value={t}>{TIPO_DE_PIX_LABEL[t]}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={id("pixChave")} className="sr-only">Chave PIX</label>
                  <CampoDoPortal id={id("pixChave")} autoComplete="off" maxLength={77} placeholder="Chave PIX"
                    value={conta.pixChave} onChange={(ev) => mudarConta("pixChave", ev.target.value)} invalido={!!erros.pixChave} aria-describedby={desc("pixChave")} />
                </div>
              </div>
              <ErroDoCampo id={id("pixTipo-erro")} texto={erros.pixTipo} />
              <ErroDoCampo id={id("pixChave-erro")} texto={erros.pixChave} />
            </div>
          </fieldset>
        ) : n.contaBancaria.cadastrada ? (
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <ContaMascarada conta={n.contaBancaria} />
            <p className="m-0 mt-3 flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
              <Lock className="mt-px h-4 w-4 shrink-0" aria-hidden="true" /> Já cadastrada e guardada protegida. Para trocar, fale com o DP.
            </p>
          </div>
        ) : (
          <p className="m-0 rounded-xl border border-border bg-card px-4 py-3.5 text-sm text-muted-foreground">O DP cuida da conta deste pagamento.</p>
        )}
      </section>

      {falha && (
        <div ref={falhaRef} className="mt-5">
          <Aviso role="alert" tom={falha.titulo === "Sem conexão" ? "atencao" : "erro"} titulo={falha.titulo}>{falha.texto}</Aviso>
        </div>
      )}

      <BotaoPrincipal type="submit" className="mt-5" carregando={enviando} textoCarregando="Enviando a nota…" icone={devolvida ? RefreshCw : Send} disabled={preparando}>
        {devolvida ? "Enviar de novo" : "Enviar nota fiscal"}
      </BotaoPrincipal>
      <p className="m-0 mt-2 flex items-center justify-center gap-1.5 text-center text-[13px] text-muted-foreground">
        <CircleDollarSign className="h-4 w-4" aria-hidden="true" /> O DP confere e programa o pagamento.
      </p>
    </form>
  );
}
