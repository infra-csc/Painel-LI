import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderComTudo } from "@/test/render";
import { Tabs } from "@/components/ui/tabs";
import { ComentariosTab } from "./inclusion-details-tabs";

type Props = Parameters<typeof ComentariosTab>[0];

function montar(extras: Partial<Props> = {}) {
  const addComment = { mutate: vi.fn(), isPending: false } as unknown as Props["addComment"];
  return renderComTudo(
    <Tabs value="comentarios">
      <ComentariosTab
        comments={[]} historico={[]} getUserName={() => "Ana"}
        newComment="" setNewComment={vi.fn()} addComment={addComment}
        canComment canSend
        {...extras}
      />
    </Tabs>,
  );
}

// Escalação (08/10): o campo de comentário usa o mesmo texto dos outros campos
// de comentário; "Só quem responde pela função comenta aqui" era da regra antiga.
describe("ComentariosTab — placeholder do comentário", () => {
  it("usa o padrão dos comentários", () => {
    montar();
    expect(screen.getByLabelText("Novo comentário")).toHaveAttribute("placeholder", "Escreva um comentário…");
  });

  it("sem permissão não fala da regra antiga (responder pela função)", () => {
    montar({ canComment: false });
    const campo = screen.getByLabelText("Novo comentário");
    expect(campo).toBeDisabled();
    expect(campo.getAttribute("placeholder")).not.toMatch(/responde pela função/);
  });
});
