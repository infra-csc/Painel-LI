/**
 * Passo único (16/10): os prazos do processo do dono passam a valer no banco.
 *
 * Os dias de cada etapa ficam em system_settings (`prazo_dias_*`) e o que está
 * gravado SOBRESCREVE o padrão do código. Produção pode ter os dias antigos da
 * planilha de 18/09 salvos pelo admin — trocar só o DIAS_PADRAO não mudaria
 * nada lá. Este passo grava os 7 valores novos e marca
 * `prazos_escala_versao = "2026-10-16"`.
 *
 * Roda na subida do servidor (server/ensure-schema.ts → garantirEstrutura) e
 * é idempotente: com a versão já gravada (ou uma mais nova), não faz nada — o
 * admin continua podendo editar os prazos depois sem ser desfeito no próximo
 * boot.
 *
 * Concorrência (autoscale sobe várias instâncias juntas): a marca de versão é
 * gravada PRIMEIRO, num UPSERT condicional dentro da mesma transação dos
 * valores. Só a instância cujo UPSERT de fato inseriu/atualizou a marca grava
 * os dias e o log; as outras esperam o lock da linha, reavaliam a condição e
 * saem sem tocar em nada.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { systemSettings } from "@shared/schema";
import {
  CHAVE_DA_VERSAO_DOS_PRAZOS, CHAVE_DO_PRAZO, DIAS_PADRAO, ETAPAS_COM_PRAZO, VERSAO_DOS_PRAZOS, lerDiasDosPrazos,
} from "@shared/prazos-da-escala";
import { createAuditLog } from "./routes/_compartilhado";

export type ResultadoDosPrazos = "aplicado" | "ja_aplicado";

export async function aplicarPrazosDoProcesso(): Promise<ResultadoDosPrazos> {
  const mudanca = await db.transaction(async (tx) => {
    const marcou = await tx.insert(systemSettings)
      .values({ key: CHAVE_DA_VERSAO_DOS_PRAZOS, value: VERSAO_DOS_PRAZOS, updatedBy: null })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: VERSAO_DOS_PRAZOS, updatedAt: new Date(), updatedBy: null },
        // Datas ISO comparam como texto: só avança, nunca volta nem repete.
        setWhere: sql`${systemSettings.value} < ${VERSAO_DOS_PRAZOS}`,
      })
      .returning({ id: systemSettings.id });
    if (marcou.length === 0) return null;

    const linhas = await tx.select().from(systemSettings);
    const versaoAnterior = linhas.find((l) => l.key === CHAVE_DA_VERSAO_DOS_PRAZOS && l.value !== VERSAO_DOS_PRAZOS)?.value ?? null;
    // "Antes" é o que estava GRAVADO (null = não gravado, valia o padrão do código).
    const antes = lerDiasDosPrazos(linhas);
    const gravadas = new Set(linhas.map((l) => l.key));
    const anterior: Record<string, number | string | null> = { [CHAVE_DA_VERSAO_DOS_PRAZOS]: versaoAnterior };
    const novo: Record<string, number | string | null> = { [CHAVE_DA_VERSAO_DOS_PRAZOS]: VERSAO_DOS_PRAZOS };
    for (const etapa of ETAPAS_COM_PRAZO) {
      const valor = DIAS_PADRAO[etapa];
      await tx.insert(systemSettings)
        .values({ key: CHAVE_DO_PRAZO[etapa], value: String(valor), updatedBy: null })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(valor), updatedAt: new Date(), updatedBy: null } });
      anterior[CHAVE_DO_PRAZO[etapa]] = gravadas.has(CHAVE_DO_PRAZO[etapa]) ? antes[etapa] : null;
      novo[CHAVE_DO_PRAZO[etapa]] = valor;
    }
    return { anterior, novo };
  });

  if (!mudanca) return "ja_aplicado";
  // Mesmo registro do PUT /api/escala/prazos, com o sistema como autor.
  await createAuditLog(
    "update", "system_settings", "prazos-escala", mudanca.novo,
    undefined, "Sistema (processo do dono 16/10)", mudanca.anterior,
  );
  return "aplicado";
}
