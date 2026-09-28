import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { Check } from "lucide-react";
import { renderComTudo } from "@/test/render";
import { StatusBadge, StatusDaVagaBadge, StatusPorChaveBadge, rotuloDaVaga, toneDoStatus, type Tone } from "./status-badge";

describe("toneDoStatus", () => {
  it.each<[string, Tone]>([
    // ok / concluído
    ["escalado", "success"],
    ["aprovado", "success"],
    ["concluido", "success"],
    ["passagem_comprada", "success"],
    ["hospedagem_passagem_comprada", "success"],
    // alguém precisa agir
    ["planejado", "warning"],
    ["pendente", "warning"],
    ["aguardando_producao", "warning"],
    ["passagem", "warning"],
    ["hospedagem", "warning"],
    ["aprovacao", "warning"],
    ["sugestao_pendente", "warning"],
    ["sugestao_ajuste", "warning"],
    // ação sua / em andamento
    ["salvo", "primary"],
    ["reaberto", "primary"],
    ["em_andamento", "primary"],
    // informação
    ["sugestao_validada", "info"],
    ["reajustado", "info"],
    // bloqueio / negado
    ["negado", "danger"],
    ["sugestao_negada", "danger"],
    ["rejeitada", "danger"],
    ["erro", "danger"],
    // neutro
    ["cancelado", "neutral"],
    ["inativo", "neutral"],
    ["excluído", "neutral"],
  ])("%s → %s", (status, tom) => {
    expect(toneDoStatus(status)).toBe(tom);
  });

  it("ignora caixa e espaços e devolve neutral para vazio/desconhecido", () => {
    expect(toneDoStatus("  ESCALADO ")).toBe("success");
    expect(toneDoStatus("Em Análise")).toBe("warning");
    expect(toneDoStatus(null)).toBe("neutral");
    expect(toneDoStatus(undefined)).toBe("neutral");
    expect(toneDoStatus("")).toBe("neutral");
    expect(toneDoStatus("status_que_nao_existe")).toBe("neutral");
  });
});

describe("rotuloDaVaga", () => {
  it("usa o rótulo do shared, com 'cancelado' no feminino (é a vaga)", () => {
    expect(rotuloDaVaga("cancelado")).toBe("Cancelada");
    expect(rotuloDaVaga("escalado")).toBe("Escalado");
    expect(rotuloDaVaga("aguardando_producao")).toBe("Aguardando gestor");
    expect(rotuloDaVaga(null)).toBe("—");
  });
});

describe("StatusBadge", () => {
  it("renderiza o texto com as classes do tom; ponto e ícone são decorativos", () => {
    const { container } = renderComTudo(
      <StatusBadge tone="success" dot icon={Check} data-testid="pilula">Escalado</StatusBadge>,
    );
    const pilula = screen.getByTestId("pilula");
    expect(pilula).toHaveTextContent("Escalado");
    expect(pilula).toHaveClass("bg-success-soft", "text-success", "rounded-full");
    const decorativos = container.querySelectorAll("[aria-hidden='true']");
    expect(decorativos).toHaveLength(2);
    // Só o texto chega ao leitor de tela — ponto e ícone não adicionam nada.
    expect(pilula).toHaveTextContent(/^Escalado$/);
  });

  it("tamanho md usa text-xs e sm usa text-2xs", () => {
    renderComTudo(
      <>
        <StatusBadge tone="info" size="md" data-testid="md">A</StatusBadge>
        <StatusBadge tone="info" data-testid="sm">B</StatusBadge>
      </>,
    );
    expect(screen.getByTestId("md")).toHaveClass("text-xs");
    expect(screen.getByTestId("sm")).toHaveClass("text-2xs");
  });

  it("pulse só anima o ponto e respeita motion-reduce", () => {
    const { container } = renderComTudo(<StatusBadge tone="primary" dot pulse>Ao vivo</StatusBadge>);
    const ponto = container.querySelector("[aria-hidden='true']");
    expect(ponto).toHaveClass("animate-pulse", "motion-reduce:animate-none");
  });
});

describe("StatusPorChaveBadge", () => {
  it("tom pelo dicionário e rótulo pelo shared, com data-testid por status", () => {
    renderComTudo(<StatusPorChaveBadge status="passagem_comprada" />);
    const pilula = screen.getByTestId("status-passagem_comprada");
    expect(pilula).toHaveTextContent("Passagem comprada");
    expect(pilula).toHaveClass("bg-success-soft");
  });

  it("status vazio vira '—' em neutro", () => {
    renderComTudo(<StatusPorChaveBadge status={null} />);
    expect(screen.getByTestId("status-vazio")).toHaveTextContent("—");
    expect(screen.getByTestId("status-vazio")).toHaveClass("bg-neutral-soft");
  });
});

describe("StatusDaVagaBadge", () => {
  it.each([
    ["sem colaborador", { status: "planejado", collaboratorId: null }, "Vaga aberta", "pendente", "bg-warning-soft"],
    ["com nome, não confirmada", { status: "planejado", collaboratorId: "c1" }, "Salvo", "salvo", "bg-brand-soft"],
    ["reaberta com nome", { status: "reaberto", collaboratorId: "c1" }, "Salvo", "salvo", "bg-brand-soft"],
    ["escalada", { status: "escalado", collaboratorId: "c1" }, "Escalado", "escalado", "bg-success-soft"],
    ["passagem comprada conta como escalada", { status: "passagem_comprada", collaboratorId: "c1" }, "Escalado", "escalado", "bg-success-soft"],
    ["aguardando gestor", { status: "aguardando_producao", collaboratorId: "c1" }, "Aguardando gestor", "aguardando_producao", "bg-warning-soft"],
    ["cancelada (feminino)", { status: "cancelado", collaboratorId: "c1" }, "Cancelada", "cancelado", "bg-neutral-soft"],
    ["cancelada mesmo sem colaborador", { status: "cancelado", collaboratorId: null }, "Cancelada", "cancelado", "bg-neutral-soft"],
  ])("%s → %s", (_nome, vaga, rotulo, chave, classe) => {
    renderComTudo(<StatusDaVagaBadge status={vaga.status} collaboratorId={vaga.collaboratorId} />);
    const pilula = screen.getByTestId(`scaling-status-${chave}`);
    expect(pilula).toHaveTextContent(rotulo);
    expect(pilula).toHaveClass(classe);
    expect(screen.getByText(rotulo)).toBeVisible();
  });

  it("empreita por empresa preenche a vaga sem colaborador → Salvo", () => {
    renderComTudo(<StatusDaVagaBadge status="planejado" collaboratorId={null} empreitaEmpresa="Empresa X" />);
    expect(screen.getByTestId("scaling-status-salvo")).toHaveTextContent("Salvo");
  });

  it("texto acessível é só o rótulo (ponto decorativo escondido)", () => {
    renderComTudo(<StatusDaVagaBadge status="escalado" collaboratorId="c1" />);
    const pilula = screen.getByTestId("scaling-status-escalado");
    expect(pilula).toHaveTextContent(/^Escalado$/);
    expect(pilula.querySelector("[aria-hidden='true']")).not.toBeNull();
  });
});
