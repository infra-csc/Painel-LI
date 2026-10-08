import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { renderComTudo } from "@/test/render";
import { Form } from "@/components/ui/form";
import { MoneyField, PercentField } from "./settings-fields";
import { SaveBar } from "./save-bar";
import { FORM_DEFAULT_VALUES, type FormValues } from "./settings-schema";

let contagem = -1;
function Campos() {
  const form = useForm<FormValues>({ defaultValues: { ...FORM_DEFAULT_VALUES, casa_diaria_produtor: "1257.63" } });
  contagem = Object.keys(form.formState.dirtyFields).length;
  return (
    <Form {...form}>
      <MoneyField control={form.control} name="casa_diaria_produtor" label="Produtor" hint="produção, ativação, kit e sup. ceno" />
      <PercentField control={form.control} name="deflacao_fator_5_8" label="Do 5º ao 8º dia" />
    </Form>
  );
}

describe("Valores padrão — campo numérico", () => {
  it("mostra o número em pt-BR parado e o texto de edição focado, sem mudar o valor", () => {
    renderComTudo(<Campos />);
    const input = screen.getByLabelText("Produtor") as HTMLInputElement;
    expect(input.value).toBe("1.257,63");
    fireEvent.focus(input);
    expect(input.value).toBe("1257,63");
    fireEvent.blur(input);
    expect(input.value).toBe("1.257,63");
    expect(contagem).toBe(0);
    expect(screen.getByText("produção, ativação, kit e sup. ceno")).toBeInTheDocument();
  });

  it("alterado mostra o valor de antes e desfaz só aquele campo", () => {
    renderComTudo(<Campos />);
    const input = screen.getByLabelText("Produtor") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1300,00" } });
    fireEvent.blur(input);
    expect(screen.getByText("R$ 1.257,63")).toBeInTheDocument();
    expect(contagem).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /Desfazer a alteração de Produtor/ }));
    expect(input.value).toBe("1.257,63");
    expect(contagem).toBe(0);
  });

  it("o mesmo número escrito de outro jeito não conta como alteração ao sair do campo", () => {
    renderComTudo(<Campos />);
    const input = screen.getByLabelText("Produtor") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1257,630" } });
    expect(contagem).toBe(1);
    fireEvent.blur(input);
    expect(contagem).toBe(0);
  });

  it("percentual mostra o sufixo e o valor cru", () => {
    renderComTudo(<Campos />);
    expect((screen.getByLabelText("Do 5º ao 8º dia") as HTMLInputElement).value).toBe("90");
  });
});

describe("Valores padrão — barra de alterações", () => {
  it("diz quantas, salva, descarta e leva ao erro", () => {
    const onSave = vi.fn(), onDiscard = vi.fn(), onIrParaErro = vi.fn();
    // Com 1 alteração o Descartar é direto; com 2+ pede confirmação
    // (settings-confirmacoes.test.tsx).
    renderComTudo(<SaveBar totalUnsaved={1} saving={false} onSave={onSave} onDiscard={onDiscard} erros={1} onIrParaErro={onIrParaErro} />);
    expect(screen.getByText("1 alteração não salva")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("cfg-salvar"));
    fireEvent.click(screen.getByTestId("cfg-descartar"));
    fireEvent.click(screen.getByTestId("cfg-ir-para-erro"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onIrParaErro).toHaveBeenCalledTimes(1);
  });

  it("salvando: botões travados e o texto muda", () => {
    renderComTudo(<SaveBar totalUnsaved={1} saving onSave={() => {}} onDiscard={() => {}} />);
    expect(screen.getByText("1 alteração não salva")).toBeInTheDocument();
    expect(screen.getByTestId("cfg-salvar")).toBeDisabled();
    expect(screen.getByTestId("cfg-descartar")).toBeDisabled();
    expect(screen.getByText("Salvando…")).toBeInTheDocument();
  });
});
