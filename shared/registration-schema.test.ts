import { describe, it, expect } from "vitest";
import { publicUserRegistrationSchema } from "./schema";

describe("publicUserRegistrationSchema (cadastro público)", () => {
  const base = { email: "a@b.com", name: "Fulano", password: "senhaforte1" };

  it("aceita um cadastro válido de papel não privilegiado", () => {
    const r = publicUserRegistrationSchema.safeParse({ ...base, role: "production" });
    expect(r.success).toBe(true);
  });

  it("usa 'production' como papel padrão quando ausente", () => {
    const r = publicUserRegistrationSchema.parse(base);
    expect(r.role).toBe("production");
  });

  it("REJEITA papel admin vindo do corpo", () => {
    expect(publicUserRegistrationSchema.safeParse({ ...base, role: "admin" }).success).toBe(false);
  });

  it("REJEITA papéis privilegiados financial/purchasing", () => {
    expect(publicUserRegistrationSchema.safeParse({ ...base, role: "financial" }).success).toBe(false);
    expect(publicUserRegistrationSchema.safeParse({ ...base, role: "purchasing" }).success).toBe(false);
  });

  it("REJEITA senha fraca (< 8)", () => {
    expect(publicUserRegistrationSchema.safeParse({ ...base, password: "123" }).success).toBe(false);
  });

  it("descarta campos sensíveis (mass assignment): não os repassa", () => {
    const r = publicUserRegistrationSchema.parse({
      ...base, role: "production",
      canApproveCenotecnica: true, isActive: true, mustChangePassword: false, status: "approved",
    } as any);
    expect((r as any).canApproveCenotecnica).toBeUndefined();
    expect((r as any).isActive).toBeUndefined();
    expect((r as any).mustChangePassword).toBeUndefined();
    expect((r as any).status).toBeUndefined();
  });
});
