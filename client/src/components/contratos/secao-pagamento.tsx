/**
 * Seção "Pagamento (só DP)" do cadastro do colaborador (26/10).
 *
 * Mostra e edita: CNPJ(s) emissor(es) — os contratos ligados à pessoa, com o
 * selo "contrato ativo" —, banco, agência, conta, tipo de conta, chave PIX
 * (com tipo), titular e e-mail. Só admin e financial: para os outros papéis
 * o componente não existe (e o servidor responde 403 de qualquer forma).
 *
 * Os dados bancários chegam decifrados, mas aparecem MASCARADOS até a pessoa
 * pedir "Mostrar" — a ficha costuma ficar aberta na tela. Sem a chave de
 * criptografia no servidor, banco/agência/conta/PIX ficam desabilitados com o
 * aviso; e-mail e titular continuam editáveis.
 */
import { useState } from "react";
import { AlertTriangle, Building2, Eye, EyeOff, KeyRound, Link2, Loader2, PencilLine, Plus, Save, Unlink, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { isApiError } from "@/lib/queryClient";
import { apiErrorMessage, cn } from "@/lib/utils";
import { isFinanceRole } from "@shared/roles";
import { normalizarBusca, situacaoContaComoAtiva } from "@shared/contratos";
import {
  CAMPOS_CIFRADOS, PAGAMENTO_VAZIO, TIPOS_DE_CONTA, TIPOS_DE_PIX, TIPO_DE_CONTA_LABEL, TIPO_DE_PIX_LABEL, mascararAgencia, mascararChavePix,
  mascararConta, nomeDoBanco, rotuloDoBanco, titularBateComRazaoSocial, validarPagamento,
  type CampoCifrado, type DadosDePagamento, type ErrosDoPagamento, type TipoDeConta, type TipoDePix,
} from "@shared/pagamento";
import { useContratos, useMutacoesDeContrato, usePagamento, useSalvarPagamento, type RespostaDoPagamento } from "./api";
import { SeloContratoAtivo, SituacaoDoContratoBadge } from "./pecas";
import { ContratoDialog } from "./contrato-dialog";
import { MudancasDoPagamento } from "./alteracoes-de-conta";

const PLACEHOLDER_DO_PIX: Record<TipoDePix, string> = {
  cpf: "000.000.000-00", cnpj: "00.000.000/0000-00", email: "nome@exemplo.com", telefone: "(11) 98765-4321", aleatoria: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
};

type Form = { [K in keyof DadosDePagamento]: string };
const paraForm = (p: DadosDePagamento | null): Form => {
  const d = p ?? PAGAMENTO_VAZIO;
  return { banco: d.banco ?? "", agencia: d.agencia ?? "", conta: d.conta ?? "", tipoConta: d.tipoConta ?? "", pixTipo: d.pixTipo ?? "", pixChave: d.pixChave ?? "", titular: d.titular ?? "", email: d.email ?? "" };
};
const doForm = (f: Form): DadosDePagamento => ({
  banco: f.banco || null, agencia: f.agencia || null, conta: f.conta || null, tipoConta: (f.tipoConta || null) as TipoDeConta | null,
  pixTipo: (f.pixTipo || null) as TipoDePix | null, pixChave: f.pixChave || null, titular: f.titular || null, email: f.email || null,
});

function Linha({ rotulo, valor, mono, vazio = "Não informado", className }: { rotulo: string; valor: string | null | undefined; mono?: boolean; vazio?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-2xs font-medium text-muted-foreground">{rotulo}</dt>
      <dd className={cn("mt-0.5 break-words text-sm", mono && "font-mono tabular-nums text-[13px]", !valor && "text-muted-foreground")}>{valor || vazio}</dd>
    </div>
  );
}

export function SecaoPagamento({ collaboratorId, nome }: { collaboratorId: string; nome: string }) {
  const { user } = useAuth();
  const dp = isFinanceRole(user?.role);
  const q = usePagamento(collaboratorId, dp);
  if (!dp) return null;
  return (
    <section className="ctr-pagamento rounded-xl border border-border bg-card" data-testid="secao-pagamento" aria-labelledby={`pag-titulo-${collaboratorId}`}>
      <header className="flex items-center gap-2 px-4 pb-2 pt-3">
        <Wallet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <h3 id={`pag-titulo-${collaboratorId}`} className="text-xs font-semibold text-foreground">Pagamento</h3>
        <span className="inline-flex h-[18px] items-center rounded-full border border-border bg-surface-muted px-1.5 text-[11px] font-semibold text-muted-foreground" title="Só o DP (administrador e Financeiro) vê e edita esta seção">só DP</span>
      </header>
      <div className="px-4 pb-3.5">
        {q.isLoading && <div className="space-y-2" aria-busy="true" aria-label="Carregando dados de pagamento"><div className="val-osso h-4 w-2/3" /><div className="val-osso h-10 w-full" /></div>}
        {q.error && <p role="alert" className="text-xs text-danger">{apiErrorMessage(q.error, "Não foi possível carregar os dados de pagamento.")}</p>}
        {q.data && <Conteudo key={`${collaboratorId}:${q.data.pagamento?.versao ?? 0}`} collaboratorId={collaboratorId} nome={nome} r={q.data} />}
      </div>
    </section>
  );
}

function Conteudo({ collaboratorId, nome, r }: { collaboratorId: string; nome: string; r: RespostaDoPagamento }) {
  const [editando, setEditando] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const p = r.pagamento;
  const ilegivel = new Map(r.ilegiveis.map((i) => [i.campo, i.mensagem]));
  const temConta = !!(p?.banco || p?.conta || ilegivel.has("conta"));
  const temPix = !!(p?.pixChave || ilegivel.has("pixChave"));
  const valor = (campo: CampoCifrado, texto: string | null | undefined, mascara: (v: string) => string) =>
    ilegivel.has(campo) ? "Não foi possível ler" : texto ? (mostrar ? texto : mascara(texto)) : null;

  return (
    <div className="space-y-3.5">
      <CnpjsDoColaborador collaboratorId={collaboratorId} nome={nome} r={r} />

      {!r.chaveConfigurada && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning" data-testid="pag-sem-chave">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Banco, agência, conta e PIX estão desabilitados: falta configurar a chave de criptografia (<span className="font-mono">PAGAMENTO_CHAVE</span>) no servidor. E-mail e titular continuam editáveis.</span>
        </div>
      )}
      {r.chaveConfigurada && r.ilegiveis.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{r.ilegiveis[0].mensagem} ({r.ilegiveis.map((i) => ({ banco: "banco", agencia: "agência", conta: "conta", pixChave: "PIX" })[i.campo]).join(", ")})</span>
        </div>
      )}

      {editando ? (
        <FormularioDePagamento collaboratorId={collaboratorId} r={r} onFechar={() => setEditando(false)} />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-surface-muted/50 px-3 py-3">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Conta e PIX</p>
              {(temConta || temPix) && r.chaveConfigurada && (
                <button type="button" onClick={() => setMostrar((m) => !m)} aria-pressed={mostrar} data-testid="pag-mostrar"
                  className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs font-medium text-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {mostrar ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                  {mostrar ? "Ocultar" : "Mostrar"}
                </button>
              )}
            </div>
            {!p && !temConta && !temPix ? (
              <p className="text-xs text-muted-foreground">Nenhum dado de pagamento cadastrado.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Linha rotulo="Banco" valor={ilegivel.has("banco") ? "Não foi possível ler" : p?.banco ? rotuloDoBanco(p.banco) : null} className="col-span-2" />
                <Linha rotulo="Agência" valor={valor("agencia", p?.agencia, mascararAgencia)} mono />
                <Linha rotulo="Conta" valor={valor("conta", p?.conta, mascararConta)} mono />
                <Linha rotulo="Tipo de conta" valor={p?.tipoConta ? TIPO_DE_CONTA_LABEL[p.tipoConta] : null} />
                <Linha rotulo={p?.pixTipo ? `PIX · ${TIPO_DE_PIX_LABEL[p.pixTipo]}` : "PIX"} valor={valor("pixChave", p?.pixChave, (v) => mascararChavePix(p?.pixTipo, v))} mono />
                <Linha rotulo="Titular da conta" valor={p?.titular} className="col-span-2" />
                <Linha rotulo="E-mail" valor={p?.email} className="col-span-2" />
              </dl>
            )}
          </div>
          {r.avisos.map((a, i) => (
            <p key={i} role="status" className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning" data-testid="pag-aviso">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{a}
            </p>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            {p?.atualizadoPorNome && <p className="text-2xs text-muted-foreground">Atualizado por {p.atualizadoPorNome} em {new Date(p.updatedAt).toLocaleDateString("pt-BR")}</p>}
            <Button type="button" variant="outline" size="sm" className="ml-auto h-8" onClick={() => setEditando(true)} data-testid="pag-editar">
              <PencilLine className="h-3.5 w-3.5" aria-hidden="true" /> {p ? "Editar pagamento" : "Cadastrar pagamento"}
            </Button>
          </div>
          {r.alteracoes.length > 0 && (
            <details className="group rounded-lg border border-border">
              <summary className="cursor-pointer list-none px-3 py-2 text-2xs font-medium text-slate-600 hover:text-foreground [&::-webkit-details-marker]:hidden">
                Últimas mudanças ({r.alteracoes.length}) <span className="text-muted-foreground group-open:hidden">· ver</span>
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {r.alteracoes.map((a) => (
                  <li key={a.id} className="space-y-1 px-3 py-2">
                    <MudancasDoPagamento a={a} compacto />
                    <p className="text-2xs text-muted-foreground">{a.porNome} · {new Date(a.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{a.mudaConta ? (a.conferidoEm ? ` · conferida por ${a.conferidoPorNome}` : " · a conferir") : ""}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** CNPJ(s) emissor(es): os contratos ligados à pessoa, com vincular/desvincular e "novo contrato". */
function CnpjsDoColaborador({ collaboratorId, nome, r }: { collaboratorId: string; nome: string; r: RespostaDoPagamento }) {
  const [vinculando, setVinculando] = useState(false);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const lista = useContratos(vinculando);
  const { vincular, desvincular } = useMutacoesDeContrato();
  const { toast } = useToast();
  const ligados = new Set(r.contratos.map((c) => c.id));
  const termo = normalizarBusca(busca);
  const digitos = busca.replace(/\D/g, "");
  const opcoes = (lista.data?.contratos ?? [])
    .filter((c) => !ligados.has(c.id))
    .filter((c) => !termo || normalizarBusca(c.razaoSocial).includes(termo) || (digitos.length >= 3 && c.cnpj.includes(digitos)))
    .slice(0, 6);
  const erro = (titulo: string) => (e: unknown) => toast({ variant: "destructive", title: titulo, description: apiErrorMessage(e, "Tente de novo.") });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">CNPJ emissor</p>
        <SeloContratoAtivo situacao={r.situacaoContratual} contratos={r.contratos} mostrarQuandoAtivo />
      </div>
      {r.contratos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum CNPJ ligado. Sem contrato ativo, a OC desta pessoa fica pendente.</p>
      ) : (
        <ul className="space-y-1.5">
          {r.contratos.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{c.razaoSocial}</p>
                <p className="font-mono text-2xs tabular-nums text-muted-foreground">{c.cnpj}</p>
              </div>
              <SituacaoDoContratoBadge situacao={c.situacao} />
              <button type="button" aria-label={`Desvincular ${c.razaoSocial}`} disabled={desvincular.isPending}
                onClick={() => desvincular.mutate({ id: c.id, colaboradorId: collaboratorId }, { onError: erro("Não foi possível desvincular") })}
                className="val-alvo inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
                <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {vinculando ? (
        <div className="ctr-entra space-y-1.5 rounded-lg border border-border bg-surface-muted/50 p-2">
          <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Razão social ou CNPJ" aria-label="Buscar contrato para vincular" className="h-9 rounded-lg bg-card text-sm"
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setVinculando(false); } }} />
          {lista.isLoading ? <p className="px-1 text-2xs text-muted-foreground">Carregando contratos…</p> : (
            <ul className="space-y-0.5">
              {opcoes.map((c) => (
                <li key={c.id}>
                  <button type="button" disabled={vincular.isPending}
                    onClick={() => vincular.mutate({ id: c.id, colaboradorId: collaboratorId }, { onSuccess: () => { setVinculando(false); setBusca(""); toast({ variant: "success", title: "CNPJ vinculado", description: `${c.razaoSocial} · ${nome}` }); }, onError: erro("Não foi possível vincular") })}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-card focus-visible:bg-card focus-visible:outline-none">
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{c.razaoSocial}</span>
                    <span className="shrink-0 font-mono text-2xs text-muted-foreground">{c.cnpjFormatado}</span>
                    {!situacaoContaComoAtiva(c.situacao) && <SituacaoDoContratoBadge situacao={c.situacao} />}
                  </button>
                </li>
              ))}
              {opcoes.length === 0 && <li className="px-2 py-1.5 text-2xs text-muted-foreground">{busca ? "Nenhum contrato com essa busca." : "Nenhum outro contrato cadastrado."}</li>}
            </ul>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => { setVinculando(false); setNovo(true); }} className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline"><Plus className="h-3 w-3" aria-hidden="true" />Cadastrar contrato novo</button>
            <button type="button" onClick={() => setVinculando(false)} className="ml-auto text-2xs text-muted-foreground hover:text-foreground">Cancelar</button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-primary hover:bg-brand-soft hover:text-primary" onClick={() => setVinculando(true)} data-testid="pag-vincular-cnpj">
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Vincular CNPJ
        </Button>
      )}
      <ContratoDialog aberto={novo} contrato={null} colaboradorInicial={collaboratorId} onClose={() => setNovo(false)} />
    </div>
  );
}

function FormularioDePagamento({ collaboratorId, r, onFechar }: { collaboratorId: string; r: RespostaDoPagamento; onFechar: () => void }) {
  const salvar = useSalvarPagamento(collaboratorId);
  const { toast } = useToast();
  const original = paraForm(r.pagamento);
  const [f, setF] = useState<Form>(original);
  const [erros, setErros] = useState<ErrosDoPagamento>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const ilegivel = new Set(r.ilegiveis.map((i) => i.campo));
  const semChave = !r.chaveConfigurada;
  const mudar = (k: keyof Form, v: string) => { setF((x) => ({ ...x, [k]: v })); setErros((e) => ({ ...e, [k]: undefined })); setErroGeral(null); };
  const banco = nomeDoBanco(f.banco);
  const titularNaoBate = !!f.titular.trim() && r.contratos.length > 0 && !r.contratos.some((c) => titularBateComRazaoSocial(f.titular, c.razaoSocial));
  const razaoParaSugerir = r.contratos.length === 1 ? r.contratos[0].razaoSocial : null;

  const enviar = async () => {
    // Campo cifrado ilegível e deixado em branco: não manda (o servidor mantém o que tem).
    const dados = doForm(f);
    const paraValidar = { ...dados };
    for (const c of CAMPOS_CIFRADOS) if (ilegivel.has(c) && !f[c]) paraValidar[c] = c === "banco" ? "000" : c === "pixChave" ? null : "0";
    if (ilegivel.has("pixChave") && !f.pixChave) paraValidar.pixTipo = null;
    const e = validarPagamento(paraValidar);
    if (Object.keys(e).length) { setErros(e); document.getElementById(`pag-f-${Object.keys(e)[0]}`)?.focus(); return; }
    const corpo: Record<string, unknown> = { versao: r.pagamento?.versao ?? 0, tipoConta: dados.tipoConta, pixTipo: dados.pixTipo, titular: dados.titular, email: dados.email };
    for (const c of CAMPOS_CIFRADOS) {
      if (semChave) continue;
      if (ilegivel.has(c) && !f[c]) continue;
      corpo[c] = dados[c];
    }
    if (semChave) { delete corpo.tipoConta; delete corpo.pixTipo; }
    try {
      const res = await salvar.mutateAsync(corpo as never);
      toast(res.semMudanca
        ? { title: "Nada mudou", description: "Os dados de pagamento já estavam assim." }
        : { variant: "success", title: "Pagamento salvo", description: res.mudouConta ? "A mudança de conta vai para a conferência de outra pessoa do DP." : undefined });
      onFechar();
    } catch (err) {
      if (isApiError(err) && typeof err.body?.campo === "string") {
        setErros({ [err.body.campo]: apiErrorMessage(err, "Campo inválido.") });
        return;
      }
      setErroGeral(apiErrorMessage(err, "Não foi possível salvar. Tente de novo."));
    }
  };

  const msg = (k: keyof Form) => erros[k] ? <p id={`pag-f-${k}-erro`} role="alert" className="text-2xs font-medium text-danger">{erros[k]}</p> : null;
  const dicaIlegivel = (k: CampoCifrado) => ilegivel.has(k) && !semChave ? <p className="text-2xs text-warning">Não deu para ler o valor gravado — deixe em branco para manter ou digite de novo.</p> : null;
  const classeCampo = "h-10 rounded-lg bg-card";
  const selectCls = "h-10 w-full rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <form className="ctr-entra space-y-3.5" noValidate onSubmit={(e) => { e.preventDefault(); void enviar(); }} data-testid="pag-form">
      <fieldset className="space-y-3" disabled={salvar.isPending}>
        <legend className="ctr-legenda">Conta bancária</legend>
        <div className="grid grid-cols-[96px_1fr] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pag-f-banco">Banco</Label>
            <Input id="pag-f-banco" inputMode="numeric" maxLength={3} placeholder="341" className={cn(classeCampo, "tabular-nums")} value={f.banco} disabled={semChave}
              onChange={(e) => mudar("banco", e.target.value.replace(/\D/g, ""))} aria-invalid={!!erros.banco} aria-describedby={erros.banco ? "pag-f-banco-erro" : "pag-f-banco-nome"} />
          </div>
          <div className="flex items-end pb-2.5">
            <p id="pag-f-banco-nome" className={cn("text-xs", banco ? "text-foreground" : "text-muted-foreground")} aria-live="polite">
              {semChave ? "—" : banco ?? (f.banco.length === 3 ? "Código fora da lista dos mais usados — confira." : "Código do banco (3 dígitos)")}
            </p>
          </div>
        </div>
        {msg("banco")}{dicaIlegivel("banco")}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pag-f-agencia">Agência</Label>
            <Input id="pag-f-agencia" placeholder="1234" maxLength={7} className={cn(classeCampo, "tabular-nums")} value={f.agencia} disabled={semChave}
              onChange={(e) => mudar("agencia", e.target.value)} aria-invalid={!!erros.agencia} aria-describedby={erros.agencia ? "pag-f-agencia-erro" : undefined} />
            {msg("agencia")}{dicaIlegivel("agencia")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pag-f-conta">Conta com dígito</Label>
            <Input id="pag-f-conta" placeholder="12345-6" maxLength={16} className={cn(classeCampo, "tabular-nums")} value={f.conta} disabled={semChave}
              onChange={(e) => mudar("conta", e.target.value)} aria-invalid={!!erros.conta} aria-describedby={erros.conta ? "pag-f-conta-erro" : undefined} />
            {msg("conta")}{dicaIlegivel("conta")}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pag-f-tipoConta">Tipo de conta</Label>
          <select id="pag-f-tipoConta" className={selectCls} value={f.tipoConta} disabled={semChave} onChange={(e) => mudar("tipoConta", e.target.value)} aria-invalid={!!erros.tipoConta}>
            <option value="">—</option>
            {TIPOS_DE_CONTA.map((t) => <option key={t} value={t}>{TIPO_DE_CONTA_LABEL[t]}</option>)}
          </select>
          {msg("tipoConta")}
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={salvar.isPending}>
        <legend className="ctr-legenda">PIX</legend>
        <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="pag-f-pixTipo">Tipo da chave</Label>
            <select id="pag-f-pixTipo" className={selectCls} value={f.pixTipo} disabled={semChave} onChange={(e) => mudar("pixTipo", e.target.value)} aria-invalid={!!erros.pixTipo}>
              <option value="">—</option>
              {TIPOS_DE_PIX.map((t) => <option key={t} value={t}>{TIPO_DE_PIX_LABEL[t]}</option>)}
            </select>
            {msg("pixTipo")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pag-f-pixChave">Chave</Label>
            <Input id="pag-f-pixChave" className={classeCampo} value={f.pixChave} disabled={semChave} maxLength={80}
              placeholder={f.pixTipo ? PLACEHOLDER_DO_PIX[f.pixTipo as TipoDePix] : "Escolha o tipo"}
              onChange={(e) => mudar("pixChave", e.target.value)} aria-invalid={!!erros.pixChave} aria-describedby={erros.pixChave ? "pag-f-pixChave-erro" : undefined} />
            {msg("pixChave")}{dicaIlegivel("pixChave")}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={salvar.isPending}>
        <legend className="ctr-legenda">Titular e contato</legend>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="pag-f-titular">Titular da conta</Label>
            {razaoParaSugerir && f.titular !== razaoParaSugerir && (
              <button type="button" className="text-2xs font-medium text-primary hover:underline" onClick={() => mudar("titular", razaoParaSugerir)}>Usar a razão social</button>
            )}
          </div>
          <Input id="pag-f-titular" className={classeCampo} value={f.titular} maxLength={120} onChange={(e) => mudar("titular", e.target.value)} />
          {titularNaoBate && <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-warning" role="status"><AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />Não bate com a razão social do CNPJ ({r.contratos.map((c) => c.razaoSocial).join("; ")}). Confira antes de pagar.</p>}
          {msg("titular")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pag-f-email">E-mail</Label>
          <Input id="pag-f-email" type="email" className={classeCampo} value={f.email} maxLength={254} placeholder="Para enviar a OC e o comprovante" onChange={(e) => mudar("email", e.target.value)} aria-invalid={!!erros.email} />
          {msg("email")}
        </div>
      </fieldset>

      {erroGeral && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{erroGeral}</p>}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={onFechar} disabled={salvar.isPending}>Cancelar</Button>
        <Button type="submit" size="sm" className="h-9" disabled={salvar.isPending} data-testid="pag-salvar">
          {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
          {salvar.isPending ? "Salvando…" : "Salvar pagamento"}
        </Button>
      </div>
    </form>
  );
}
