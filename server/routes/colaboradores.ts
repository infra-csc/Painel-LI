/**
 * Colaboradores: listagem (com projeção de dados pessoais por papel), cadastro
 * individual e em lote (CSV), edição, inativação e reativação.
 * Papéis: cadastro + RH + Área de Função leem; cadastro + Área de Função
 * criam/editam; só admin/Compras inativam e reativam.
 */
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertCollaboratorSchema } from "@shared/schema";
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import { corrigirTextoDeNome } from "@shared/texto-nome";
import { normalizarEndereco } from "@shared/endereco";
import { createAuditLog, ehViolacaoDeUnicidade, requireRoles, CADASTRO_ROLES, eventIdDaQuery } from "./_compartilhado";

export function registrarColaboradores(app: Express): void {
  // Collaborators routes
  // Projeção por papel (23/09): Área de Função e Logística escalam pessoas,
  // não precisam de CPF/RG, nascimento, telefone, endereço nem do anexo do
  // documento — esses campos ficam para cadastro (admin/Compras), RH e a
  // própria lista completa de quem cadastra. Tudo que a escalação usa (nome,
  // número, tipo, cidade/UF, gênero, status, coordenador, ativo) continua.
  const CAMPOS_PESSOAIS_DO_COLABORADOR = [
    "officialDocument", "documentType", "secondaryDocument", "secondaryDocumentType",
    "documentAttachmentId", "birthDate", "phone",
    "addressStreet", "addressNumber", "addressComplement", "addressZip",
  ] as const;
  const PAPEIS_QUE_VEEM_DADOS_PESSOAIS: readonly CanonicalRole[] = ["admin", "purchasing", "financial"];
  const projetarColaborador = (c: Record<string, any>, role: CanonicalRole | null) => {
    if (role && PAPEIS_QUE_VEEM_DADOS_PESSOAIS.includes(role)) return c;
    const copia: Record<string, any> = { ...c };
    for (const campo of CAMPOS_PESSOAIS_DO_COLABORADOR) delete copia[campo];
    return copia;
  };

  app.get("/api/collaborators", async (req, res) => {
    const leitor = await requireRoles(req, res, [...CADASTRO_ROLES, "financial", "function_area"]);
    if (!leitor) return;
    try {
      const role = normalizeRole(leitor.role);
      // ?eventId= (23/09): só quem tem vaga no evento — as telas por evento não
      // precisam do cadastro inteiro.
      const eventId = eventIdDaQuery(req);
      const collaborators = await storage.getCollaborators(eventId);
      res.set("Cache-Control", "no-store"); // dado pessoal
      res.json(collaborators.map((c) => projetarColaborador(c, role)));
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar colaboradores" });
    }
  });

  app.post("/api/collaborators", async (req, res) => {
    // Mesmos papéis que o PATCH exige (cadastro + área de função). Antes exigia
    // só sessão, então qualquer logado criava colaborador.
    const creator = await requireRoles(req, res, [...CADASTRO_ROLES, 'function_area']);
    if (!creator) return;
    const creatorId = creator.id;
    try {
      // Campos de identidade que o client ainda possa enviar são descartados —
      // a identidade e o papel vêm da sessão
      const { _userId, _userRole, ...bodyData } = req.body;

      // Validar dados do colaborador
      // (não logar o corpo: contém CPF/telefone do colaborador)
      let collaboratorData: any = insertCollaboratorSchema.parse(bodyData);
      // Nome e cidade limpos ao gravar (15/09): planilha colada com a
      // codificação trocada deixava "SILVAÂ", "GONÃALVES", espaços sobrando.
      if (typeof collaboratorData.fullName === "string") collaboratorData.fullName = corrigirTextoDeNome(collaboratorData.fullName);
      if (typeof collaboratorData.city === "string") collaboratorData.city = corrigirTextoDeNome(collaboratorData.city);
      // Endereço (22/09): opcional; CEP padronizado, campo em branco vira null.
      const endereco = normalizarEndereco(collaboratorData);
      if ("erro" in endereco) return res.status(400).json({ message: endereco.erro });
      Object.assign(collaboratorData, endereco.campos);
      // Aprovação só pelo fluxo dedicado (ou pela regra de auto-aprovação abaixo)
      delete collaboratorData.status;
      delete collaboratorData.approvedBy;
      delete collaboratorData.approvedAt;

      // creator já veio de requireRoles acima
      collaboratorData = {
        ...collaboratorData,
        createdBy: creator.id,
        createdByName: creator.name,
      };

      // Auto-aprovar colaboradores criados por usuários "Área de Função".
      // O papel vem do banco (via sessão) — antes vinha do corpo da requisição,
      // então qualquer um se declarava function_area e já nascia aprovado.
      if (normalizeRole(creator?.role) === 'function_area') {
        collaboratorData = {
          ...collaboratorData,
          status: 'aprovado',
          approvedAt: new Date(),
          approvedBy: creator?.id ?? null,
        };
      }

      // Duplicidade por documento normalizado, numa consulta pontual (23/09) —
      // antes a tabela inteira de colaboradores era carregada para achar um.
      const duplicateDoc = collaboratorData.officialDocument
        ? await storage.getCollaboratorByDocument(collaboratorData.officialDocument)
        : undefined;
      if (duplicateDoc) {
        return res.status(409).json({
          message: `Já existe um colaborador cadastrado com o documento ${collaboratorData.officialDocument}`
        });
      }

      const collaborator = await storage.createCollaborator(collaboratorData);
      await createAuditLog("create", "collaborator", collaborator.id, collaborator, creator.id, creator.name, undefined, req);
      res.json(collaborator);
    } catch (error) {
      if (ehViolacaoDeUnicidade(error)) {
        return res.status(409).json({ message: "Já existe um colaborador cadastrado com este documento." });
      }
      console.error("Erro completo ao criar colaborador:", error);
      if (error instanceof Error) {
        console.error("Mensagem de erro:", error.message);
      }
      res.status(400).json({ message: "Dados inválidos. Verifique os campos obrigatórios." });
    }
  });

  app.post("/api/collaborators/bulk", async (req, res) => {
    const bulkCreator = await requireRoles(req, res, [...CADASTRO_ROLES, 'function_area']);
    if (!bulkCreator) return;
    const bulkCreatorId = bulkCreator.id;
    try {
      const { collaborators } = req.body;

      if (!Array.isArray(collaborators) || collaborators.length === 0) {
        return res.status(400).json({ message: "Lista de colaboradores é obrigatória" });
      }

      const result = {
        totalProcessed: collaborators.length,
        successful: 0,
        failed: 0,
        errors: [] as Array<{ row: number; name: string; error: string }>
      };

      // Set para controlar documentos já processados no lote atual
      const processedDocuments = new Set<string>();

      // Duplicata contra o banco: UMA leitura antes do loop. Antes, CADA linha
      // do CSV recarregava a tabela inteira de colaboradores (auditoria 28/08:
      // CSV de 300 linhas = 300 SELECTs de ~900 linhas). Os criados neste lote
      // entram no Set na hora, então a semântica é idêntica.
      const documentosExistentes = new Set(
        (await storage.getCollaborators()).map((c) => c.officialDocument),
      );

      // bulkCreator já veio de requireRoles; papel do banco, não do corpo
      const bulkAutoApprove = normalizeRole(bulkCreator.role) === 'function_area';

      for (let i = 0; i < collaborators.length; i++) {
        const collaboratorData = collaborators[i];

        // Verificar se o documento já foi processado no lote atual
        const docToCheck = collaboratorData.officialDocument || collaboratorData.document;
        if (processedDocuments.has(docToCheck)) {
          // Ignorar silenciosamente os duplicados no mesmo CSV
          continue;
        }

        // Adicionar documento ao conjunto de processados
        processedDocuments.add(docToCheck);

        try {
          // Validate each collaborator - tratar campos vazios
          const birthDateValue = collaboratorData.birthDate
            ? collaboratorData.birthDate // já está em formato YYYY-MM-DD
            : '1900-01-01'; // data padrão para campos vazios

          // Auto-aprovar apenas se for usuário "Área de Função"
          const autoApprove = bulkAutoApprove;

          const validatedData = insertCollaboratorSchema.parse({
            fullName: collaboratorData.fullName || 'Sem nome',
            officialDocument: collaboratorData.officialDocument || collaboratorData.document || 'SEM-DOCUMENTO-' + Date.now(),
            documentType: collaboratorData.documentType || 'rg',
            birthDate: birthDateValue,
            phone: collaboratorData.phone || null,
            type: collaboratorData.type || 'freela',
            city: collaboratorData.city || 'Não informado',
            area: collaboratorData.area || 'Geral',
            status: autoApprove ? "aprovado" : "pendente", // Auto-aprovar apenas para function_area
            // approvedAt é timestamp no schema: ISO string era recusada pelo zod
            // e toda linha da Área de Função falhava com "Expected date".
            ...(autoApprove ? {
              approvedBy: bulkCreatorId,
              approvedAt: new Date()
            } : {})
          });

          // Check if collaborator with same document already exists
          if (documentosExistentes.has(validatedData.officialDocument)) {
            result.failed++;
            result.errors.push({
              row: i + 1,
              name: collaboratorData.fullName || 'N/A',
              error: 'Documento oficial já cadastrado'
            });
            continue;
          }

          documentosExistentes.add(validatedData.officialDocument);
          await storage.createCollaborator({
            ...validatedData,
            createdBy: bulkCreator?.id ?? null,
            createdByName: bulkCreator?.name ?? null,
          } as any);
          result.successful++;

        } catch (error) {
          result.failed++;
          result.errors.push({
            row: i + 1,
            name: collaboratorData.fullName || 'N/A',
            error: error instanceof Error ? error.message : 'Erro de validação'
          });
        }
      }

      await createAuditLog("create", "collaborator", "bulk", { totalProcessed: result.totalProcessed, successful: result.successful, failed: result.failed }, bulkCreator.id, bulkCreator.name, undefined, req);
      res.json(result);
    } catch (error) {
      console.error('Bulk upload error:', error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.patch("/api/collaborators/:id", async (req, res) => {
    // Cadastro de colaborador: mesmos papéis que podem criar (inclui a Área de
    // Função, que mantém o próprio time). Antes qualquer requisição editava.
    const editor = await requireRoles(req, res, [...CADASTRO_ROLES, 'function_area']);
    if (!editor) return;
    try {
      const { id } = req.params;
      // approvedBy/approvedAt são preenchidos pela sessão (abaixo), nunca pelo
      // corpo — o client mandava ISO string e o schema (timestamp) recusava com 400.
      const { approvedBy: _ab, approvedAt: _aa, ...body } = req.body ?? {};
      const collaboratorData: any = insertCollaboratorSchema.partial().parse(body);
      // Nome e cidade limpos ao gravar (15/09) — mesma regra do cadastro.
      if (typeof collaboratorData.fullName === "string") collaboratorData.fullName = corrigirTextoDeNome(collaboratorData.fullName);
      if (typeof collaboratorData.city === "string") collaboratorData.city = corrigirTextoDeNome(collaboratorData.city);
      // Endereço (22/09): opcional; CEP padronizado, campo em branco vira null.
      const endereco = normalizarEndereco(collaboratorData);
      if ("erro" in endereco) return res.status(400).json({ message: endereco.erro });
      Object.assign(collaboratorData, endereco.campos);
      // Campos de inativação só podem ser alterados pelas rotas dedicadas
      // (/inactivate e /reactivate), que aplicam a checagem de permissão e o
      // motivo obrigatório. Removemos aqui para evitar burlar essas regras.
      delete collaboratorData.active;
      delete collaboratorData.inactiveReason;
      delete collaboratorData.inactivatedAt;
      // Proveniência é definida apenas na criação — não pode ser reescrita aqui
      delete collaboratorData.createdBy;
      delete collaboratorData.createdByName;
      // Aprovação/rejeição: quem decidiu e quando vêm da sessão
      if (collaboratorData.status === 'aprovado' || collaboratorData.status === 'rejeitado') {
        collaboratorData.approvedBy = editor.id;
        collaboratorData.approvedAt = new Date();
      }
      const anterior = await storage.getCollaborator(id);
      if (!anterior) return res.status(404).json({ message: "Colaborador não encontrado" });
      const collaborator = await storage.updateCollaborator(id, collaboratorData);
      await createAuditLog("update", "collaborator", id, collaborator, editor.id, editor.name, anterior, req);
      res.json(collaborator);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos: " + error.issues.map(i => `${i.path.join('.')} (${i.message})`).join('; ') });
      }
      res.status(400).json({ message: "Erro ao atualizar colaborador" });
    }
  });

  app.post("/api/collaborators/:id/inactivate", async (req, res) => {
    const currentUser = await requireRoles(req, res, ["admin", "purchasing"]);
    if (!currentUser) return;
    try {
      const { id } = req.params;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!reason) return res.status(400).json({ message: "O motivo da inativação é obrigatório." });
      const collaborator = await storage.getCollaborator(id);
      if (!collaborator) return res.status(404).json({ message: "Colaborador não encontrado" });
      const updated = await storage.updateCollaborator(id, {
        active: false,
        inactiveReason: reason,
        inactivatedAt: new Date(),
      } as any);
      await createAuditLog("inactivate", "collaborator", id, updated, currentUser.id, currentUser.name, collaborator, req);
      res.json(updated);
    } catch (error: any) {
      console.error("Error inactivating collaborator:", error);
      res.status(500).json({ message: "Erro ao inativar colaborador" });
    }
  });

  app.post("/api/collaborators/:id/reactivate", async (req, res) => {
    const currentUser = await requireRoles(req, res, ["admin", "purchasing"]);
    if (!currentUser) return;
    try {
      const { id } = req.params;
      const collaborator = await storage.getCollaborator(id);
      if (!collaborator) return res.status(404).json({ message: "Colaborador não encontrado" });
      const updated = await storage.updateCollaborator(id, {
        active: true,
        inactiveReason: null,
        inactivatedAt: null,
      } as any);
      await createAuditLog("reactivate", "collaborator", id, updated, currentUser.id, currentUser.name, collaborator, req);
      res.json(updated);
    } catch (error: any) {
      console.error("Error reactivating collaborator:", error);
      res.status(500).json({ message: "Erro ao reativar colaborador" });
    }
  });

}
