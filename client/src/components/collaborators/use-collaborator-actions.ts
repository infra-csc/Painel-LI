/**
 * Ações sobre um colaborador (25/09 — extraídas de pages/collaborator-management.tsx):
 * qual está selecionado, quais diálogos estão abertos, os campos da aprovação
 * e as mutations de aprovar/rejeitar, inativar e reativar.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Collaborator, User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";
import type { useToast } from "@/hooks/use-toast";
import { validateCPF } from "@/components/modals/collaborator-modal";

type Toast = ReturnType<typeof useToast>["toast"];

export function useCollaboratorActions({ user, toast, podeVerDadosPessoais }: { user: User | null; toast: Toast; podeVerDadosPessoais: boolean }) {
  const [selectedCollaborator, setSelectedCollaborator] = useState<Collaborator | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showBulkUploadModal, setBulkUploadModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editRg, setEditRg] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [inactivateReason, setInactivateReason] = useState("");

  // apiRequest já entrega o corpo do erro em err.body — api-error resolve a mensagem.
  const parseErr = (err: unknown, fallback: string) => apiErrorMessage(err, fallback);

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, approvalNotes, cpf, rg }: { id: string; status: string; approvalNotes?: string; cpf?: string; rg?: string }) => {
      // approvedAt/approvedBy vão sempre que o status muda (o servidor também
      // os preenche pela sessão — aqui é só para o cache local ficar coerente).
      const payload: Record<string, string | null> = { status, approvedAt: new Date().toISOString(), approvedBy: user?.id ?? null };
      if (approvalNotes) payload.approvalNotes = approvalNotes;
      if (cpf) { payload.officialDocument = cpf; payload.documentType = "cpf"; if (rg) { payload.secondaryDocument = rg; payload.secondaryDocumentType = "rg"; } }
      else if (rg) { payload.officialDocument = rg; payload.documentType = "rg"; }
      return (await apiRequest("PATCH", `/api/collaborators/${id}`, payload)).json();
    },
    onSuccess: () => {
      toast({ title: "Status atualizado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      setShowDetailsModal(false); setShowApprovalModal(false);
      setApprovalNotes(""); setEditCpf(""); setEditRg("");
    },
    onError: (err: unknown) => toast({ title: "Erro ao atualizar colaborador", description: parseErr(err, "Tente novamente."), variant: "destructive" }),
  });

  const inactivateMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await apiRequest("POST", `/api/collaborators/${id}/inactivate`, { reason })).json(),
    onSuccess: () => {
      toast({ title: "Colaborador inativado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
      setShowDeleteModal(false);
      setSelectedCollaborator(null);
      setInactivateReason("");
    },
    onError: (err: unknown) => toast({ title: parseErr(err, "Erro ao inativar colaborador"), variant: "destructive" }),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) =>
      (await apiRequest("POST", `/api/collaborators/${id}/reactivate`)).json(),
    onSuccess: () => {
      toast({ title: "Colaborador reativado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/collaborators"] });
    },
    onError: (err: unknown) => toast({ title: parseErr(err, "Erro ao reativar colaborador"), variant: "destructive" }),
  });

  const handleApprove = (c: Collaborator) => {
    setSelectedCollaborator(c); setApprovalAction("approve");
    setApprovalNotes("");
    if (c.documentType === "cpf") { setEditCpf(c.officialDocument || ""); setEditRg(c.secondaryDocument || ""); }
    else { setEditRg(c.officialDocument || ""); setEditCpf(c.secondaryDocument || ""); }
    setShowApprovalModal(true);
  };
  // Cancelar uma aprovação deixava editCpf/editRg/approvalNotes preenchidos com os
  // dados do colaborador anterior; a rejeição seguinte gravava o documento errado.
  const handleReject  = (c: Collaborator) => {
    setSelectedCollaborator(c); setApprovalAction("reject");
    setApprovalNotes(""); setEditCpf(""); setEditRg("");
    setShowApprovalModal(true);
  };
  const handleView    = (c: Collaborator) => { setSelectedCollaborator(c); setShowDetailsModal(true); };
  const handleEdit    = (c: Collaborator) => { setSelectedCollaborator(c); setShowEditModal(true); };
  const handleInactivate = (c: Collaborator) => { setSelectedCollaborator(c); setInactivateReason(""); setShowDeleteModal(true); };
  const handleConfirm = () => {
    if (!selectedCollaborator || updateMutation.isPending) return;
    const isApprove = approvalAction === "approve";
    // Exige ao menos um documento — mas não obriga CPF: cadastros legados
    // aprovados só com RG continuam aprováveis (exigir CPF travaria todos eles).
    // Quem não recebe os documentos do servidor aprova sem mexer neles (o
    // PATCH só leva status/observações e o cadastro mantém o que já tem).
    if (isApprove && podeVerDadosPessoais && !editCpf.trim() && !editRg.trim()) {
      toast({ title: "Informe CPF ou RG para aprovar.", variant: "destructive" });
      return;
    }
    // Mesma validação do modal de cadastro: um CPF inválido não pode virar o
    // documento oficial na aprovação.
    if (isApprove && editCpf.trim() && !validateCPF(editCpf)) {
      toast({ title: "CPF inválido", description: "Confira os dígitos do CPF antes de aprovar.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: selectedCollaborator.id,
      status: isApprove ? "aprovado" : "rejeitado",
      approvalNotes: approvalNotes.trim() || undefined,
      // Documentos só são gravados no fluxo de aprovação — a rejeição não deve
      // sobrescrever CPF/RG de ninguém.
      cpf: isApprove ? (editCpf.trim() || undefined) : undefined,
      rg:  isApprove ? (editRg.trim()  || undefined) : undefined,
    });
  };

  return {
    selectedCollaborator, showDetailsModal, setShowDetailsModal, showAddModal, setShowAddModal, showEditModal, setShowEditModal,
    showApprovalModal, setShowApprovalModal, showBulkUploadModal, setBulkUploadModal, approvalAction, approvalNotes, setApprovalNotes,
    editCpf, setEditCpf, editRg, setEditRg, showDeleteModal, setShowDeleteModal, inactivateReason, setInactivateReason,
    updateMutation, inactivateMutation, reactivateMutation,
    handleApprove, handleReject, handleView, handleEdit, handleInactivate, handleConfirm,
  };
}

export type CollaboratorActions = ReturnType<typeof useCollaboratorActions>;
