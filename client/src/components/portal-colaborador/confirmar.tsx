/**
 * Confirmação final da prestação (decisão do dono, 26/10): o colaborador
 * revisa os dias, vê o valor (se o DP não ocultou), escolhe o CNPJ que emite a
 * nota — um dos contratos ligados a ele ou outro digitado (vira pendência para
 * o DP, não bloqueio) — e pode contestar. Refaz quantas vezes quiser até o
 * produtor fechar.
 */
import { useId, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { cnpjValido, digitosDoCnpj, erroDoCnpj, mascararCnpj } from "@shared/cnpj";
import { reaisDaPresenca } from "@shared/presenca";
import { CHAVE_PRESTACOES, confirmarPrestacao, mensagemDoErro } from "./api";
import { comMaiuscula, dataCurta, dataEHora, diaDaSemana, diasSugeridos, ESTADO_PARA_O_COLABORADOR } from "./formatos";
import { CabecalhoDoEvento, VoltarPara } from "./evento";
import { Aviso, BotaoPrincipal, BotaoSecundario, CampoDoPortal, TituloDaSecao } from "./pecas";
import type { CnpjDoPortal, PrestacaoDoPortal, RespostaDaConfirmacao } from "./tipos";

const OUTRO = "outro";
const MAX_CONTESTACAO = 2000;

function opcaoInicial(p: PrestacaoDoPortal, cnpjs: CnpjDoPortal[]): { opcao: string; outro: string; razao: string } {
  const anterior = p.confirmacao?.cnpj ? digitosDoCnpj(p.confirmacao.cnpj) : null;
  if (anterior) {
    const ligado = cnpjs.find((c) => digitosDoCnpj(c.cnpj) === anterior);
    if (ligado) return { opcao: ligado.cnpj, outro: "", razao: "" };
    return { opcao: OUTRO, outro: mascararCnpj(anterior), razao: p.confirmacao?.razaoSocial ?? "" };
  }
  const preferido = cnpjs.find((c) => c.ativo) ?? cnpjs[0];
  return preferido ? { opcao: preferido.cnpj, outro: "", razao: "" } : { opcao: OUTRO, outro: "", razao: "" };
}

/** Aviso sobre o contrato do CNPJ escolhido (null = tem contrato ativo, nada a dizer). */
export function avisoDoCnpj(opcao: string, outro: string, cnpjs: CnpjDoPortal[]): string | null {
  if (opcao !== OUTRO) {
    const c = cnpjs.find((x) => x.cnpj === opcao);
    return c && !c.ativo ? "O contrato desse CNPJ não está ativo — o DP vai conferir." : null;
  }
  if (!cnpjValido(outro)) return null;
  const ligado = cnpjs.find((x) => digitosDoCnpj(x.cnpj) === digitosDoCnpj(outro));
  if (ligado?.ativo) return null;
  if (ligado) return "O contrato desse CNPJ não está ativo — o DP vai conferir.";
  return "Esse CNPJ ainda não tem contrato — o DP vai conferir.";
}

function Confirmado({ p, r }: { p: PrestacaoDoPortal; r: RespostaDaConfirmacao["confirmacao"] }) {
  const [, navegar] = useLocation();
  return (
    <div role="status" aria-live="polite" className="casca-surgir">
      <div className="flex flex-col items-center px-2 pt-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft ring-8 ring-success-soft/50">
          <CheckCircle2 className="h-9 w-9 text-success-strong" aria-hidden="true" />
        </span>
        <h1 className="m-0 mt-5 text-2xl font-bold tracking-tight">Confirmação enviada</h1>
        <p className="m-0 mt-1.5 text-[15px] text-muted-foreground">{p.evento.nome} · {dataEHora(r.confirmadoEm)}</p>
      </div>
      <dl className="m-0 mt-6 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-4 text-sm">
        <dt className="text-muted-foreground">Dias</dt>
        <dd className="m-0 font-medium">{r.dias.length === 0 ? "nenhum" : r.dias.map(dataCurta).join(", ")}</dd>
        <dt className="text-muted-foreground">CNPJ</dt>
        <dd className="m-0 min-w-0 font-medium tabular-nums">{r.cnpj ?? "—"}{r.razaoSocial && <span className="block truncate font-normal text-muted-foreground">{r.razaoSocial}</span>}</dd>
        {r.contestacao && (<><dt className="text-muted-foreground">Seu recado</dt><dd className="m-0 whitespace-pre-line">{r.contestacao}</dd></>)}
      </dl>
      {!r.cnpjComContrato && (
        <Aviso tom="atencao" className="mt-3" titulo="CNPJ sem contrato ativo">O DP vai conferir antes do pagamento. Se precisar, ele fala com você.</Aviso>
      )}
      <p className="m-0 mt-4 text-center text-sm text-muted-foreground">Mudou algo? Você pode refazer até o produtor fechar a prestação.</p>
      <div className="mt-6 space-y-2">
        <BotaoPrincipal type="button" onClick={() => navegar(`/evento/${p.id}`)}>Voltar ao evento</BotaoPrincipal>
        <BotaoSecundario onClick={() => navegar("/")}>Ir para meus eventos</BotaoSecundario>
      </div>
    </div>
  );
}

export function TelaDeConfirmacao({ p, cnpjs }: { p: PrestacaoDoPortal; cnpjs: CnpjDoPortal[] }) {
  const queryClient = useQueryClient();
  const ids = { dias: useId(), cnpj: useId(), outro: useId(), razao: useId(), contestacao: useId(), erro: useId() };
  const inicial = useState(() => opcaoInicial(p, cnpjs))[0];
  const [dias, setDias] = useState<Set<string>>(() => new Set(diasSugeridos(p)));
  const [opcao, setOpcao] = useState(inicial.opcao);
  const [outro, setOutro] = useState(inicial.outro);
  const [razao, setRazao] = useState(inicial.razao);
  const [contestacao, setContestacao] = useState(p.confirmacao?.contestacao ?? "");
  const [erros, setErros] = useState<{ dias?: string; outro?: string }>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<RespostaDaConfirmacao["confirmacao"] | null>(null);
  const outroRef = useRef<HTMLInputElement>(null);
  const diasRef = useRef<HTMLFieldSetElement>(null);

  if (feito) return <Confirmado p={p} r={feito} />;

  if (!p.podeConfirmar) {
    return (
      <div>
        <VoltarPara texto="Voltar ao evento" para={`/evento/${p.id}`} />
        <CabecalhoDoEvento p={p} />
        <Aviso tom="info" className="mt-6" titulo="A confirmação não está aberta">
          {p.motivoNaoPodeConfirmar ?? "A confirmação abre depois do último dia de trabalho."}
        </Aviso>
      </div>
    );
  }

  const linhas = [
    ...p.dias.map((d) => ({ dia: d.dia, rotulo: ESTADO_PARA_O_COLABORADOR[d.estado].rotulo, horario: d.entrada ? `${d.entrada.hora}–${d.saida?.hora ?? "?"}` : null })),
    ...p.diasExtras.filter((x) => !p.dias.some((d) => d.dia === x)).map((dia) => ({ dia, rotulo: "Diária extra registrada pelo produtor", horario: null })),
  ];
  const aviso = avisoDoCnpj(opcao, outro, cnpjs);
  const cnpjEscolhido = opcao === OUTRO ? outro : opcao;
  const razaoEscolhida = opcao === OUTRO ? razao.trim() || null : cnpjs.find((c) => c.cnpj === opcao)?.razaoSocial ?? null;

  function alternar(dia: string) {
    setDias((s) => { const n = new Set(s); if (n.has(dia)) n.delete(dia); else n.add(dia); return n; });
    setErros((e) => ({ ...e, dias: undefined }));
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const novos: typeof erros = {};
    if (dias.size === 0 && !contestacao.trim()) novos.dias = "Marque os dias que você trabalhou — ou conte abaixo o que aconteceu.";
    if (opcao === OUTRO) novos.outro = !digitosDoCnpj(outro) ? "Digite o CNPJ (14 números)." : erroDoCnpj(outro) ?? undefined;
    setErros(novos);
    setErro(null);
    if (novos.dias) return diasRef.current?.querySelector("input")?.focus();
    if (novos.outro) return outroRef.current?.focus();
    setEnviando(true);
    try {
      const r = await confirmarPrestacao(p.id, {
        dias: Array.from(dias).sort(),
        cnpj: digitosDoCnpj(cnpjEscolhido),
        razaoSocial: razaoEscolhida,
        contestacao: contestacao.trim() || null,
      });
      setFeito(r.confirmacao);
      if (!navigator.userAgent.includes("jsdom")) window.scrollTo({ top: 0 });
      void queryClient.invalidateQueries({ queryKey: CHAVE_PRESTACOES });
    } catch (falha) {
      setErro(mensagemDoErro(falha, "Não foi possível enviar a confirmação. Tente de novo."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <VoltarPara texto="Voltar ao evento" para={`/evento/${p.id}`} />
      <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-primary">Confirmação final</p>
      <CabecalhoDoEvento p={p} />
      {p.confirmacao && (
        <Aviso tom="info" className="mt-4">Você já confirmou em {dataEHora(p.confirmacao.confirmadoEm)}. Enviar de novo troca a confirmação anterior.</Aviso>
      )}

      {/* Dias */}
      <fieldset ref={diasRef} className="m-0 mt-7 min-w-0 border-0 p-0" aria-describedby={erros.dias ? `${ids.dias}-erro` : undefined}>
        <legend className="mb-2.5 p-0"><TituloDaSecao>Dias que você trabalhou</TituloDaSecao></legend>
        <ul className="m-0 list-none space-y-2 p-0">
          {linhas.map((l) => {
            const marcado = dias.has(l.dia);
            return (
              <li key={l.dia}>
                <label className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 transition-colors", marcado ? "border-primary/40 bg-brand-soft/60" : "border-border hover:bg-muted/50")}>
                  <input type="checkbox" checked={marcado} onChange={() => alternar(l.dia)} className="h-5 w-5 shrink-0 accent-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{comMaiuscula(diaDaSemana(l.dia))}, {dataCurta(l.dia)}</span>
                    <span className="block text-[13px] text-muted-foreground">{l.rotulo}{l.horario ? ` · ${l.horario}` : ""}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {erros.dias && <p id={`${ids.dias}-erro`} role="alert" className="m-0 mt-2 text-[13px] font-medium text-danger">{erros.dias}</p>}
      </fieldset>

      {/* Valor */}
      <section className="mt-7" aria-labelledby={`${ids.cnpj}-valor`}>
        <TituloDaSecao id={`${ids.cnpj}-valor`}>Valor</TituloDaSecao>
        {p.valoresOcultos || !p.valores ? (
          <p className="m-0 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3.5 text-sm text-muted-foreground">
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" /> Valores: ocultos pelo DP até a ordem de compra
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-card px-4 py-3.5">
            <p className="m-0 text-[26px] font-bold leading-tight tracking-tight tabular-nums">{reaisDaPresenca(p.valores.valorFinal ?? p.valores.valorCalculado)}</p>
            <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">Calculado pelos dias e pelo que o produtor registrou. O DP confere antes do pagamento.</p>
          </div>
        )}
      </section>

      {/* CNPJ */}
      <fieldset className="m-0 mt-7 min-w-0 border-0 p-0">
        <legend className="mb-1 p-0"><TituloDaSecao>CNPJ que emite a nota</TituloDaSecao></legend>
        <p className="m-0 mb-2.5 text-[13px] text-muted-foreground">A nota fiscal deste trabalho sai por este CNPJ.</p>
        <div className="space-y-2">
          {cnpjs.map((c) => (
            <label key={c.cnpj} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 transition-colors", opcao === c.cnpj ? "border-primary/40 bg-brand-soft/60" : "border-border hover:bg-muted/50")}>
              <input type="radio" name={ids.cnpj} value={c.cnpj} checked={opcao === c.cnpj} onChange={() => { setOpcao(c.cnpj); setErros((e) => ({ ...e, outro: undefined })); }} className="h-5 w-5 shrink-0 accent-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold tabular-nums">{c.cnpj}</span>
                {c.razaoSocial && <span className="block truncate text-[13px] text-muted-foreground">{c.razaoSocial}</span>}
              </span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", c.ativo ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
                {c.ativo ? "Contrato ativo" : "Contrato inativo"}
              </span>
            </label>
          ))}
          <div className={cn("rounded-xl border bg-card transition-colors", opcao === OUTRO ? "border-primary/40 bg-brand-soft/60" : "border-border")}>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3.5 py-2.5">
              <input type="radio" name={ids.cnpj} value={OUTRO} checked={opcao === OUTRO} onChange={() => { setOpcao(OUTRO); setTimeout(() => outroRef.current?.focus(), 0); }} className="h-5 w-5 shrink-0 accent-primary" />
              <span className="text-[15px] font-semibold">{cnpjs.length ? "Outro CNPJ" : "Digite o CNPJ"}</span>
            </label>
            {opcao === OUTRO && (
              <div className="space-y-3 px-3.5 pb-3.5">
                <div className="space-y-1.5">
                  <label htmlFor={ids.outro} className="block text-sm font-semibold">CNPJ</label>
                  <CampoDoPortal
                    ref={outroRef} id={ids.outro} inputMode="numeric" placeholder="00.000.000/0000-00" autoComplete="off"
                    value={outro} onChange={(e) => { setOutro(mascararCnpj(e.target.value)); setErros((x) => ({ ...x, outro: undefined })); }}
                    invalido={!!erros.outro} aria-describedby={erros.outro ? `${ids.outro}-erro` : undefined}
                  />
                  {erros.outro && <p id={`${ids.outro}-erro`} className="m-0 text-[13px] font-medium text-danger">{erros.outro}</p>}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={ids.razao} className="block text-sm font-semibold">Razão social <span className="font-normal text-muted-foreground">(opcional)</span></label>
                  <CampoDoPortal id={ids.razao} value={razao} maxLength={200} onChange={(e) => setRazao(e.target.value)} autoComplete="organization" />
                </div>
              </div>
            )}
          </div>
        </div>
        {aviso && (
          <p role="status" className="m-0 mt-2.5 flex items-start gap-2 text-[13px] font-medium text-warning">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" /> {aviso}
          </p>
        )}
      </fieldset>

      {/* Contestação */}
      <div className="mt-7 space-y-1.5">
        <label htmlFor={ids.contestacao} className="mb-2.5 block text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Algo não bate? Conte aqui</label>
        <textarea
          id={ids.contestacao}
          value={contestacao}
          maxLength={MAX_CONTESTACAO}
          rows={3}
          onChange={(e) => { setContestacao(e.target.value); setErros((x) => ({ ...x, dias: undefined })); }}
          placeholder="Opcional. Ex.: trabalhei também no sábado, mas o check-in não abriu."
          className="block w-full resize-y rounded-lg border border-input bg-card px-3.5 py-3 text-base leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <p className="m-0 text-right text-xs tabular-nums text-muted-foreground">{contestacao.length}/{MAX_CONTESTACAO}</p>
      </div>

      {erro && <Aviso id={ids.erro} role="alert" tom="erro" className="mt-4">{erro}</Aviso>}

      <BotaoPrincipal type="submit" className="mt-5" carregando={enviando} textoCarregando="Enviando…" icone={ClipboardCheck}>
        {p.confirmacao ? "Enviar a nova confirmação" : "Confirmar"}
      </BotaoPrincipal>
      <p className="m-0 mt-2 text-center text-[13px] text-muted-foreground">Você pode refazer até o produtor fechar a prestação.</p>
    </form>
  );
}
