import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { Comment, User } from "@shared/schema";

const commentSchema = z.object({
  content: z.string().min(1, "Comentário não pode estar vazio"),
});

type CommentFormData = z.infer<typeof commentSchema>;

interface CommentsModalProps {
  open: boolean;
  onClose: () => void;
  teamInclusionId: string;
}

export default function CommentsModal({ open, onClose, teamInclusionId }: CommentsModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<CommentFormData>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      content: "",
    },
  });

  const { data: comments, isLoading } = useQuery<Comment[]>({
    queryKey: ["/api/comments", teamInclusionId],
    enabled: open && !!teamInclusionId,
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: open,
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: CommentFormData) => {
      if (!user) throw new Error("User not authenticated");
      
      const payload = {
        teamInclusionId,
        userId: user.id,
        content: data.content,
        phase: "escalacao",
      };

      console.log("Sending payload:", payload);
      const response = await apiRequest("POST", "/api/comments", payload);
      const result = await response.json();
      console.log("Comment created:", result);
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Comentário adicionado com sucesso",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/comments", teamInclusionId] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao adicionar comentário",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CommentFormData) => {
    console.log("Form submitted with data:", data);
    console.log("User:", user);
    console.log("TeamInclusionId:", teamInclusionId);
    createCommentMutation.mutate(data);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case "inclusao": return "Inclusão de Equipe";
      case "escalacao": return "Escalação";
      case "passagem": return "Compra de Passagem";
      case "hospedagem": return "Hospedagem";
      case "aprovado": return "Aprovado";
      default: return phase;
    }
  };

  const getUserName = (userId: string): string => {
    if (user?.id === userId) return "Você";
    const commentUser = users?.find(u => u.id === userId);
    return commentUser?.name || "Usuário";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-full p-6 bg-white rounded-2xl shadow-2xl border-0" data-testid="modal-comments">
        <DialogTitle className="sr-only">Comentários do Registro</DialogTitle>

        {/* Header */}
        <div className="border-b border-slate-100 pb-4 mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Comentários do Registro</h2>
        </div>

        {/* Lista de comentários */}
        <div className="max-h-64 overflow-y-auto space-y-3 mb-4 scrollbar-thin scrollbar-thumb-slate-200 pr-1">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-1/3"></div>
                  <div className="h-12 bg-slate-100 rounded"></div>
                </div>
              ))}
            </div>
          ) : comments?.length === 0 ? (
            <div className="bg-slate-50 rounded-xl border border-dashed border-slate-200 py-10 text-center text-slate-400 text-sm mb-4">
              Nenhum comentário ainda
            </div>
          ) : (
            comments?.map((comment) => (
              <div key={comment.id} className="border-l-2 border-blue-200 pl-3 py-1" data-testid={`comment-${comment.id}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-slate-700">{getUserName(comment.userId)}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{getPhaseLabel(comment.phase)}</span>
                    <span className="text-xs text-slate-400">{formatDate(comment.createdAt || new Date())}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-600">{comment.content}</p>
              </div>
            ))
          )}
        </div>

        {/* Formulário */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="Adicionar comentário..."
                      className="border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 text-sm p-3 w-full resize-none min-h-[80px] transition-all"
                      {...field}
                      data-testid="textarea-comment"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={createCommentMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-semibold shadow-sm transition-all"
                data-testid="button-add-comment"
              >
                {createCommentMutation.isPending ? "Enviando..." : "Enviar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
