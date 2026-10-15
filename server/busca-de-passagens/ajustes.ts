/**
 * Ajustes da busca de passagens (etapa 2, 09/10) — só admin, na aba Consumo:
 * teto por trecho, acompanhamento (limite, queda que avisa, hora da checagem),
 * valor estimado da mala e as funções que despacham mala.
 *
 *  GET /api/busca-de-passagens/ajustes   os valores em vigor (padrão no que faltar)
 *  PUT /api/busca-de-passagens/ajustes   altera só os campos enviados (auditado)
 */
import type { Express } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { systemSettings } from "@shared/schema";
import { AJUSTES_PADRAO, CHAVES_DOS_AJUSTES, PAPEIS_DAS_ANALISES, validarAjustes, type AjustesDaBusca } from "@shared/regras-da-busca";
import { createAuditLog, requireRoles } from "../routes/_compartilhado";
import { lerAjustes } from "./servico";

const valorGravado = (campo: keyof AjustesDaBusca, v: AjustesDaBusca[keyof AjustesDaBusca]): string =>
  campo === "funcoesComMala" ? JSON.stringify(v ?? []) : String(v);

export function registrarAjustesDaBusca(app: Express): void {
  app.get("/api/busca-de-passagens/ajustes", async (req, res) => {
    if (!await requireRoles(req, res, PAPEIS_DAS_ANALISES)) return;
    try {
      res.set("Cache-Control", "no-store");
      res.json({ ajustes: await lerAjustes(), padrao: AJUSTES_PADRAO });
    } catch (error) {
      console.error("[busca-de-passagens] ajustes:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao ler os ajustes da busca" });
    }
  });

  app.put("/api/busca-de-passagens/ajustes", async (req, res) => {
    const admin = await requireRoles(req, res, PAPEIS_DAS_ANALISES);
    if (!admin) return;
    const { ok, erros } = validarAjustes(req.body);
    if (Object.keys(erros).length > 0) return res.status(400).json({ message: Object.values(erros)[0], errors: erros });
    const campos = Object.keys(ok) as (keyof AjustesDaBusca)[];
    if (campos.length === 0) return res.status(400).json({ message: "Nada para salvar." });
    try {
      const antes = await lerAjustes();
      const anterior: Record<string, unknown> = {};
      const novo: Record<string, unknown> = {};
      for (const campo of campos) {
        const chave = CHAVES_DOS_AJUSTES[campo];
        const valor = ok[campo] as AjustesDaBusca[typeof campo];
        anterior[chave] = antes[campo];
        novo[chave] = valor;
        if (campo === "funcoesComMala" && valor === null) {
          // Volta à regra padrão (cenotécnica): o valor some de system_settings.
          await db.insert(systemSettings).values({ key: chave, value: "", updatedBy: admin.id })
            .onConflictDoUpdate({ target: systemSettings.key, set: { value: "", updatedBy: admin.id, updatedAt: new Date() } });
          continue;
        }
        const texto = valorGravado(campo, valor);
        await db.insert(systemSettings).values({ key: chave, value: texto, updatedBy: admin.id })
          .onConflictDoUpdate({ target: systemSettings.key, set: { value: texto, updatedBy: admin.id, updatedAt: new Date() } });
      }
      // No log, as funções vão pelo NOME (o id não diz nada a quem lê).
      const chaveMala = CHAVES_DOS_AJUSTES.funcoesComMala;
      const ids = [...((anterior[chaveMala] as string[] | null) ?? []), ...((novo[chaveMala] as string[] | null) ?? [])];
      if (ids.length > 0) {
        const nomes = new Map((await storage.getFunctionsByIds(Array.from(new Set(ids)))).map((f) => [f.id, f.name]));
        const legivel = (v: unknown) => (Array.isArray(v) ? v.map((id) => nomes.get(id) ?? "função removida") : "regra padrão (cenotécnica)");
        if (chaveMala in novo) { novo[chaveMala] = legivel(novo[chaveMala]); anterior[chaveMala] = legivel(anterior[chaveMala]); }
      }
      await createAuditLog("update", "system_settings", "busca_passagens_ajustes", novo, admin.id, admin.name || "Sistema", anterior, req);
      res.json({ ajustes: await lerAjustes(), padrao: AJUSTES_PADRAO });
    } catch (error) {
      console.error("[busca-de-passagens] salvar ajustes:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Erro ao salvar os ajustes da busca" });
    }
  });
}
