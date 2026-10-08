// Empresa pagadora (08/10): o CNPJ é validado pelos dígitos verificadores no
// campo (mensagem no campo, botão travado) — a mesma regra do servidor.
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { PaymentCompany } from "@shared/schema";
import { renderComTudo } from "@/test/render";
import { PaymentCompanyGate, usePaymentCompanyForm } from "./payment-company-gate";

function Tela({ empresas, mutate }: { empresas: PaymentCompany[]; mutate: (v: { name: string; cnpj: string }) => void }) {
  const form = usePaymentCompanyForm();
  return <PaymentCompanyGate paymentCompanies={empresas} form={form} mutation={{ mutate, isPending: false }} />;
}

const empresa = (parcial: Partial<PaymentCompany>) => ({ id: "pc-1", name: "CSC Esporte", cnpj: "11.222.333/0001-81", ...parcial }) as PaymentCompany;

describe("PaymentCompanyGate — CNPJ", () => {
  it("manual: máscara, erro no campo com dígito verificador errado e confirmação travada até corrigir", async () => {
    const { user } = renderComTudo(<Tela empresas={[]} mutate={vi.fn()} />);
    await user.type(screen.getByLabelText(/Nome da empresa/), "Produtora XYZ");
    const cnpj = screen.getByLabelText(/^CNPJ/);
    await user.type(cnpj, "11222333000182");
    expect(cnpj).toHaveValue("11.222.333/0001-82");
    expect(cnpj).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("CNPJ inválido — confira os dígitos verificadores.", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByTestId("nf-pagadora-confirmar")).toBeDisabled();

    await user.clear(cnpj);
    await user.type(cnpj, "11222333000181");
    expect(cnpj).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(/CNPJ inválido/)).toBeNull();
    expect(screen.getByTestId("nf-pagadora-confirmar")).toBeEnabled();
  });

  it("manual incompleto: o erro aparece ao sair do campo", async () => {
    const { user } = renderComTudo(<Tela empresas={[]} mutate={vi.fn()} />);
    await user.type(screen.getByLabelText(/^CNPJ/), "1122");
    expect(screen.queryByText(/CNPJ incompleto/)).toBeNull();
    await user.tab();
    expect(screen.getByText("CNPJ incompleto — são 14 dígitos.", { selector: "p" })).toBeInTheDocument();
  });

  it("empresa cadastrada com CNPJ inválido: avisa e não deixa confirmar", async () => {
    const { user } = renderComTudo(<Tela empresas={[empresa({ cnpj: "00.000.000/0001-00" })]} mutate={vi.fn()} />);
    await user.click(screen.getByText("CSC Esporte"));
    expect(screen.getByTestId("nf-pagadora-cnpj-cadastrado-invalido")).toHaveTextContent("não é válido");
    expect(screen.getByTestId("nf-pagadora-confirmar")).toBeDisabled();
  });

  it("empresa cadastrada válida: confirma e manda nome e CNPJ", async () => {
    const mutate = vi.fn();
    const { user } = renderComTudo(<Tela empresas={[empresa({})]} mutate={mutate} />);
    await user.click(screen.getByText("CSC Esporte"));
    await user.click(screen.getByTestId("nf-pagadora-confirmar"));
    await user.click(await screen.findByRole("button", { name: "Definir empresa" }));
    expect(mutate).toHaveBeenCalledWith({ name: "CSC Esporte", cnpj: "11.222.333/0001-81" });
  });
});
