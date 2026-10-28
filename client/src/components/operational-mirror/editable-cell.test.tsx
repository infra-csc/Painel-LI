/**
 * Célula da grade do Espelho com o bilhete da volta comprada à parte (28/10):
 * a coluna do número da compra mostra "JPLN7F8J · volta 4471"; editar a célula
 * continua editando só o número da ida.
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { EditableCell } from "./editable-cell";

function celula(value: string | null, complemento: string | null, editMode = true) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const utils = renderComTudo(
    <table><tbody><tr>
      <EditableCell rowId="v1" field="ticket.purchaseOrderNumber" value={value} type="text" onSave={onSave} editMode={editMode} variant="oc" complemento={complemento} />
    </tr></tbody></table>,
  );
  return { ...utils, onSave };
}

describe("número da compra com o da volta (Espelho)", () => {
  it("mostra os dois quando a volta tem bilhete próprio", () => {
    celula("JPLN7F8J", "volta 4471");
    expect(screen.getByRole("button", { name: /JPLN7F8J/ })).toHaveTextContent("JPLN7F8J · volta 4471");
  });

  it("sem bilhete da volta, só o da passagem (como sempre)", () => {
    celula("JPLN7F8J", null);
    expect(screen.getByRole("button", { name: /JPLN7F8J/ })).toHaveTextContent(/^JPLN7F8J$/);
    expect(screen.queryByTestId("celula-complemento")).toBeNull();
  });

  it("só a volta preenchida; e no modo leitura também", () => {
    celula(null, "volta 4471", false);
    expect(screen.getByTestId("celula-complemento")).toHaveTextContent(/^volta 4471$/);
  });

  it("editar abre só o número da ida", async () => {
    const { user, onSave } = celula("JPLN7F8J", "volta 4471");
    await user.click(screen.getByRole("button", { name: /JPLN7F8J/ }));
    const campo = screen.getByRole("textbox");
    expect(campo).toHaveValue("JPLN7F8J");
    await user.clear(campo);
    await user.type(campo, "AX782Q{Enter}");
    expect(onSave).toHaveBeenCalledWith("v1", "ticket.purchaseOrderNumber", "AX782Q", "JPLN7F8J");
  });
});
