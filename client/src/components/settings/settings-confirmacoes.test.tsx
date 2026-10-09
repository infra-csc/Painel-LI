import { describe, it, expect, vi } from "vitest";
import { act, renderHook, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { Link } from "wouter";
import { renderComTudo } from "@/test/render";
import { AtualizarPlanejado } from "./settings-footer";
import { SaveBar } from "./save-bar";
import { useAvisoAoSair } from "./use-aviso-ao-sair";
import { rebasearFormulario } from "./use-settings-form";
import { FORM_DEFAULT_VALUES, type FormValues } from "./settings-schema";

describe("Valores padrão — Atualizar Planejado pede confirmação", () => {
  it("o botão só abre a confirmação; confirmar aplica e fecha", async () => {
    const aplicar = vi.fn().mockResolvedValue(undefined);
    const { user } = renderComTudo(<AtualizarPlanejado isApplyingPending={false} onApplyToPending={aplicar} temAlteracao />);
    await user.click(screen.getByTestId("cfg-atualizar-planejado"));
    expect(aplicar).not.toHaveBeenCalled();
    const dialogo = await screen.findByTestId("cfg-confirmar-atualizar-planejado");
    expect(dialogo).toHaveTextContent("todos os eventos não encerrados");
    expect(dialogo).toHaveTextContent("As alterações não salvas desta tela não entram.");
    await user.click(screen.getByTestId("cfg-confirmar-atualizar-planejado-sim"));
    expect(aplicar).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("cfg-confirmar-atualizar-planejado")).not.toBeInTheDocument();
  });

  it("cancelar não aplica nada", async () => {
    const aplicar = vi.fn();
    const { user } = renderComTudo(<AtualizarPlanejado isApplyingPending={false} onApplyToPending={aplicar} />);
    await user.click(screen.getByTestId("cfg-atualizar-planejado"));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(aplicar).not.toHaveBeenCalled();
  });
});

describe("Valores padrão — Descartar com 2+ alterações", () => {
  it("com 2 alterações pergunta antes; confirmar descarta", async () => {
    const onDiscard = vi.fn();
    const { user } = renderComTudo(<SaveBar totalUnsaved={2} saving={false} onSave={() => {}} onDiscard={onDiscard} />);
    expect(screen.getByText("2 alterações não salvas")).toBeInTheDocument();
    await user.click(screen.getByTestId("cfg-descartar"));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(await screen.findByText("Descartar 2 alterações?")).toBeInTheDocument();
    await user.click(screen.getByTestId("cfg-confirmar-descarte-sim"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("com 2 alterações, 'Continuar editando' mantém tudo", async () => {
    const onDiscard = vi.fn();
    const { user } = renderComTudo(<SaveBar totalUnsaved={3} saving={false} onSave={() => {}} onDiscard={onDiscard} />);
    await user.click(screen.getByTestId("cfg-descartar"));
    await user.click(await screen.findByRole("button", { name: "Continuar editando" }));
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("com 1 alteração descarta direto", async () => {
    const onDiscard = vi.fn();
    const { user } = renderComTudo(<SaveBar totalUnsaved={1} saving={false} onSave={() => {}} onDiscard={onDiscard} />);
    await user.click(screen.getByTestId("cfg-descartar"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("cfg-confirmar-descarte")).not.toBeInTheDocument();
  });
});

function TelaComAviso({ sujo }: { sujo: boolean }) {
  const { Dialogo } = useAvisoAoSair(sujo);
  return (
    <>
      <Link href="/outra-tela">Outra tela</Link>
      {Dialogo}
    </>
  );
}

describe("Valores padrão — aviso ao sair", () => {
  it("sujo: link interno pergunta; 'Sair sem salvar' navega", async () => {
    const { user, historico } = renderComTudo(<TelaComAviso sujo />, { rota: "/system-settings" });
    await user.click(screen.getByText("Outra tela"));
    expect(historico.at(-1)).toBe("/system-settings");
    await user.click(await screen.findByTestId("cfg-confirmar-saida-sim"));
    expect(historico.at(-1)).toBe("/outra-tela");
  });

  it("sujo: 'Continuar editando' fica na tela", async () => {
    const { user, historico } = renderComTudo(<TelaComAviso sujo />, { rota: "/system-settings" });
    await user.click(screen.getByText("Outra tela"));
    await user.click(await screen.findByRole("button", { name: "Continuar editando" }));
    expect(historico.at(-1)).toBe("/system-settings");
  });

  it("sujo: fechar/recarregar a aba dispara o aviso do navegador", () => {
    renderComTudo(<TelaComAviso sujo />, { rota: "/system-settings" });
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("limpo: navega sem perguntar e sem aviso ao fechar", async () => {
    const { user, historico } = renderComTudo(<TelaComAviso sujo={false} />, { rota: "/system-settings" });
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    await user.click(screen.getByText("Outra tela"));
    expect(historico.at(-1)).toBe("/outra-tela");
    expect(screen.queryByTestId("cfg-confirmar-saida")).not.toBeInTheDocument();
  });
});

describe("Valores padrão — recarga depois de salvar (rebasearFormulario)", () => {
  it("o enviado vira o salvo e o editado durante o envio continua alterado", () => {
    const { result } = renderHook(() => useForm<FormValues>({ defaultValues: FORM_DEFAULT_VALUES }));
    const form = result.current;
    act(() => { form.setValue("alimentacao_almoco", "41.00", { shouldDirty: true }); });
    const enviados = form.getValues();
    // Durante o envio, a pessoa mexe em outro campo.
    act(() => { form.setValue("alimentacao_jantar", "50.00", { shouldDirty: true }); });
    act(() => { rebasearFormulario(form, enviados, ["alimentacao_jantar"]); });
    expect(form.getValues("alimentacao_almoco")).toBe("41.00");
    expect(form.getValues("alimentacao_jantar")).toBe("50.00");
    expect(Object.keys(form.formState.dirtyFields)).toEqual(["alimentacao_jantar"]);

    // Recarga do servidor (valor formatado diferente) preserva o campo sujo.
    const doServidor = { ...enviados, alimentacao_almoco: "41.00", alimentacao_jantar: "40.00" };
    act(() => { rebasearFormulario(form, doServidor, Object.keys(form.formState.dirtyFields) as (keyof FormValues)[]); });
    expect(form.getValues("alimentacao_jantar")).toBe("50.00");
    expect(Object.keys(form.formState.dirtyFields)).toEqual(["alimentacao_jantar"]);
  });

  it("campo preservado igual à nova base deixa de contar como alterado", () => {
    const { result } = renderHook(() => useForm<FormValues>({ defaultValues: FORM_DEFAULT_VALUES }));
    const form = result.current;
    act(() => { form.setValue("alimentacao_jantar", "50.00", { shouldDirty: true }); });
    act(() => { rebasearFormulario(form, { ...FORM_DEFAULT_VALUES, alimentacao_jantar: "50.00" }, ["alimentacao_jantar"]); });
    expect(Object.keys(form.formState.dirtyFields)).toEqual([]);
  });
});
