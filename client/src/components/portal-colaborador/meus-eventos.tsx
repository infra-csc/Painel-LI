/**
 * Meus eventos: o que fazer HOJE em destaque no topo (check-in, check-out,
 * nota fiscal a enviar ou devolvida, confirmação), as novidades do pagamento
 * (programado, pago) e, abaixo, as prestações liberadas pelo DP (só as do
 * fluxo novo, já no Realizado).
 */
import { useLocation } from "wouter";
import { BadgeCheck, CalendarClock, CalendarX2, ChevronRight, ClipboardCheck, MapPin, RefreshCw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { reaisDaPresenca } from "@shared/presenca";
import {
  acaoDeHoje, comMaiuscula, dataCurta, diaDaSemana, diaEMes, novidadesDoPagamento, periodo, situacaoDaPrestacao,
  type AcaoDeHoje, type NovidadeDoPagamento,
} from "./formatos";
import { BotaoDeMarcacao } from "./marcacao";
import { BotaoPrincipal, Pilula, TituloDaSecao } from "./pecas";
import { PrazoDoColaborador } from "./prazo";
import type { EuDoPortal, PrestacoesDoPortal, PrestacaoDoPortal } from "./tipos";

const TITULO_DA_ACAO: Record<AcaoDeHoje["tipo"], string> = {
  entrada: "Hoje", saida: "Hoje", confirmar: "Falta confirmar", enviar_nf: "Nota fiscal", reenviar_nf: "Nota devolvida",
};

function CartaoDeHoje({ acao, hoje }: { acao: AcaoDeHoje; hoje: string }) {
  const [, navegar] = useLocation();
  const p = acao.prestacao;
  const n = p.notaEPagamento;
  const devolvida = acao.tipo === "reenviar_nf";
  return (
    <section
      aria-labelledby="hoje-titulo"
      className={cn("relative overflow-hidden rounded-2xl border p-4 sm:p-5", devolvida ? "border-warning/25 bg-warning-soft" : "border-primary/15 bg-brand-soft")}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", devolvida ? "bg-warning-strong" : "bg-primary")} aria-hidden="true" />
      <p id="hoje-titulo" className={cn("m-0 text-[13px] font-semibold uppercase tracking-[0.06em]", devolvida ? "text-warning" : "text-primary")}>
        {TITULO_DA_ACAO[acao.tipo]} · {p.evento.nome}
      </p>
      <p className="m-0 mt-1.5 text-[15px] leading-snug text-foreground/85">
        {acao.tipo === "entrada" && <>Chegou na arena? Faça o check-in com uma selfie.</>}
        {acao.tipo === "saida" && <>Você entrou às <strong className="font-semibold tabular-nums">{acao.dia.entrada?.hora}</strong>. Na saída, faça o check-out.</>}
        {acao.tipo === "confirmar" && <>O trabalho terminou. Confira os dias e escolha o CNPJ que emite a nota.</>}
        {acao.tipo === "enviar_nf" && (
          <>
            A ordem de compra saiu
            {n?.oc && <> (OC nº <strong className="font-semibold tabular-nums">{n.oc.numero}</strong>{n.oc.valor != null && <> · <strong className="font-semibold tabular-nums">{reaisDaPresenca(n.oc.valor)}</strong></>})</>}.
            {" "}Envie a nota fiscal para receber.
          </>
        )}
        {devolvida && (
          n?.nota?.comentarioDoDp
            ? <>O DP devolveu a sua nota: <q className="font-medium text-foreground">{n.nota.comentarioDoDp}</q></>
            : <>O DP devolveu a sua nota. Corrija e envie de novo.</>
        )}
      </p>
      {p.funcao && <p className="m-0 mt-1 text-[13px] text-muted-foreground">{p.funcao}{p.evento.cidade ? ` · ${p.evento.cidade}` : ""}</p>}
      {/* 28/10 (Fase 3): o prazo do que está em destaque ("Confirme até…", "Envie a nota até…"). */}
      {acao.tipo !== "entrada" && acao.tipo !== "saida" && p.prazo && <PrazoDoColaborador prazo={p.prazo} className="mt-3" />}
      <div className="mt-4">
        {acao.tipo === "confirmar" ? (
          <BotaoPrincipal type="button" icone={ClipboardCheck} onClick={() => navegar(`/evento/${p.id}/confirmar`)}>Confirmar meus dias</BotaoPrincipal>
        ) : acao.tipo === "enviar_nf" || acao.tipo === "reenviar_nf" ? (
          <BotaoPrincipal type="button" icone={devolvida ? RefreshCw : Send} onClick={() => navegar(`/evento/${p.id}/nota-fiscal`)}>
            {devolvida ? "Enviar de novo" : "Enviar nota fiscal"}
          </BotaoPrincipal>
        ) : (
          <BotaoDeMarcacao alvo={{ actualId: p.id, dia: hoje, tipo: acao.tipo, evento: p.evento.nome }} />
        )}
      </div>
    </section>
  );
}

/** Pagamento programado (até sair) e pago nos últimos dias: a novidade boa, logo abaixo do destaque. */
function Novidades({ itens }: { itens: NovidadeDoPagamento[] }) {
  const [, navegar] = useLocation();
  return (
    <section aria-labelledby="novidades-titulo">
      <TituloDaSecao id="novidades-titulo">Pagamentos</TituloDaSecao>
      <ul className="m-0 list-none space-y-2 p-0">
        {itens.map(({ prestacao: p, tipo, data }) => {
          const Icone = tipo === "pago" ? BadgeCheck : CalendarClock;
          const valor = p.notaEPagamento?.oc?.valor;
          const titulo = tipo === "pago"
            ? data ? `Pago em ${dataCurta(data)}` : "Pago"
            : data ? `Pagamento programado para ${dataCurta(data)}` : "Pagamento programado";
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => navegar(`/evento/${p.id}`)}
                className="group flex w-full items-center gap-3 rounded-xl border border-success/20 bg-success-soft/70 px-4 py-3 text-left transition-[border-color,box-shadow] hover:border-success/40 hover:shadow-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-success">
                  <Icone className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug text-foreground">{titulo}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{p.evento.nome}{valor != null ? ` · ${reaisDaPresenca(valor)}` : ""}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CartaoDoEvento({ p, hoje, destaque }: { p: PrestacaoDoPortal; hoje: string; destaque: boolean }) {
  const [, navegar] = useLocation();
  const situacao = situacaoDaPrestacao(p, hoje);
  return (
    <li>
      <button
        type="button"
        onClick={() => navegar(`/evento/${p.id}`)}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          destaque ? "border-primary/25" : "border-border",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="m-0 text-base font-semibold leading-snug text-foreground">{p.evento.nome}</p>
          <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">
            {periodo(p.evento.inicio, p.evento.fim)}{p.funcao ? ` · ${p.funcao}` : ""}
          </p>
          {p.evento.cidade && (
            <p className="m-0 mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{p.evento.cidade}</span>
            </p>
          )}
          <div className="mt-2.5"><Pilula tom={situacao.tom}>{situacao.texto}</Pilula></div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </button>
    </li>
  );
}

export function TelaMeusEventos({ eu, dados }: { eu: EuDoPortal; dados: PrestacoesDoPortal }) {
  const { hoje, prestacoes } = dados;
  const acao = acaoDeHoje(prestacoes, hoje);
  const novidades = novidadesDoPagamento(prestacoes, hoje);
  const diaSemana = diaDaSemana(hoje);
  return (
    <div className="space-y-6">
      <div>
        <p className="m-0 text-sm font-medium text-muted-foreground">{comMaiuscula(diaSemana)}, {diaEMes(hoje)}</p>
        <h1 className="m-0 mt-0.5 text-2xl font-bold leading-tight tracking-tight">Olá, {eu.colaborador.primeiroNome}</h1>
      </div>

      {acao && <CartaoDeHoje acao={acao} hoje={hoje} />}

      {novidades.length > 0 && <Novidades itens={novidades} />}

      <section aria-labelledby="meus-eventos-titulo">
        <TituloDaSecao id="meus-eventos-titulo">Meus eventos</TituloDaSecao>
        {prestacoes.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <CalendarX2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="m-0 mt-4 text-base font-semibold">Nenhum evento liberado para você ainda</p>
            <p className="m-0 mt-1.5 max-w-[320px] text-sm leading-relaxed text-muted-foreground">
              Quando o DP liberar a sua participação num evento, ele aparece aqui. Dúvidas? Fale com o produtor do evento.
            </p>
          </div>
        ) : (
          <ul className="m-0 list-none space-y-2.5 p-0">
            {prestacoes.map((p) => (
              <CartaoDoEvento key={p.id} p={p} hoje={hoje} destaque={!!acao && acao.prestacao.id === p.id} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
