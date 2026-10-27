/**
 * Seed dos CONTRATOS (CNPJ) e dos DADOS DE PAGAMENTO no modo demonstração
 * (26/10) — SÓ no demo (`npm run dev:demo`), nunca em produção nem nos testes
 * de rota. Tudo FICTÍCIO (CNPJs e CPFs gerados, colaboradores do seed),
 * relativo a hoje, para a tela mostrar todas as situações: ativo, vencendo,
 * vencido, sem vigência, futuro, encerrado e uma empreiteira com vários
 * colaboradores. Dados bancários só quando a demo sobe com PAGAMENTO_CHAVE
 * (chave fictícia da demo) — sem ela, a ficha mostra o aviso "sem chave".
 */
import { asc, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "@shared/schema";
import { completarCnpj, digitosDoCnpj } from "@shared/cnpj";
import { hojeISO } from "@shared/hoje-sp";
import { pagamentoMascarado, type DadosDePagamento } from "@shared/pagamento";
import { chaveConfigurada, cifrar } from "../cripto-pagamento";
import { DEMO_USUARIOS } from "./demo-seed";

type Db = NeonDatabase<typeof schema>;

const addDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function semearContratosDemo(db: Db): Promise<{ contratos: number; pagamentos: number }> {
  const hoje = hojeISO();
  const ja = await db.select({ id: schema.contratos.id }).from(schema.contratos).limit(1);
  if (ja.length) return { contratos: 0, pagamentos: 0 };
  const colabs = await db.select().from(schema.collaborators).where(eq(schema.collaborators.status, "aprovado")).orderBy(asc(schema.collaborators.collaboratorNumber)).limit(14);
  if (colabs.length < 10) return { contratos: 0, pagamentos: 0 };
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_USUARIOS.admin.email));
  const [rh] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_USUARIOS.financial.email));
  const nomeMei = (i: number) => `${digitosDoCnpj(completarCnpj(`5${String(i).padStart(7, "0")}0001`)).slice(0, 8).replace(/(\d{2})(\d{3})(\d{3})/, "$1.$2.$3")} ${colabs[i].fullName.toUpperCase()}`;

  const lista: { razao: string; fantasia?: string; tipo: string; ini: string | null; fim: string | null; colabs: number[]; encerrado?: string; obs?: string }[] = [
    { razao: nomeMei(0), tipo: "mei", ini: addDias(hoje, -300), fim: addDias(hoje, 200), colabs: [0] },
    { razao: `${colabs[1].fullName.split(" ")[0].toUpperCase()} PRODUÇÕES LTDA`, tipo: "empresa", ini: addDias(hoje, -340), fim: addDias(hoje, 12), colabs: [1] },
    { razao: "MONTAGENS ESTRELA DO NORTE LTDA", fantasia: "Estrela Montagens", tipo: "empreiteira", ini: addDias(hoje, -120), fim: null, colabs: [2, 3, 4, 5], obs: "Equipe de montagem dos eventos do Nordeste." },
    { razao: nomeMei(6), tipo: "mei", ini: addDias(hoje, -400), fim: addDias(hoje, -20), colabs: [6] },
    { razao: "SERVIÇOS DE PALCO HORIZONTE ME", tipo: "empresa", ini: null, fim: null, colabs: [7] },
    { razao: nomeMei(8), tipo: "mei", ini: addDias(hoje, 15), fim: addDias(hoje, 380), colabs: [8] },
    { razao: nomeMei(9), tipo: "mei", ini: addDias(hoje, -200), fim: addDias(hoje, 165), colabs: [9], encerrado: "CNPJ baixado pelo colaborador; passou a emitir por outra empresa." },
    { razao: "CENOGRAFIA ATLÂNTICO EIRELI", fantasia: "Atlântico Ceno", tipo: "empresa", ini: addDias(hoje, -60), fim: addDias(hoje, 305), colabs: [] },
    { razao: "LUZ & SOM PARCEIROS LTDA", tipo: "empresa", ini: addDias(hoje, -30), fim: addDias(hoje, 27), colabs: [] },
    { razao: "TRANSPORTES RÁPIDOS DO VALE LTDA", tipo: "empreiteira", ini: addDias(hoje, -500), fim: addDias(hoje, 600), colabs: [] },
  ];

  let n = 0;
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    const autor = i % 2 === 0 ? admin : rh;
    const [k] = await db.insert(schema.contratos).values({
      cnpj: digitosDoCnpj(completarCnpj(`7${String(i + 1).padStart(7, "0")}0001`)),
      razaoSocial: c.razao, nomeFantasia: c.fantasia ?? null, tipo: c.tipo, vigenciaInicio: c.ini, vigenciaFim: c.fim, observacao: c.obs ?? null,
      criadoPor: autor.id, criadoPorNome: autor.name, atualizadoPorNome: autor.name,
      ...(c.encerrado ? { encerradoEm: new Date(), encerradoPor: rh.id, encerradoPorNome: rh.name, motivoEncerramento: c.encerrado, versao: 2 } : {}),
    }).returning();
    n++;
    for (const idx of c.colabs) await db.insert(schema.contratosColaboradores).values({ contratoId: k.id, collaboratorId: colabs[idx].id, criadoPorNome: autor.name });
    await db.insert(schema.contratosHistorico).values({ contratoId: k.id, acao: "criado", detalhes: ["Contrato cadastrado.", ...c.colabs.map((idx) => `Colaborador vinculado: ${colabs[idx].fullName}.`)], por: autor.id, porNome: autor.name, em: new Date(Date.now() - (20 - i) * 86_400_000) });
    if (c.encerrado) await db.insert(schema.contratosHistorico).values({ contratoId: k.id, acao: "encerrado", detalhes: [`Contrato encerrado. Motivo: ${c.encerrado}`], por: rh.id, porNome: rh.name });
  }

  // Dados de pagamento — só com a chave da demo.
  let pagamentos = 0;
  if (chaveConfigurada()) {
    const pags: { idx: number; d: DadosDePagamento; por: typeof admin; conferido?: boolean }[] = [
      { idx: 0, d: { banco: "260", agencia: "0001", conta: "4821937-5", tipoConta: "pagamento", pixTipo: "email", pixChave: "pix.demo0@exemplo.com", titular: lista[0].razao, email: "contato.demo0@exemplo.com" }, por: admin },
      { idx: 1, d: { banco: "341", agencia: "1234", conta: "56789-0", tipoConta: "corrente", pixTipo: "aleatoria", pixChave: "3f1c2b9a-6d4e-4b8f-9a21-7c55e0d4a913", titular: "Fulano De Tal Sobrinho", email: null }, por: rh },
      { idx: 2, d: { banco: "001", agencia: "3301-2", conta: "100234-7", tipoConta: "corrente", pixTipo: null, pixChave: null, titular: "Montagens Estrela do Norte Ltda", email: "financeiro@estrela.exemplo.com" }, por: rh, conferido: true },
    ];
    for (const p of pags) {
      const id = colabs[p.idx].id;
      await db.insert(schema.colaboradoresPagamento).values({
        collaboratorId: id,
        bancoCifrado: cifrar(p.d.banco, `${id}:banco`), agenciaCifrada: cifrar(p.d.agencia, `${id}:agencia`),
        contaCifrada: cifrar(p.d.conta, `${id}:conta`), pixChaveCifrada: cifrar(p.d.pixChave, `${id}:pixChave`),
        tipoConta: p.d.tipoConta, pixTipo: p.d.pixTipo, titular: p.d.titular, email: p.d.email,
        atualizadoPor: p.por.id, atualizadoPorNome: p.por.name,
      });
      const campos = (Object.keys(p.d) as (keyof DadosDePagamento)[]).filter((k) => p.d[k]);
      const m = pagamentoMascarado(p.d);
      await db.insert(schema.colaboradoresPagamentoAlteracoes).values({
        collaboratorId: id, campos, antes: Object.fromEntries(campos.map((c) => [c, null])), depois: Object.fromEntries(campos.map((c) => [c, m[c] ?? null])),
        mudaConta: true, por: p.por.id, porNome: p.por.name, em: new Date(Date.now() - (3 - p.idx) * 3_600_000),
        ...(p.conferido ? { conferidoEm: new Date(), conferidoPor: admin.id, conferidoPorNome: admin.name } : {}),
      });
      pagamentos++;
    }
  }
  return { contratos: n, pagamentos };
}
