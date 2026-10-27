/**
 * Contratos (CNPJ) — rotas (26/10, Fase 0 do Módulo de Honorários).
 *
 * Cobre: CRUD (criar, CNPJ inválido/duplicado, vigência, editar com versão,
 * encerrar/reativar, histórico); vínculos com colaboradores; o sinal
 * "contrato ativo" por colaborador e por evento; a importação da planilha
 * (prévia NÃO grava; confirmação grava e devolve o relatório; prévia
 * desatualizada → 409); e as permissões (só admin + financial; os demais 403).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { completarCnpj } from "@shared/cnpj";
import { completarCpf } from "@shared/pagamento";
import { podeAcessarAnexo } from "../objectAcl";
import { agenteLogado, criarApp, criarColaborador, criarEvento, criarVaga, criarUsuario, mutacao, unico, type Contexto } from "./harness";

let ctx: Contexto;
beforeAll(async () => {
  ctx = await criarApp();
});

let base = 200000000000;
const novoCnpj = () => completarCnpj(String(++base));

async function contarContratos(): Promise<number> {
  const linhas = await ctx.db.select().from(ctx.schema.contratos);
  return linhas.length;
}

describe("Contratos — CRUD", () => {
  it("financial cria (CNPJ só com dígitos no banco), lista com situação e vê o histórico", async () => {
    const { agent } = await agenteLogado("financial");
    const colab = await criarColaborador();
    const cnpj = novoCnpj();
    const r = await mutacao(agent.post("/api/contratos")).send({
      cnpj, razaoSocial: "Montagens Exemplo Ltda", tipo: "empresa", vigenciaInicio: "2020-01-01", vigenciaFim: "2099-12-31",
      colaboradorIds: [colab.id],
    });
    expect(r.status).toBe(201);
    expect(r.body.cnpj).toBe(cnpj.replace(/\D/g, ""));
    expect(r.body.cnpjFormatado).toBe(cnpj);
    expect(r.body.situacao).toBe("ativo");
    expect(r.body.colaboradores.map((c: { id: string }) => c.id)).toEqual([colab.id]);

    const lista = await agent.get("/api/contratos");
    expect(lista.status).toBe(200);
    expect(lista.headers["cache-control"]).toContain("no-store");
    expect(lista.body.contratos.find((c: { id: string }) => c.id === r.body.id)).toBeTruthy();

    const det = await agent.get(`/api/contratos/${r.body.id}`);
    expect(det.status).toBe(200);
    expect(det.body.historico[0].acao).toBe("criado");
    expect(det.body.historico[0].detalhes.join(" ")).toContain(colab.fullName);
  });

  it("CNPJ inválido, fim antes do início e tipo desconhecido → 400; CNPJ repetido → 409", async () => {
    const { agent } = await agenteLogado("admin");
    expect((await mutacao(agent.post("/api/contratos")).send({ cnpj: "11.222.333/0001-82", razaoSocial: "X", tipo: "empresa" })).status).toBe(400);
    const cnpj = novoCnpj();
    expect((await mutacao(agent.post("/api/contratos")).send({ cnpj, razaoSocial: "X", tipo: "empresa", vigenciaInicio: "2026-05-01", vigenciaFim: "2026-04-01" })).body.message)
      .toBe("O fim da vigência é antes do início.");
    expect((await mutacao(agent.post("/api/contratos")).send({ cnpj, razaoSocial: "X", tipo: "cooperativa" })).status).toBe(400);
    expect((await mutacao(agent.post("/api/contratos")).send({ cnpj, razaoSocial: "Primeira", tipo: "mei" })).status).toBe(201);
    const dup = await mutacao(agent.post("/api/contratos")).send({ cnpj: cnpj.replace(/\D/g, ""), razaoSocial: "Segunda", tipo: "mei" });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toContain("Primeira");
  });

  it("edita com a versão; versão velha → 409; encerrar e reativar mudam a situação e ficam no histórico", async () => {
    const { agent } = await agenteLogado("financial");
    const criado = (await mutacao(agent.post("/api/contratos")).send({ cnpj: novoCnpj(), razaoSocial: "Antes", tipo: "empresa", vigenciaInicio: "2020-01-01" })).body;
    const editado = await mutacao(agent.patch(`/api/contratos/${criado.id}`)).send({ versao: criado.versao, razaoSocial: "Depois", vigenciaFim: "2099-01-01" });
    expect(editado.status).toBe(200);
    expect(editado.body.razaoSocial).toBe("Depois");
    expect(editado.body.versao).toBe(criado.versao + 1);
    const velho = await mutacao(agent.patch(`/api/contratos/${criado.id}`)).send({ versao: criado.versao, razaoSocial: "Corrida" });
    expect(velho.status).toBe(409);

    expect((await mutacao(agent.post(`/api/contratos/${criado.id}/encerrar`)).send({ versao: editado.body.versao, motivo: "" })).status).toBe(400);
    const enc = await mutacao(agent.post(`/api/contratos/${criado.id}/encerrar`)).send({ versao: editado.body.versao, motivo: "Fim da parceria" });
    expect(enc.status).toBe(200);
    expect(enc.body.situacao).toBe("encerrado");
    expect((await mutacao(agent.post(`/api/contratos/${criado.id}/encerrar`)).send({ versao: enc.body.versao, motivo: "De novo" })).status).toBe(409);
    const reat = await mutacao(agent.post(`/api/contratos/${criado.id}/reativar`)).send({ versao: enc.body.versao });
    expect(reat.status).toBe(200);
    expect(reat.body.situacao).toBe("ativo");

    const hist = (await agent.get(`/api/contratos/${criado.id}`)).body.historico.map((h: { acao: string }) => h.acao);
    expect(hist).toEqual(["reativado", "encerrado", "editado", "criado"]);
  });

  it("vincula e desvincula colaborador pelo cadastro dele; situação por colaborador e por evento", async () => {
    const { agent, user } = await agenteLogado("admin");
    const ana = await criarColaborador();
    const bia = await criarColaborador();
    const evento = await criarEvento({ startDate: "2099-03-01", endDate: "2099-03-03" });
    await criarVaga({ userId: user.id, eventId: evento.id, collaboratorId: ana.id });
    await criarVaga({ userId: user.id, eventId: evento.id, collaboratorId: bia.id });
    // Vigência acaba ANTES do fim do evento: no evento, Ana não tem contrato ativo.
    const c = (await mutacao(agent.post("/api/contratos")).send({ cnpj: novoCnpj(), razaoSocial: "Ana MEI", tipo: "mei", vigenciaInicio: "2020-01-01", vigenciaFim: "2099-03-02" })).body;

    const v = await mutacao(agent.post(`/api/contratos/${c.id}/colaboradores/${ana.id}`));
    expect(v.status).toBe(200);
    expect(v.body.colaboradores.map((x: { id: string }) => x.id)).toEqual([ana.id]);

    const hoje = await agent.get(`/api/contratos/situacao?colaboradores=${ana.id},${bia.id}`);
    expect(hoje.body.situacoes[ana.id].situacao).toBe("com_contrato_ativo");
    expect(hoje.body.situacoes[bia.id].situacao).toBe("sem_cnpj");

    const noEvento = await agent.get(`/api/contratos/situacao?eventId=${evento.id}`);
    expect(noEvento.status).toBe(200);
    expect(noEvento.body.data).toBe("2099-03-03");
    expect(noEvento.body.situacoes[ana.id].situacao).toBe("sem_contrato_ativo");
    expect(noEvento.body.situacoes[bia.id].situacao).toBe("sem_cnpj");

    const d = await mutacao(agent.delete(`/api/contratos/${c.id}/colaboradores/${ana.id}`));
    expect(d.status).toBe(200);
    expect(d.body.colaboradores).toEqual([]);
    expect((await mutacao(agent.delete(`/api/contratos/${c.id}/colaboradores/${ana.id}`))).status).toBe(404);
  });
});

describe("Contratos — importação da planilha", () => {
  it("prévia NÃO grava; confirmação grava e devolve o relatório; erros não entram", async () => {
    const { agent } = await agenteLogado("financial");
    const n = unico();
    const cpf = completarCpf(String(300000000 + (base % 1000)));
    const colab = await ctx.storage.createCollaborator({
      fullName: `Pessoa Importada ${n}`, officialDocument: cpf, documentType: "cpf", type: "freela", city: "Campinas - SP", status: "aprovado", active: true,
    } as never);
    const cA = novoCnpj();
    const cB = novoCnpj();
    const corpo = {
      nomeDoArquivo: "contratos.xlsx",
      colunas: 5,
      mapeamento: { cnpj: 0, razaoSocial: 1, vigenciaInicio: 2, vigenciaFim: 3, colaboradorCpf: 4 },
      linhas: [
        [cA, "Empresa Importada A", "01/01/2026", "31/12/2099", cpf],
        [cB, "Empresa Importada B", "2026-01-01", "", ""],
        ["11.222.333/0001-82", "CNPJ ruim", "", "", ""],
        [novoCnpj(), "Data ruim", "45/01/2026", "", ""],
        [novoCnpj(), "CPF desconhecido", "", "", completarCpf("123456780")],
      ],
    };
    const antes = await contarContratos();
    const previa = await mutacao(agent.post("/api/contratos/importacao/previa")).send(corpo);
    expect(previa.status).toBe(200);
    expect(previa.body.contagem).toMatchObject({ total: 5, novos: 2, erros: 3 });
    expect(previa.body.linhas.map((l: { acao: string }) => l.acao)).toEqual(["novo", "novo", "erro", "erro", "erro"]);
    expect(await contarContratos()).toBe(antes); // nada gravado

    const conf = await mutacao(agent.post("/api/contratos/importacao/confirmar")).send({ ...corpo, assinatura: previa.body.assinatura });
    expect(conf.status).toBe(200);
    expect(conf.body).toMatchObject({ criados: 2, atualizados: 0, vinculos: 1, linhasComErro: 3 });
    expect(conf.body.erros.map((e: { linha: number }) => e.linha)).toEqual([4, 5, 6]);
    expect(await contarContratos()).toBe(antes + 2);

    const lista = (await agent.get("/api/contratos")).body.contratos as { cnpjFormatado: string; colaboradores: { id: string }[]; id: string }[];
    const a = lista.find((c) => c.cnpjFormatado === cA)!;
    expect(a.colaboradores.map((c) => c.id)).toEqual([colab.id]);
    const hist = (await agent.get(`/api/contratos/${a.id}`)).body.historico;
    expect(hist[0]).toMatchObject({ acao: "importado" });
    expect(hist[0].detalhes[0]).toContain("contratos.xlsx");

    // A mesma planilha de novo: nada muda (sem mudança), confirmar não tem o que gravar.
    const de_novo = await mutacao(agent.post("/api/contratos/importacao/previa")).send({ ...corpo, linhas: corpo.linhas.slice(0, 2) });
    expect(de_novo.body.contagem).toMatchObject({ novos: 0, atualizados: 0, semMudanca: 2 });
    expect((await mutacao(agent.post("/api/contratos/importacao/confirmar")).send({ ...corpo, linhas: corpo.linhas.slice(0, 2), assinatura: de_novo.body.assinatura })).status).toBe(400);
  });

  it("cadastro mudou entre a prévia e a confirmação → 409 (gerar a prévia de novo)", async () => {
    const { agent } = await agenteLogado("admin");
    const cnpj = novoCnpj();
    const corpo = { colunas: 2, mapeamento: { cnpj: 0, razaoSocial: 1 }, linhas: [[cnpj, "Corrida Ltda"]] };
    const previa = await mutacao(agent.post("/api/contratos/importacao/previa")).send(corpo);
    expect(previa.body.contagem.novos).toBe(1);
    await mutacao(agent.post("/api/contratos")).send({ cnpj, razaoSocial: "Corrida Ltda", tipo: "empresa" });
    const conf = await mutacao(agent.post("/api/contratos/importacao/confirmar")).send({ ...corpo, assinatura: previa.body.assinatura });
    expect(conf.status).toBe(409);
    expect(conf.body.codigo).toBe("previa_desatualizada");
  });

  it("mapeamento inválido e planilha acima do limite → 400", async () => {
    const { agent } = await agenteLogado("financial");
    expect((await mutacao(agent.post("/api/contratos/importacao/previa")).send({ colunas: 2, mapeamento: { razaoSocial: 1 }, linhas: [] })).body.message).toMatch(/CNPJ/);
    const muitas = Array.from({ length: 5001 }, () => ["x"]);
    expect((await mutacao(agent.post("/api/contratos/importacao/previa")).send({ colunas: 1, mapeamento: { cnpj: 0 }, linhas: muitas })).status).toBe(400);
  });
});

describe("Contratos — permissões (só o DP)", () => {
  it.each(["production", "purchasing", "function_area", "honorarios"] as const)("%s leva 403 em todas as rotas", async (papel) => {
    const { agent } = await agenteLogado(papel);
    const dp = await agenteLogado("admin");
    const c = (await mutacao(dp.agent.post("/api/contratos")).send({ cnpj: novoCnpj(), razaoSocial: "Restrito", tipo: "empresa" })).body;
    const colab = await criarColaborador();
    expect((await agent.get("/api/contratos")).status).toBe(403);
    expect((await agent.get(`/api/contratos/${c.id}`)).status).toBe(403);
    expect((await agent.get(`/api/contratos/situacao?colaboradores=${colab.id}`)).status).toBe(403);
    expect((await mutacao(agent.post("/api/contratos")).send({ cnpj: novoCnpj(), razaoSocial: "X", tipo: "mei" })).status).toBe(403);
    expect((await mutacao(agent.patch(`/api/contratos/${c.id}`)).send({ versao: 1, razaoSocial: "Y" })).status).toBe(403);
    expect((await mutacao(agent.post(`/api/contratos/${c.id}/encerrar`)).send({ versao: 1, motivo: "teste" })).status).toBe(403);
    expect((await mutacao(agent.post(`/api/contratos/${c.id}/colaboradores/${colab.id}`))).status).toBe(403);
    expect((await mutacao(agent.post("/api/contratos/importacao/previa")).send({ colunas: 1, mapeamento: { cnpj: 0 }, linhas: [] })).status).toBe(403);
    expect((await mutacao(agent.post("/api/contratos/importacao/confirmar")).send({ colunas: 1, mapeamento: { cnpj: 0 }, linhas: [], assinatura: "x" })).status).toBe(403);
  });

  it("sem sessão: 401", async () => {
    const request = (await import("supertest")).default;
    expect((await request(ctx.app).get("/api/contratos")).status).toBe(401);
  });

  it("anexo de contrato: só o DP abre (nem Compras/Produção, que veem os outros anexos)", async () => {
    await criarUsuario("financial");
    const base = { userId: "u", ownerId: "outro", documentoDeColaborador: false, anexoDeContrato: true };
    expect(podeAcessarAnexo({ ...base, role: "admin" })).toBe(true);
    expect(podeAcessarAnexo({ ...base, role: "financial" })).toBe(true);
    expect(podeAcessarAnexo({ ...base, role: "purchasing" })).toBe(false);
    expect(podeAcessarAnexo({ ...base, role: "production" })).toBe(false);
    expect(podeAcessarAnexo({ ...base, role: "function_area", ownerId: "u" })).toBe(false);
  });
});
