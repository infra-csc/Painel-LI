// Extraído de invoices.tsx em 25/09 (modularização): todas as mutations da
// tela de Notas Fiscais — empresa pagadora do evento, envio/reenvio da nota
// pelo colaborador e as quatro ações do RH (aprovar, devolver, recusar,
// check-in). Toasts e invalidações são os mesmos da página original; os
// componentes ficaram só com a apresentação.
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { BudgetActual, Invoice } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import { fmtDate } from "./invoice-format";
import type { ToastFn } from "./types";
import { CHAVE_CONTROLE_RH } from "@/components/rh/prestacao-utils";

/** Infra que toda mutation desta tela recebe da página. */
interface InfraMutation {
  selectedEventId: string;
  qc: QueryClient;
  toast: ToastFn;
}

// ── Empresa pagadora do evento (tela-bloqueio do RH) ─────────────────────────
export function useSetEventCompanyMutation({ selectedEventId, qc, toast }: InfraMutation) {
  return useMutation({
    mutationFn: async ({ name, cnpj }: { name: string; cnpj: string }) => {
      const res = await apiRequest("PATCH", `/api/events/${selectedEventId}/payment-company`, {
        paymentCompanyName: name,
        paymentCompanyCnpj: cnpj,
      });
      if (!res.ok) throw new Error("Erro ao salvar empresa pagadora");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Empresa pagadora configurada com sucesso" });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível salvar a empresa pagadora", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });
}

// ── Envio da nota pelo colaborador (card) ────────────────────────────────────
export interface UseSubmitInvoiceArgs extends InfraMutation {
  actual: BudgetActual;
  invoice: Invoice | undefined;
  /** Texto "Este pagamento deve ser realizado de X para Y" gravado junto da NF. */
  paymentText: string;
}

/**
 * Estado do formulário (OC, anexo, erros) + mutation de envio. O estado vive
 * aqui porque a mutation lê e escreve nele (upload → limpa anexo → erros).
 */
export function useSubmitInvoice({ actual, invoice, selectedEventId, qc, toast, paymentText }: UseSubmitInvoiceArgs) {
  const [oc, setOc] = useState(invoice?.oc || "");
  const [erros, setErros] = useState<{ oc?: string; anexo?: string }>({});
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [clearedAttachment, setClearedAttachment] = useState(false);

  function removeAttachment() {
    setFile(null);
    setClearedAttachment(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const forceClear = clearedAttachment;
      let attachmentUrl = forceClear ? "" : (invoice?.attachmentUrl || "");
      let attachmentName = forceClear ? "" : (invoice?.attachmentName || "");

      if (file) {
        setUploading(true);
        const fd = new FormData();
        fd.append("files", file);
        const resp = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
        if (!resp.ok) {
          setUploading(false);
          throw new Error("Falha ao enviar o arquivo da nota. Verifique sua conexão e tente novamente.");
        }
        const uploaded = await resp.json();
        if (uploaded?.[0]?.url) {
          attachmentUrl = uploaded[0].url;
          attachmentName = file.name;
        } else {
          setUploading(false);
          throw new Error("Falha ao enviar o arquivo da nota. Tente novamente.");
        }
        setUploading(false);
      }

      if (!oc.trim()) { setErros({ oc: "Informe o número da OC." }); document.getElementById(`nf-oc-${actual.id}`)?.focus(); throw new Error("Informe o número da OC."); }
      if (!attachmentUrl) { setErros({ anexo: "Anexe o arquivo da nota fiscal." }); document.getElementById(`nf-file-btn-${actual.id}`)?.focus(); throw new Error("Anexe o arquivo da nota fiscal."); }
      setErros({});

      if (invoice) {
        return apiRequest("PATCH", `/api/invoices/${invoice.id}`, { oc, attachmentUrl, attachmentName, paymentText, status: "enviada" }).then(r => r.json());
      }
      return apiRequest("POST", "/api/invoices", {
        eventId: selectedEventId, collaboratorId: actual.collaboratorId,
        functionId: actual.functionId, budgetActualId: actual.id,
        oc, attachmentUrl, attachmentName, paymentText, status: "enviada",
      }).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      setFile(null);
      // Decisão 19/08 (substitui a regra de 17/08): a NF não credita mais o
      // Flash — alimentação e mobilidade entram na aprovação do comparativo.
      // A nota só documenta o pagamento, então nada de aviso de Flash aqui.
      toast({ title: "Nota enviada!", description: "Aguardando análise do RH." });
    },
    onError: (e: unknown) => {
      setUploading(false);
      // e.body vem do apiRequest enriquecido — mostra a mensagem real do
      // servidor (ex.: validação de OC repetida) em vez do texto genérico
      toast({ title: "Não foi possível enviar a nota", description: apiErrorMessage(e, "Tente novamente."), variant: "destructive" });
    },
  });

  return { oc, setOc, erros, setErros, file, setFile, uploading, clearedAttachment, fileRef, removeAttachment, submitMutation };
}

// ── Ações do RH (aba Aprovação) ──────────────────────────────────────────────
export interface UseAprovacaoMutationsArgs extends InfraMutation {
  /** Motivo digitado (devolver/recusar) — lido na hora do disparo, como antes. */
  comment: string;
  /** Data de pagamento do check-in (YYYY-MM-DD). */
  checkinDate: string;
  /** Fecha o painel inline após o sucesso. */
  closeAction: () => void;
}

export function useAprovacaoMutations({ selectedEventId, qc, toast, comment, checkinDate, closeAction }: UseAprovacaoMutationsArgs) {
  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/approve`, {}).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      // Chave global também (igual reject/checkin) — o Controle RH usa ["/api/invoices"]
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      closeAction();
      toast({ title: "Nota aprovada!", description: "Faça o Check-in Financeiro para definir a data de pagamento." });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível aprovar a nota", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const returnMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/return`, { comment }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      // Chave global também (igual reject/checkin) — o Controle RH usa ["/api/invoices"]
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      closeAction();
      toast({ title: "Nota devolvida para ajuste." });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível devolver a nota", description: apiErrorMessage(err, "Informe o motivo da devolução e tente novamente."), variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/reject`, { comment }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      closeAction();
      // A recusa não mexe no Flash (decisão 19/08): o crédito é do comparativo
      // aprovado; para estornar, rejeite/devolva o comparativo do evento.
      toast({ title: "Nota recusada.", description: "A recusa é definitiva — esta nota não poderá ser reenviada." });
    },
    onError: (e: unknown) => toast({ title: "Não foi possível recusar a nota", description: apiErrorMessage(e, "Tente novamente."), variant: "destructive" }),
  });

  const checkinMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/invoices/${id}/checkin`, {
        ...(checkinDate ? { paymentDate: checkinDate } : {}),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices", selectedEventId] });
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      qc.invalidateQueries({ queryKey: [CHAVE_CONTROLE_RH] });
      closeAction();
      toast({ title: "Check-in realizado!", description: `Data de pagamento: ${fmtDate(checkinDate)}` });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível fazer o check-in", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  return { approveMutation, returnMutation, rejectMutation, checkinMutation };
}
