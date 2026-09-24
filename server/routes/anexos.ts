/**
 * Anexos e vouchers: leitura de vouchers em PDF (só interpretação), upload
 * multipart pelo servidor, confirmação, metadados, download e visualização
 * com ACL por dono/papel (documento de colaborador só cadastro/RH/admin).
 * Papéis: cadastro + RH + Área de Função anexam; logística lê vouchers;
 * qualquer papel acessa anexo respeitando a ACL.
 */
import type { Express } from "express";
import { db } from "../db";
import { collaborators as collaboratorsTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import { normalizeRole, type CanonicalRole } from "@shared/roles";
import { upload, requireRoles, CADASTRO_ROLES, LOGISTICA_ROLES, TODOS_OS_PAPEIS } from "./_compartilhado";

export function registrarAnexos(app: Express): void {
  /**
   * POST /api/vouchers/ler — o comprador manda um ou vários PDFs de voucher e
   * recebe de volta os campos já interpretados (regra do dono, 28/08).
   *
   * SÓ LEITURA: não grava passagem, hospedagem nem anexo. A tela mostra o que
   * foi lido para conferência e é o usuário quem manda salvar. Arquivo que não
   * é de um formato conhecido volta como "desconhecido", com aviso — nunca
   * derruba o lote inteiro.
   */
  app.post("/api/vouchers/ler", upload.array("files", 30), async (req, res) => {
    const leitor = await requireRoles(req, res, LOGISTICA_ROLES);
    if (!leitor) return;
    try {
      const arquivos = (req.files as Express.Multer.File[]) ?? [];
      if (arquivos.length === 0) return res.status(400).json({ message: "Nenhum arquivo enviado." });

      const { lerVoucherPdf, TAMANHO_MAXIMO_VOUCHER } = await import("../voucher-extract");
      const leituras = await Promise.all(
        arquivos.map(async (arquivo) => {
          const base = { arquivo: arquivo.originalname };
          if (arquivo.mimetype !== "application/pdf") {
            return { ...base, tipo: "desconhecido", campos: {}, avisos: ["Só consigo ler vouchers em PDF."] };
          }
          if (arquivo.size > TAMANHO_MAXIMO_VOUCHER) {
            return { ...base, tipo: "desconhecido", campos: {}, avisos: ["Arquivo grande demais para um voucher."] };
          }
          return { ...base, ...(await lerVoucherPdf(arquivo.buffer)) };
        }),
      );
      res.set("Cache-Control", "no-store"); // voucher tem dado pessoal
      res.json({ leituras });
    } catch (error) {
      console.error("erro ao ler voucher:", error);
      res.status(500).json({ message: "Não foi possível ler os arquivos enviados." });
    }
  });

  // ── Anexos (23/09) ──────────────────────────────────────────────────────────
  // Quem anexa: cadastro (admin/Compras/Logística), RH e Área de Função.
  // O arquivo passa pela allowlist por MAGIC NUMBER (objectAcl.ts), o nome é
  // sanitizado e o dono fica gravado no objeto — é ele que a ACL do download
  // compara. Nenhuma rota entrega URL de PUT ao cliente.
  const PAPEIS_QUE_ANEXAM: readonly CanonicalRole[] = [...CADASTRO_ROLES, "financial", "function_area"];

  const idDeAnexoValido = (id: string, res: any): boolean => {
    if (/^ATT-[A-Z0-9-]{4,60}$/.test(id)) return true;
    res.status(400).json({ message: "Identificador de anexo inválido" });
    return false;
  };

  /** Algum colaborador aponta para este anexo como documento (CPF/RG)? */
  const ehDocumentoDeColaborador = async (attachmentId: string): Promise<boolean> => {
    const [linha] = await db
      .select({ id: collaboratorsTable.id })
      .from(collaboratorsTable)
      .where(eq(collaboratorsTable.documentAttachmentId, attachmentId))
      .limit(1);
    return !!linha;
  };

  // Simple file upload endpoint for FileUpload component
  app.post("/api/upload", upload.array('files', 10), async (req, res) => {
    const quemEnvia = await requireRoles(req, res, PAPEIS_QUE_ANEXAM);
    if (!quemEnvia) return;

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "Nenhum arquivo enviado" });
    }

    const { ObjectStorageService, novoIdDeAnexo } = await import("../objectStorage");
    const { tipoPermitidoDoArquivo, sanitizarNomeDeArquivo } = await import("../objectAcl");
    const objectStorageService = new ObjectStorageService();

    // Valida TODOS antes de subir qualquer um: ou o lote entra inteiro ou nada.
    const preparados = files.map((file) => {
      const tipo = tipoPermitidoDoArquivo(file.buffer, file.mimetype, file.originalname);
      return { file, tipo };
    });
    const recusado = preparados.find((p) => !p.tipo);
    if (recusado) {
      return res.status(415).json({
        message: `"${recusado.file.originalname}" não é um PDF, imagem (PNG/JPG), planilha (XLSX) ou CSV.`,
      });
    }

    const uploadedFiles = [];
    for (const { file, tipo } of preparados) {
      const attachmentId = novoIdDeAnexo();
      const nome = sanitizarNomeDeArquivo(file.originalname, tipo!);
      await objectStorageService.enviarAnexo(attachmentId, file.buffer, tipo!.contentType, {
        ownerId: quemEnvia.id,
        nomeOriginal: nome,
      });
      uploadedFiles.push({
        id: attachmentId,
        name: nome,
        type: tipo!.contentType,
        size: file.size,
        url: `/api/attachments/${attachmentId}/view`,
      });
    }

    res.json(uploadedFiles);
  });

  // REMOVIDA em 23/09: devolvia ao cliente uma URL assinada de PUT direto no
  // bucket, sem allowlist de tipo nem dono. O caminho é POST /api/upload
  // (multipart, pelo servidor). Responde 410 para o client antigo entender.
  app.post("/api/attachments/upload", (_req, res) => {
    res.status(410).json({ message: "Use o envio pelo servidor (POST /api/upload)." });
  });

  // Confirmar upload e definir o nome de exibição — só o dono do anexo.
  app.post("/api/attachments/:id/confirm", async (req, res) => {
    const quem = await requireRoles(req, res, PAPEIS_QUE_ANEXAM);
    if (!quem) return;
    const { id } = req.params;
    if (!idDeAnexoValido(id, res)) return;
    const { fileName, fileType, fileSize } = req.body ?? {};

    const { ObjectStorageService, ObjectNotFoundError } = await import("../objectStorage");
    const { gravarMetadadosDoAnexo, tipoPeloContentType, sanitizarNomeDeArquivo } = await import("../objectAcl");
    const objectStorageService = new ObjectStorageService();

    try {
      const file = objectStorageService.arquivoDoAnexo(id);
      const meta = await objectStorageService.metadadosDoAnexo(file);
      if (meta.ownerId && meta.ownerId !== quem.id) {
        return res.status(403).json({ message: "Só quem enviou o anexo pode confirmá-lo." });
      }
      const tipo = tipoPeloContentType(meta.contentType);
      const nome = typeof fileName === "string" && fileName && tipo ? sanitizarNomeDeArquivo(fileName, tipo) : undefined;
      // Anexo antigo sem dono (subido pela URL assinada, antes de 23/09):
      // quem confirma passa a ser o dono.
      await gravarMetadadosDoAnexo(file, { ownerId: meta.ownerId ?? quem.id, nomeOriginal: nome });
      res.json({
        message: "Upload confirmado com sucesso",
        attachmentId: id,
        fileName: nome ?? meta.nomeOriginal,
        fileType: meta.contentType ?? fileType,
        fileSize: meta.tamanho ?? fileSize,
      });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return res.status(404).json({ message: "Arquivo não encontrado" });
      throw error;
    }
  });

  /**
   * Checagem de acesso comum a metadados/view/download: sessão + (dono OU
   * papel de cadastro/RH/admin); documento de colaborador só cadastro/RH/admin.
   * Devolve o objeto e os metadados, ou null (resposta já enviada).
   */
  const abrirAnexoComAcl = async (req: any, res: any) => {
    const quem = await requireRoles(req, res, TODOS_OS_PAPEIS);
    if (!quem) return null;
    const { id } = req.params as { id: string };
    if (!idDeAnexoValido(id, res)) return null;

    const { ObjectStorageService, ObjectNotFoundError } = await import("../objectStorage");
    const { podeAcessarAnexo } = await import("../objectAcl");
    const objectStorageService = new ObjectStorageService();
    const file = objectStorageService.arquivoDoAnexo(id);

    let meta;
    try {
      meta = await objectStorageService.metadadosDoAnexo(file);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ message: "Arquivo não encontrado" });
        return null;
      }
      throw error;
    }

    const documentoDeColaborador = await ehDocumentoDeColaborador(id);
    const permitido = podeAcessarAnexo({
      role: normalizeRole(quem.role),
      userId: quem.id,
      ownerId: meta.ownerId,
      documentoDeColaborador,
    });
    if (!permitido) {
      console.warn(`[Anexos] acesso negado ao anexo ${id} para o usuário ${quem.id.slice(0, 8)}`);
      res.status(403).json({ message: "Sem permissão para acessar este anexo" });
      return null;
    }
    return { id, file, meta, objectStorageService };
  };

  app.get("/api/attachments/:id", async (req, res) => {
    const aberto = await abrirAnexoComAcl(req, res);
    if (!aberto) return;
    const { id, meta } = aberto;
    res.set("Cache-Control", "private, no-store");
    res.json({
      id,
      name: meta.nomeOriginal || `Anexo_${id.slice(-8)}`,
      type: meta.contentType || "application/octet-stream",
      size: meta.tamanho != null ? `${(meta.tamanho / 1024 / 1024).toFixed(2)} MB` : "Desconhecido",
      downloadUrl: `/api/attachments/${id}/download`,
      viewUrl: `/api/attachments/${id}/view`,
      message: "Arquivo encontrado no storage",
    });
  });

  // Download de anexo (sempre attachment)
  app.get("/api/attachments/:id/download", async (req, res) => {
    const aberto = await abrirAnexoComAcl(req, res);
    if (!aberto) return;
    await aberto.objectStorageService.downloadObject(aberto.file, res, {
      inline: false,
      nomeArquivo: aberto.meta.nomeOriginal || `Anexo_${aberto.id.slice(-8)}`,
    });
  });

  // Visualização de anexo (inline só para PDF/PNG/JPG; o resto baixa)
  app.get("/api/attachments/:id/view", async (req, res) => {
    const aberto = await abrirAnexoComAcl(req, res);
    if (!aberto) return;
    await aberto.objectStorageService.downloadObject(aberto.file, res, {
      inline: true,
      nomeArquivo: aberto.meta.nomeOriginal || `Anexo_${aberto.id.slice(-8)}`,
    });
  });
}
