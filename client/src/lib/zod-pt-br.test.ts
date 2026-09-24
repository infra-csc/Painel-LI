import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { registrarZodPtBr } from "./zod-pt-br";

const primeiraMensagem = (r: z.SafeParseReturnType<unknown, unknown>) =>
  r.success ? null : r.error.issues[0]?.message;

describe("zod em pt-BR", () => {
  beforeAll(() => registrarZodPtBr());

  it("campo ausente vira 'Obrigatório'", () => {
    expect(primeiraMensagem(z.object({ nome: z.string() }).safeParse({}))).toBe("Obrigatório");
  });

  it("string vazia com min(1) vira 'Obrigatório'", () => {
    expect(primeiraMensagem(z.string().min(1).safeParse(""))).toBe("Obrigatório");
  });

  it("min(3) informa a quantidade", () => {
    expect(primeiraMensagem(z.string().min(3).safeParse("ab"))).toBe("Mínimo de 3 caracteres");
  });

  it("e-mail e número inválidos", () => {
    expect(primeiraMensagem(z.string().email().safeParse("x"))).toBe("E-mail inválido");
    expect(primeiraMensagem(z.number().safeParse("x"))).toBe("Número inválido");
  });

  it("mensagem própria do esquema tem prioridade", () => {
    expect(primeiraMensagem(z.string().min(1, "Informe o nome").safeParse(""))).toBe("Informe o nome");
  });
});
