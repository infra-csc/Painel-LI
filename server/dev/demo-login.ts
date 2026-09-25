/**
 * Login automático do MODO DEMONSTRAÇÃO (25/09).
 *
 * `GET /__demo/entrar?papel=<papel>` cria a sessão do usuário semeado com
 * aquele papel (server/dev/demo-seed.ts) e redireciona para `/` — a mesma
 * sessão que o SSO criaria (`iniciarSessao` com `sso: true`), então o gate
 * global e a tela passam sem nenhum caso especial.
 *
 * Quem decide se isto existe é server/app.ts: só registra com PAINEL_DEMO=1 E
 * NODE_ENV !== "production". Este módulo não checa de novo de propósito — a
 * regra mora num lugar só, e o teste server/test/demo-seed.test.ts cobre o
 * "em produção a rota não existe".
 */
import type { Express } from "express";
import { iniciarSessao } from "../auth-guards";
import { storage } from "../storage";
import { DEMO_PAPEIS, DEMO_USUARIOS, type DemoPapel } from "./demo-seed";

export function ehDemoPapel(v: unknown): v is DemoPapel {
  return typeof v === "string" && (DEMO_PAPEIS as readonly string[]).includes(v);
}

export function registrarLoginDeDemo(app: Express): void {
  app.get("/__demo/entrar", async (req, res, next) => {
    try {
      const papel = req.query.papel;
      if (!ehDemoPapel(papel)) {
        return res.status(400).json({
          message: `Informe ?papel= com um destes valores: ${DEMO_PAPEIS.join(", ")}`,
        });
      }
      const user = await storage.getUserByEmail(DEMO_USUARIOS[papel].email);
      if (!user) {
        return res.status(404).json({ message: `Usuário de demonstração "${papel}" não existe — o seed não rodou?` });
      }
      await iniciarSessao(req, user, { sso: true });
      return res.redirect("/");
    } catch (err) {
      return next(err);
    }
  });
}
