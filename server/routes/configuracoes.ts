/**
 * Configurações: prazos das etapas da escala (qualquer sessão lê, só admin
 * grava) e parâmetros financeiros do sistema (system_settings).
 * Papéis: financeiro (admin/RH) para os parâmetros; admin para os prazos.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { normalizeRole } from "@shared/roles";
import { CHAVE_DO_PRAZO, ETAPAS_COM_PRAZO, lerDiasDosPrazos, validarDiasDosPrazos } from "@shared/prazos-da-escala";
import { CENO_EMPREITA_SETTING_KEYS, cenoEmpreitaDefaultsMap } from "@shared/cenotecnica-empreita";
import { createAuditLog, requireFinanceUser, requireFinSession, usuarioDaSessao } from "./_compartilhado";

export function registrarConfiguracoes(app: Express): void {
  // ─── System Settings ──────────────────────────────────────────────
  // ── Prazos das etapas da vaga (18/09) ──────────────────────────────────
  // "Dias antes do evento" de cada etapa (registro, validação, aprovação,
  // escalação, escalado, passagem). Todo usuário logado LÊ — o Quadro das
  // Análises mostra a data limite de cada etapa —; só o administrador GRAVA.
  // Ficam em system_settings, fora da rota do Financeiro (que exige acesso
  // financeiro para ler).
  app.get("/api/escala/prazos", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Não autenticado" });
    try {
      const linhas = await storage.getSystemSettings();
      res.json({ dias: lerDiasDosPrazos(linhas) });
    } catch {
      res.status(500).json({ message: "Erro ao ler os prazos" });
    }
  });

  app.put("/api/escala/prazos", async (req, res) => {
    // Usuário REAL já carregado pelo gate global (mutação não roda em simulação).
    const user = usuarioDaSessao(req);
    if (!user) return res.status(401).json({ message: "Não autenticado" });
    if (normalizeRole(user.role) !== "admin") return res.status(403).json({ message: "Só o administrador altera os prazos." });
    const r = validarDiasDosPrazos(req.body ?? {});
    if ("erro" in r) return res.status(400).json({ message: r.erro });
    try {
      const antes = lerDiasDosPrazos(await storage.getSystemSettings());
      const anterior: Record<string, number> = {};
      const novo: Record<string, number> = {};
      for (const etapa of ETAPAS_COM_PRAZO) {
        const valor = r.dias[etapa];
        if (valor === undefined) continue;
        await storage.upsertSystemSetting(CHAVE_DO_PRAZO[etapa], String(valor), user.id);
        anterior[CHAVE_DO_PRAZO[etapa]] = antes[etapa];
        novo[CHAVE_DO_PRAZO[etapa]] = valor;
      }
      await createAuditLog("update", "system_settings", "prazos-escala", novo, user.id, user.name || "Administrador", anterior, req);
      res.json({ dias: lerDiasDosPrazos(await storage.getSystemSettings()) });
    } catch (error) {
      console.error("Erro ao salvar prazos:", error);
      res.status(500).json({ message: "Erro ao salvar os prazos" });
    }
  });

  app.get("/api/system-settings", async (req, res) => {
    if (!await requireFinSession(req, res)) return;
    try {
      const settings = await storage.getSystemSettings();
      const defaults: Record<string, number> = {
        default_mobility: 2500,
        default_weekday_lunch: 3500,
        default_weekday_dinner: 4000,
        default_weekend_lunch: 4000,
        default_weekend_dinner: 4500,
        default_daily_value: 5000,
        default_daily_value_weekday: 5000,
        default_daily_value_weekend: 5000,
        // Freela defaults (same as casa defaults when not set)
        default_daily_value_weekday_freela: 5000,
        default_daily_value_weekend_freela: 5000,
        default_mobility_ida_freela: 0,
        default_mobility_volta_freela: 0,
        default_weekday_lunch_freela: 3500,
        default_weekday_dinner_freela: 4000,
        default_weekend_lunch_freela: 4000,
        default_weekend_dinner_freela: 4500,
        // Tarifas de atendimento (Key Account / Executivo de Contas)
        atendimento_key_account: 58000,
        atendimento_executivo_contas: 46500,
        // Fatores de deflação (percentuais inteiros)
        deflacao_fator_ate_4: 100,
        deflacao_fator_5_8: 90,
        deflacao_fator_9_mais: 80,
        // Refeições flat (alimentação por voo)
        alimentacao_almoco: 4000,
        alimentacao_jantar: 4000,
        alimentacao_almoco_ceno: 3500,
        alimentacao_jantar_ceno: 3500,
        // Key Account / Gerente (regra 18/08) — Executivo de Contas fica em "demais"
        alimentacao_almoco_gestao: 4400,
        alimentacao_jantar_gestao: 4400,
        // Almoço do colaborador de casa (CLT) em dia útil — só a diferença do VR
        alimentacao_almoco_casa_util: 500,
        alimentacao_almoco_casa_util_ceno: 300,
        // Percurseiro (motoqueiro) — pacote fechado por diária (tabela 17/08)
        percurseiro_t1_motoqueiro: 70000,
        percurseiro_t2_motoqueiro: 80000,
        percurseiro_fee_pct: 15,
        percurseiro_alimentacao: 10200,
        percurseiro_transporte: 5000,
        percurseiro_nf_pct: 16,
        percurseiro_t1_nf: 17276,
        percurseiro_t2_nf: 19467,
        // Tarifas freela (regra do slide)
        freela_diaria_local: 46500,
        freela_diaria_viagem: 54000,
        freela_diaria_dir_prova: 82000,
        // Tarifas casa (regra do slide)
        casa_diaria_dir_prova: 75000,
        casa_diaria_produtor: 46500,
        casa_diaria_exec_vendas: 26000,
        // Cenotécnicos EMPREITA — valor fechado por nº de dias (tabela 19/08),
        // 4 modalidades × 2..6 dias (ver shared/cenotecnica-empreita.ts)
        ...cenoEmpreitaDefaultsMap(),
      };
      const result: Record<string, number> = { ...defaults };
      // Esta rota entrega VALORES (centavos e percentuais inteiros) — o cliente
      // tipa a resposta como Record<string, number>. system_settings, porém, é
      // uma tabela genérica de key/value em texto e já guarda chaves NÃO
      // numéricas (ex.: `escala_aprovador_padrao`, cujo value é um users.id).
      // Um parseInt nessas linhas viraria NaN e sairia como `null` no JSON,
      // poluindo a resposta — então ignoramos tudo que não for inteiro finito.
      // Chaves não numéricas têm caminho próprio (o aprovador padrão é lido em
      // GET /api/scaling-default-approver).
      // O teste é o value INTEIRO casar com um inteiro — parseInt sozinho não
      // serve, porque um UUID que comece com dígito ("3f2a-…") viraria 3.
      for (const s of settings) {
        const raw = (s.value ?? "").trim();
        if (!/^-?\d+$/.test(raw)) continue;
        const parsed = parseInt(raw, 10);
        if (!Number.isFinite(parsed)) continue;
        result[s.key] = parsed;
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching system settings:", error);
      res.status(500).json({ message: "Erro ao buscar configurações" });
    }
  });

  app.put("/api/system-settings", async (req, res) => {
    const user = await requireFinanceUser(req, res);
    if (!user) return;
    const userId = user.id;

    try {
      const allowed = [
        "default_mobility", "default_mobility_ida", "default_mobility_volta",
        "default_weekday_lunch", "default_weekday_dinner", "default_weekend_lunch", "default_weekend_dinner",
        "default_daily_value", "default_daily_value_weekday", "default_daily_value_weekend",
        // Freela-specific keys
        "default_daily_value_weekday_freela", "default_daily_value_weekend_freela",
        "default_mobility_ida_freela", "default_mobility_volta_freela",
        "default_weekday_lunch_freela", "default_weekday_dinner_freela",
        "default_weekend_lunch_freela", "default_weekend_dinner_freela",
        // Tarifas de atendimento (Key Account / Executivo de Contas)
        "atendimento_key_account", "atendimento_executivo_contas",
        // Fatores de deflação (percentuais inteiros)
        "deflacao_fator_ate_4", "deflacao_fator_5_8", "deflacao_fator_9_mais",
        // Refeições flat (alimentação por voo — Demais, Cenotécnica e Key Account / Gerente)
        "alimentacao_almoco", "alimentacao_jantar", "alimentacao_almoco_ceno", "alimentacao_jantar_ceno",
        "alimentacao_almoco_gestao", "alimentacao_jantar_gestao",
        // Almoço de casa (CLT) em dia útil (demais / cenotécnica)
        "alimentacao_almoco_casa_util", "alimentacao_almoco_casa_util_ceno",
        // Percurseiro (motoqueiro) — pacote fechado por diária
        "percurseiro_t1_motoqueiro", "percurseiro_t2_motoqueiro", "percurseiro_fee_pct",
        "percurseiro_alimentacao", "percurseiro_transporte", "percurseiro_nf_pct",
        "percurseiro_t1_nf", "percurseiro_t2_nf",
        // Tarifas freela (regra do slide: local / em viagem / dir de prova)
        "freela_diaria_local", "freela_diaria_viagem", "freela_diaria_dir_prova",
        // Tarifas casa (regra do slide: dir prova / produtor / exec vendas O2)
        "casa_diaria_dir_prova", "casa_diaria_produtor", "casa_diaria_exec_vendas",
        // Cenotécnicos EMPREITA — 20 células da tabela (4 modalidades × 2..6 dias)
        ...CENO_EMPREITA_SETTING_KEYS,
      ];
      // Fatores de deflação são PERCENTUAIS inteiros (0..100), não valores
      // monetários — gravados sem o ×100 dos demais.
      const PERCENT_KEYS = new Set(["deflacao_fator_ate_4", "deflacao_fator_5_8", "deflacao_fator_9_mais", "percurseiro_fee_pct", "percurseiro_nf_pct"]);
      // Valida tudo antes de gravar qualquer chave — um valor não numérico
      // gravava "NaN" no banco e quebrava o formulário de todos os usuários
      const updates: Array<[string, number]> = [];
      for (const key of allowed) {
        if (req.body[key] === undefined) continue;
        const parsed = parseFloat(req.body[key]);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return res.status(400).json({ message: `Valor inválido para "${key}" — informe um número maior ou igual a zero.` });
        }
        if (PERCENT_KEYS.has(key)) {
          if (parsed > 100) {
            return res.status(400).json({ message: `Percentual inválido para "${key}" — informe de 0 a 100.` });
          }
          updates.push([key, Math.round(parsed)]);
        } else {
          updates.push([key, Math.round(parsed * 100)]);
        }
      }
      for (const [key, val] of updates) {
        await storage.upsertSystemSetting(key, String(val), userId);
      }
      await createAuditLog('update', 'system_settings', 'global', req.body, userId, user.name || 'Sistema', undefined, req);
      res.json({ message: "Configurações salvas com sucesso" });
    } catch (error) {
      console.error("Error updating system settings:", error);
      res.status(500).json({ message: "Erro ao salvar configurações" });
    }
  });
}
