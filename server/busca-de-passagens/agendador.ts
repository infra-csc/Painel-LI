/**
 * Agendador do ACOMPANHAR PREÇO (etapa 2, 09/10) — o primeiro job do app.
 *
 * Uma vez por dia, a partir da hora configurada pelo admin (São Paulo; padrão
 * 7h), roda a checagem dos preços acompanhados. Sem dependência nova: um
 * relógio de 10 em 10 minutos em cada instância, e o LOCK no banco — a linha
 * do dia em `busca_passagens_execucoes`, inserida com ON CONFLICT DO NOTHING.
 * Com réplicas (autoscale), só a instância que conseguir inserir roda; as
 * outras veem a linha e seguem. Nada aqui derruba o servidor.
 */
import { sql as drizzleSql } from "drizzle-orm";
import { db, linhasDe } from "../db";
import { hojeISO, FUSO_DA_OPERACAO } from "@shared/hoje-sp";
import { checarAcompanhamentos } from "./acompanhamento";
import { lerAjustes } from "./servico";

const DE_DEZ_EM_DEZ_MINUTOS = 10 * 60_000;
let relogio: ReturnType<typeof setInterval> | null = null;
let rodando = false;

/** Hora do dia (0–23) em São Paulo. */
export function horaEmSaoPaulo(agora = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: FUSO_DA_OPERACAO, hour: "numeric", hourCycle: "h23" }).format(agora);
  return Number(h) % 24;
}

/** Tenta pegar o dia (lock). true = esta instância roda a checagem de hoje. */
export async function pegarODia(dia: string, instancia: string): Promise<boolean> {
  const r = await db.execute(drizzleSql`
    INSERT INTO busca_passagens_execucoes (dia, instancia) VALUES (${dia}::date, ${instancia})
    ON CONFLICT (dia) DO NOTHING
    RETURNING dia
  `);
  return linhasDe(r).length > 0;
}

/** Uma volta do relógio: na hora certa e sem execução hoje, roda (uma vez). */
export async function talvezRodar(agora = new Date()): Promise<"fora_da_hora" | "ja_rodou" | "rodou" | "ocupado"> {
  if (rodando) return "ocupado";
  const ajustes = await lerAjustes();
  if (horaEmSaoPaulo(agora) < ajustes.horaDoAcompanhamento) return "fora_da_hora";
  const dia = hojeISO(FUSO_DA_OPERACAO, agora);
  if (!(await pegarODia(dia, `${process.pid}`))) return "ja_rodou";
  rodando = true;
  try {
    const resumo = await checarAcompanhamentos(null);
    await db.execute(drizzleSql`UPDATE busca_passagens_execucoes SET terminado_em = now(), resumo = ${JSON.stringify(resumo)}::jsonb WHERE dia = ${dia}::date`);
    console.warn(`[busca-de-passagens] acompanhamento do dia ${dia}: ${resumo.checadas} checadas, ${resumo.consultas} consultas, ${resumo.avisos} avisos.`);
    return "rodou";
  } catch (erro) {
    console.error("[busca-de-passagens] acompanhamento diário falhou:", erro instanceof Error ? erro.message : erro);
    await db.execute(drizzleSql`UPDATE busca_passagens_execucoes SET terminado_em = now(), resumo = ${JSON.stringify({ erro: "falhou" })}::jsonb WHERE dia = ${dia}::date`).catch(() => undefined);
    return "rodou";
  } finally {
    rodando = false;
  }
}

/** Liga o relógio no boot (idempotente). `PAINEL_SEM_AGENDADOR=1` desliga. */
export function iniciarAgendadorDaBusca(): void {
  if (relogio || process.env.PAINEL_SEM_AGENDADOR === "1") return;
  const volta = () => { void talvezRodar().catch((e) => console.error("[busca-de-passagens] agendador:", e instanceof Error ? e.message : e)); };
  // Primeira volta um minuto depois de subir (o boot termina antes).
  setTimeout(volta, 60_000).unref?.();
  relogio = setInterval(volta, DE_DEZ_EM_DEZ_MINUTOS);
  relogio.unref?.();
}
