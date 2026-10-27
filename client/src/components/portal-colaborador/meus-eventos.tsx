/**
 * Meus eventos: o que fazer HOJE em destaque no topo e, abaixo, as prestações
 * liberadas pelo DP (só as do fluxo novo, já no Realizado).
 */
import { useLocation } from "wouter";
import { CalendarX2, ChevronRight, ClipboardCheck, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { acaoDeHoje, comMaiuscula, diaDaSemana, diaEMes, periodo, situacaoDaPrestacao, type AcaoDeHoje } from "./formatos";
import { BotaoDeMarcacao } from "./marcacao";
import { BotaoPrincipal, Pilula, TituloDaSecao } from "./pecas";
import type { EuDoPortal, PrestacoesDoPortal, PrestacaoDoPortal } from "./tipos";

function CartaoDeHoje({ acao, hoje }: { acao: AcaoDeHoje; hoje: string }) {
  const [, navegar] = useLocation();
  const p = acao.prestacao;
  const titulo = acao.tipo === "confirmar" ? "Falta confirmar" : "Hoje";
  return (
    <section aria-labelledby="hoje-titulo" className="relative overflow-hidden rounded-2xl border border-primary/15 bg-brand-soft p-4 sm:p-5">
      <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
      <p id="hoje-titulo" className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-primary">
        {titulo} · {p.evento.nome}
      </p>
      <p className="m-0 mt-1.5 text-[15px] leading-snug text-foreground/85">
        {acao.tipo === "entrada" && <>Chegou na arena? Faça o check-in com uma selfie.</>}
        {acao.tipo === "saida" && <>Você entrou às <strong className="font-semibold tabular-nums">{acao.dia.entrada?.hora}</strong>. Na saída, faça o check-out.</>}
        {acao.tipo === "confirmar" && <>O trabalho terminou. Confira os dias e escolha o CNPJ que emite a nota.</>}
      </p>
      {p.funcao && <p className="m-0 mt-1 text-[13px] text-muted-foreground">{p.funcao}{p.evento.cidade ? ` · ${p.evento.cidade}` : ""}</p>}
      <div className="mt-4">
        {acao.tipo === "confirmar" ? (
          <BotaoPrincipal type="button" icone={ClipboardCheck} onClick={() => navegar(`/evento/${p.id}/confirmar`)}>Confirmar meus dias</BotaoPrincipal>
        ) : (
          <BotaoDeMarcacao alvo={{ actualId: p.id, dia: hoje, tipo: acao.tipo, evento: p.evento.nome }} />
        )}
      </div>
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
  const diaSemana = diaDaSemana(hoje);
  return (
    <div className="space-y-6">
      <div>
        <p className="m-0 text-sm font-medium text-muted-foreground">{comMaiuscula(diaSemana)}, {diaEMes(hoje)}</p>
        <h1 className="m-0 mt-0.5 text-2xl font-bold leading-tight tracking-tight">Olá, {eu.colaborador.primeiroNome}</h1>
      </div>

      {acao && <CartaoDeHoje acao={acao} hoje={hoje} />}

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
