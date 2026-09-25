// Extraído de system-settings.tsx em 25/09 (modularização): estado do
// formulário "Nova empresa" e as mutations de criar/remover empresa pagadora.
// Separado do formulário de tarifas porque não passa pelo react-hook-form nem
// pela barra flutuante — salva na hora, com toast próprio.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PaymentCompany } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";

export function usePaymentCompanies() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyCnpj, setNewCompanyCnpj] = useState("");
  const [companyToDelete, setCompanyToDelete] = useState<PaymentCompany | null>(null);

  const createCompanyMutation = useMutation({
    mutationFn: (data: { name: string; cnpj: string }) =>
      apiRequest("POST", "/api/payment-companies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-companies"] });
      setNewCompanyName("");
      setNewCompanyCnpj("");
      setShowAddCompany(false);
      toast({ title: "Empresa cadastrada com sucesso." });
    },
    onError: (err: unknown) => toast({ title: "Não foi possível cadastrar a empresa", description: apiErrorMessage(err, "Tente novamente."), variant: "destructive" }),
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payment-companies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-companies"] });
      toast({ title: "Empresa removida." });
    },
    onError: (e: unknown) => toast({
      title: "Não foi possível remover a empresa",
      description: apiErrorMessage(e, "Tente novamente."),
      variant: "destructive",
    }),
  });

  return {
    showAddCompany, setShowAddCompany,
    newCompanyName, setNewCompanyName,
    newCompanyCnpj, setNewCompanyCnpj,
    companyToDelete, setCompanyToDelete,
    createCompanyMutation,
    deleteCompanyMutation,
  };
}

export type PaymentCompaniesState = ReturnType<typeof usePaymentCompanies>;
