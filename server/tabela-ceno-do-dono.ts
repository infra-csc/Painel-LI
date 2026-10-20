/**
 * Passo único (20/10): a tabela de empreita da cenotécnica com os valores
 * fechados que o dono mandou ("valores corretos, cenotécnica") passa a valer
 * no banco.
 *
 * As 20 células ficam em system_settings (`ceno_empreita_<tipo>_<n>d`) e o que
 * está gravado SOBRESCREVE o padrão do código — produção tem os valores do
 * slide (com centavos) semeados pela migração de 19/08. Este passo grava os
 * valores de CENO_EMPREITA_DEFAULTS e marca `ceno_empreita_versao`.
 *
 * Mesmo desenho do passo dos prazos (server/prazos-do-processo.ts): roda na
 * subida, idempotente (com a versão gravada não faz nada — o admin continua
 * editando no Valores Padrão), e a marca de versão vai primeiro, na mesma
 * transação, para várias instâncias subindo juntas não repetirem.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { systemSettings } from "@shared/schema";
import {
  CENO_EMPREITA_DEFAULTS, CENO_EMPREITA_TABLE_DAYS, CENO_FREELA_TIPOS, CHAVE_DA_VERSAO_DA_TABELA_CENO,
  VERSAO_DA_TABELA_CENO, cenoEmpreitaSettingKey,
} from "@shared/cenotecnica-empreita";
import { createAuditLog } from "./routes/_compartilhado";

export type ResultadoDaTabelaCeno = "aplicado" | "ja_aplicado";

export async function aplicarTabelaCenoDoDono(): Promise<ResultadoDaTabelaCeno> {
  const mudanca = await db.transaction(async (tx) => {
    const marcou = await tx.insert(systemSettings)
      .values({ key: CHAVE_DA_VERSAO_DA_TABELA_CENO, value: VERSAO_DA_TABELA_CENO, updatedBy: null })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: VERSAO_DA_TABELA_CENO, updatedAt: new Date(), updatedBy: null },
        setWhere: sql`${systemSettings.value} < ${VERSAO_DA_TABELA_CENO}`,
      })
      .returning({ id: systemSettings.id });
    if (marcou.length === 0) return null;

    const linhas = await tx.select().from(systemSettings);
    const porChave = new Map(linhas.map((l) => [l.key, l.value]));
    const anterior: Record<string, string | null> = {};
    const novo: Record<string, string> = {};
    for (const tipo of CENO_FREELA_TIPOS) {
      for (const dias of CENO_EMPREITA_TABLE_DAYS) {
        const chave = cenoEmpreitaSettingKey(tipo, dias);
        const valor = String(CENO_EMPREITA_DEFAULTS[tipo][dias]);
        await tx.insert(systemSettings)
          .values({ key: chave, value: valor, updatedBy: null })
          .onConflictDoUpdate({ target: systemSettings.key, set: { value: valor, updatedAt: new Date(), updatedBy: null } });
        anterior[chave] = porChave.get(chave) ?? null;
        novo[chave] = valor;
      }
    }
    return { anterior, novo };
  });

  if (!mudanca) return "ja_aplicado";
  await createAuditLog(
    "update", "system_settings", "ceno-empreita", mudanca.novo,
    undefined, "Sistema (tabela da cenotécnica do dono 20/10)", mudanca.anterior,
  );
  return "aplicado";
}
