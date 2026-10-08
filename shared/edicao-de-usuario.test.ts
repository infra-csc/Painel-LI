import { describe, expect, it } from "vitest";
import {
  camposEditaveisDoUsuario, podeEditarUsuario, podeRedefinirSenhaDe, recusaDaEdicaoDeUsuario,
  MSG_PROPRIO_PERFIL, MSG_SEM_PERMISSAO_PARA_EDITAR, MSG_SO_ADMIN_EMAIL, MSG_SO_ADMIN_PERFIL,
  type CampoDoUsuario,
} from "./edicao-de-usuario";

const PAPEIS = ["admin", "financial", "purchasing", "production", "function_area", "administrador", "compras", null];
const CAMPOS: CampoDoUsuario[] = ["name", "email", "role", "status", "area"];

/** Todos os subconjuntos não vazios dos campos. */
function subconjuntos(): CampoDoUsuario[][] {
  const out: CampoDoUsuario[][] = [];
  for (let m = 1; m < 1 << CAMPOS.length; m++) out.push(CAMPOS.filter((_, i) => m & (1 << i)));
  return out;
}

describe("edição de usuário — regra compartilhada", () => {
  it("camposEditaveis e recusa concordam em TODA combinação (papel × eu mesmo × campos)", () => {
    for (const papel of PAPEIS) {
      for (const euMesmo of [true, false]) {
        const editaveis = new Set(camposEditaveisDoUsuario(papel, euMesmo));
        for (const enviados of subconjuntos()) {
          const aceita = enviados.every((c) => editaveis.has(c));
          expect(recusaDaEdicaoDeUsuario(papel, euMesmo, enviados) === null, `${papel} eu=${euMesmo} ${enviados}`).toBe(aceita);
        }
      }
    }
  });

  it("admin: tudo em terceiros; em si mesmo, sem perfil/status", () => {
    expect(camposEditaveisDoUsuario("admin", false)).toEqual(["name", "email", "role", "status", "area"]);
    expect(camposEditaveisDoUsuario("admin", true)).toEqual(["name", "email", "area"]);
    expect(recusaDaEdicaoDeUsuario("admin", true, ["name", "role"])).toBe(MSG_PROPRIO_PERFIL);
  });

  it("RH/Compras: só o nome de terceiros; nome e e-mail de si", () => {
    expect(camposEditaveisDoUsuario("financial", false)).toEqual(["name"]);
    expect(camposEditaveisDoUsuario("compras", true)).toEqual(["name", "email"]);
    expect(recusaDaEdicaoDeUsuario("purchasing", false, ["name", "email"])).toBe(MSG_SO_ADMIN_EMAIL);
    expect(recusaDaEdicaoDeUsuario("financial", false, ["area"])).toBe(MSG_SO_ADMIN_PERFIL);
  });

  it("Logística Interna e Área de Função não editam terceiros (só a si)", () => {
    expect(podeEditarUsuario("production", false)).toBe(false);
    expect(podeEditarUsuario("function_area", false)).toBe(false);
    expect(podeEditarUsuario("production", true)).toBe(true);
    expect(recusaDaEdicaoDeUsuario("production", false, ["name"])).toBe(MSG_SEM_PERMISSAO_PARA_EDITAR);
  });

  it("reset de senha: a de outro admin não; a própria e a de não-admin sim", () => {
    expect(podeRedefinirSenhaDe("admin", false)).toBe(false);
    expect(podeRedefinirSenhaDe("administrador", false)).toBe(false);
    expect(podeRedefinirSenhaDe("admin", true)).toBe(true);
    expect(podeRedefinirSenhaDe("production", false)).toBe(true);
  });
});
