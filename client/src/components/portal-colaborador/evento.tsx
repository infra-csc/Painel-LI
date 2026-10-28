/**
 * Um evento do colaborador: os dias (com o check-in/check-out de HOJE), o que
 * o produtor registrou, os valores (ou "ocultos pelo DP"), a confirmação final
 * e — da OC em diante (28/10) — a nota fiscal e o pagamento, que sobem para o
 * topo porque passam a ser o que importa.
 */
import { useId, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Briefcase, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, EyeOff, ImageOff, Info, LogIn, LogOut, MapPin, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { reaisDaPresenca } from "@shared/presenca";
import {
  dataCurta, dataEHora, diaDaSemanaCurto, ESTADO_PARA_O_COLABORADOR, fraseDaOcorrencia, linhaDaMemoria, mesCurto, numeroDoDia, periodo,
} from "./formatos";
import { BotaoDeMarcacao } from "./marcacao";
import { BlocoDaNotaEPagamento } from "./nota-fiscal";
import { Aviso, BotaoPrincipal, BotaoSecundario, BotaoTexto, Pilula, TituloDaSecao } from "./pecas";
import { PrazoDoColaborador } from "./prazo";
import type { DiaDoPortal, MarcacaoDoPortal, OcorrenciaDoPortal, PrestacaoDoPortal } from "./tipos";

export function VoltarPara({ texto, para }: { texto: string; para: string }) {
  const [, navegar] = useLocation();
  return (
    <BotaoTexto onClick={() => navegar(para)} className="-ml-2 mb-2 text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {texto}
    </BotaoTexto>
  );
}

export function CabecalhoDoEvento({ p }: { p: PrestacaoDoPortal }) {
  return (
    <div>
      <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight">{p.evento.nome}</h1>
      <ul className="m-0 mt-2 list-none space-y-1 p-0 text-sm text-muted-foreground">
        <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />{periodo(p.evento.inicio, p.evento.fim)}</li>
        {p.evento.cidade && <li className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{p.evento.cidade}</span></li>}
        {p.funcao && <li className="flex items-center gap-2"><Briefcase className="h-4 w-4 shrink-0" aria-hidden="true" />{p.funcao}</li>}
      </ul>
    </div>
  );
}

function Horario({ tipo, m }: { tipo: "Entrada" | "Saída"; m: MarcacaoDoPortal | null }) {
  const Icone = tipo === "Entrada" ? LogIn : LogOut;
  return (
    <span className={cn("inline-flex items-center gap-1.5", !m && "text-muted-foreground/70")}>
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{tipo}</span>
      <strong className={cn("font-semibold tabular-nums", m ? "text-foreground" : "font-normal")}>{m ? m.hora : "—"}</strong>
    </span>
  );
}

function BlocoDaData({ dia, hoje }: { dia: string; hoje: boolean }) {
  return (
    <div className={cn("flex w-12 shrink-0 flex-col items-center rounded-lg py-1.5", hoje ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
      <span className={cn("text-[11px] font-semibold uppercase leading-none", hoje ? "text-primary-foreground/85" : "text-muted-foreground")}>{diaDaSemanaCurto(dia)}</span>
      <span className="mt-1 text-xl font-bold leading-none tabular-nums">{numeroDoDia(dia)}</span>
      <span className={cn("mt-0.5 text-[11px] leading-none", hoje ? "text-primary-foreground/85" : "text-muted-foreground")}>{mesCurto(dia)}</span>
    </div>
  );
}

function LinhaDoDia({ p, d, hoje, ocorrencias }: { p: PrestacaoDoPortal; d: DiaDoPortal; hoje: string; ocorrencias: OcorrenciaDoPortal[] }) {
  const ehHoje = d.dia === hoje;
  const estado = ESTADO_PARA_O_COLABORADOR[d.estado];
  const tipo = d.podeEntrar ? "entrada" : d.podeSair ? "saida" : null;
  const porProdutor = !!(d.entrada?.porRepresentante || d.saida?.porRepresentante);
  const mostrarHorarios = d.estado !== "futuro" && d.estado !== "falta" && d.estado !== "hoje_sem_checkin";
  return (
    <li className={cn("rounded-xl border bg-card p-3.5", ehHoje ? "border-primary/35 shadow-1" : "border-border")}>
      <div className="flex gap-3">
        <BlocoDaData dia={d.dia} hoje={ehHoje} />
        <div className="min-w-0 flex-1">
          <Pilula tom={estado.tom}>{estado.rotulo}</Pilula>
          {mostrarHorarios && (
            <p className="m-0 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <Horario tipo="Entrada" m={d.entrada} />
              <Horario tipo="Saída" m={d.saida} />
            </p>
          )}
          {(d.entrada?.fotoExpurgada || d.saida?.fotoExpurgada) && (
            <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <ImageOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Selfie apagada pela política de guarda · os horários ficam
            </p>
          )}
          {porProdutor && (
            <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Registrado pelo produtor
            </p>
          )}
          {ocorrencias.length > 0 && (
            <ul className="m-0 mt-2 list-none space-y-1 p-0">
              {ocorrencias.filter((o) => !(o.tipo === "falta" && d.estado === "falta")).map((o) => (
                <li key={o.id} className="text-[13px] font-medium text-foreground/80">{fraseDaOcorrencia(o)}</li>
              ))}
            </ul>
          )}
          {estado.dica && !p.checkoutFinalFeito && <p className="m-0 mt-1.5 text-[13px] leading-snug text-muted-foreground">{estado.dica}</p>}
        </div>
      </div>
      {tipo && (
        <BotaoDeMarcacao className="mt-3.5" alvo={{ actualId: p.id, dia: d.dia, tipo, evento: p.evento.nome }} />
      )}
    </li>
  );
}

function Valores({ p }: { p: PrestacaoDoPortal }) {
  const idDetalhe = useId();
  const [aberto, setAberto] = useState(false);
  if (p.valoresOcultos || !p.valores) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <EyeOff className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
        </span>
        <div>
          <p className="m-0 text-[15px] font-semibold">Valores: ocultos pelo DP até a ordem de compra</p>
          <p className="m-0 mt-0.5 text-[13px] leading-snug text-muted-foreground">Você confirma os dias e o CNPJ normalmente. O valor aparece aqui quando o DP liberar.</p>
        </div>
      </div>
    );
  }
  const v = p.valores;
  const final = v.valorFinal != null;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4">
      <p className="m-0 text-[13px] font-medium text-muted-foreground">{final ? "Valor final" : "Valor até agora"}</p>
      <p className="m-0 mt-0.5 text-[28px] font-bold leading-tight tracking-tight tabular-nums">{reaisDaPresenca(final ? v.valorFinal! : v.valorCalculado)}</p>
      <p className="m-0 mt-1 text-[13px] text-muted-foreground">
        Diária de <span className="font-medium text-foreground tabular-nums">{reaisDaPresenca(v.valorDaDiaria)}</span>
        {final ? " · fechado pelo produtor" : " · pode mudar até o produtor fechar"}
      </p>
      {v.memoria.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={idDetalhe}
            onClick={() => setAberto((x) => !x)}
            className="-mx-2 mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Como chegamos nesse valor
            <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", aberto && "rotate-180")} aria-hidden="true" />
          </button>
          {aberto && (
            <ol id={idDetalhe} className="m-0 mt-1 list-none space-y-2 border-l-2 border-border p-0 pl-3">
              {v.memoria.map((linha, i) => (
                <li key={i} className={cn("text-[13px] leading-snug", i === v.memoria.length - 1 ? "font-semibold text-foreground" : "text-foreground/80")}>
                  {linhaDaMemoria(linha)}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function Confirmacao({ p }: { p: PrestacaoDoPortal }) {
  const [, navegar] = useLocation();
  const c = p.confirmacao;
  if (c) {
    return (
      <div className="rounded-xl border border-success/20 bg-success-soft/60 px-4 py-4">
        <p className="m-0 flex items-center gap-2 text-[15px] font-semibold text-success">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> Você confirmou em {dataEHora(c.confirmadoEm)}
        </p>
        <dl className="m-0 mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Dias</dt>
          <dd className="m-0 font-medium">{c.dias.length === 0 ? "nenhum" : c.dias.map(dataCurta).join(", ")}</dd>
          <dt className="text-muted-foreground">CNPJ</dt>
          <dd className="m-0 min-w-0 font-medium tabular-nums">{c.cnpj ?? "—"}{c.razaoSocial && <span className="block truncate font-normal text-muted-foreground">{c.razaoSocial}</span>}</dd>
          {c.contestacao && (<><dt className="text-muted-foreground">Seu recado</dt><dd className="m-0 whitespace-pre-line">{c.contestacao}</dd></>)}
        </dl>
        {/* 28/10 (Fase 3): a contestação volta ao DP — a resposta dele aparece aqui. */}
        {c.contestacao && (
          c.respostaDoDp ? (
            <div className="mt-3 rounded-lg border border-border bg-card px-3.5 py-3" data-testid="resposta-do-dp">
              <p className="m-0 text-[13px] font-semibold text-muted-foreground">Resposta do DP{c.respostaDoDp.em ? ` · ${dataEHora(c.respostaDoDp.em)}` : ""}</p>
              <p className="m-0 mt-1 text-sm leading-snug whitespace-pre-line text-foreground">{c.respostaDoDp.texto}</p>
            </div>
          ) : (
            <p className="m-0 mt-3 text-[13px] text-muted-foreground" data-testid="aguardando-resposta-do-dp">O DP recebeu o seu recado e vai responder por aqui.</p>
          )
        )}
        {p.podeConfirmar ? (
          <>
            <p className="m-0 mt-3 text-[13px] text-muted-foreground">Mudou algo? Você pode refazer até o produtor fechar a prestação.</p>
            <BotaoSecundario className="mt-3" icone={ClipboardCheck} onClick={() => navegar(`/evento/${p.id}/confirmar`)}>Refazer a confirmação</BotaoSecundario>
          </>
        ) : p.checkoutFinalFeito && (
          <p className="m-0 mt-3 text-[13px] text-muted-foreground">O produtor já fechou esta prestação e enviou ao DP.</p>
        )}
      </div>
    );
  }
  if (p.podeConfirmar) {
    return (
      <div className="rounded-xl border border-primary/20 bg-brand-soft px-4 py-4">
        <p className="m-0 text-[15px] font-semibold">O trabalho terminou: confirme os seus dias</p>
        <p className="m-0 mt-1 text-sm leading-snug text-foreground/80">Revise os dias, escolha o CNPJ que emite a nota e, se algo não bater, conte para a gente.</p>
        {p.prazo && <PrazoDoColaborador prazo={p.prazo} className="mt-3" />}
        <BotaoPrincipal type="button" className="mt-4" icone={ClipboardCheck} onClick={() => navegar(`/evento/${p.id}/confirmar`)}>Confirmar meus dias</BotaoPrincipal>
      </div>
    );
  }
  return (
    <Aviso tom="info" icone={Info}>{p.motivoNaoPodeConfirmar ?? "A confirmação abre depois do último dia de trabalho."}</Aviso>
  );
}

export function TelaDoEvento({ p, hoje }: { p: PrestacaoDoPortal; hoje: string }) {
  const ocorrenciasDoDia = (dia: string) => p.ocorrencias.filter((o) => o.dia === dia);
  const extras = p.diasExtras.filter((d) => !p.dias.some((x) => x.dia === d));
  const semDia = p.ocorrencias.filter((o) => !o.dia || (!p.dias.some((d) => d.dia === o.dia) && !extras.includes(o.dia)));
  // Da OC em diante, a nota e o pagamento são o assunto: o bloco vai para o topo.
  const pagamentoNoTopo = !!p.notaEPagamento && p.notaEPagamento.estado !== "sem_oc";
  const pagamento = p.notaEPagamento ? (
    <section aria-labelledby="pagamento-titulo" className="mt-7">
      <TituloDaSecao id="pagamento-titulo">Nota fiscal e pagamento</TituloDaSecao>
      <BlocoDaNotaEPagamento p={p} />
    </section>
  ) : null;
  return (
    <div>
      <VoltarPara texto="Meus eventos" para="/" />
      <CabecalhoDoEvento p={p} />
      {pagamentoNoTopo && pagamento}

      <section aria-labelledby="dias-titulo" className="mt-7">
        <TituloDaSecao id="dias-titulo">Seus dias</TituloDaSecao>
        <ul className="m-0 list-none space-y-2.5 p-0">
          {p.dias.map((d) => <LinhaDoDia key={d.dia} p={p} d={d} hoje={hoje} ocorrencias={ocorrenciasDoDia(d.dia)} />)}
          {extras.map((dia) => (
            <li key={dia} className="flex gap-3 rounded-xl border border-border bg-card p-3.5">
              <BlocoDaData dia={dia} hoje={dia === hoje} />
              <div className="min-w-0 flex-1">
                <Pilula tom="ok">Diária extra</Pilula>
                <p className="m-0 mt-2 text-[13px] text-muted-foreground">Diária extra registrada pelo produtor</p>
              </div>
            </li>
          ))}
        </ul>
        {semDia.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-card px-4 py-3">
            <p className="m-0 text-[13px] font-semibold text-muted-foreground">Registrado pelo produtor</p>
            <ul className="m-0 mt-1 list-none space-y-1 p-0">
              {semDia.map((o) => <li key={o.id} className="text-sm font-medium">{fraseDaOcorrencia(o)}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="valores-titulo" className="mt-7">
        <TituloDaSecao id="valores-titulo">Valores</TituloDaSecao>
        <Valores p={p} />
      </section>

      <section aria-labelledby="confirmacao-titulo" className="mt-7">
        <TituloDaSecao id="confirmacao-titulo">Confirmação</TituloDaSecao>
        <Confirmacao p={p} />
      </section>
      {!pagamentoNoTopo && pagamento}
    </div>
  );
}
