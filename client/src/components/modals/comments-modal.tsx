import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  const createCommentMutation = useMutation({
    mutationFn: async (data: CommentFormData) => {
      if (!user) throw new Error("User not authenticated");
      
      const payload = {
        teamInclusionId,
        userId: user.id,
        content: data.content,
        phase: "inclusao", // Current phase
      };

      const response = await apiRequest("POST", "/api/comments", payload);
      return response.json();
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
      case "inclusao":
        return "Inclusão de Equipe";
      case "escalacao":
        return "Escalação";
      case "passagem":
        return "Compra de Passagem";
      case "fechamento":
        return "Fechamento";
      case "aprovacao":
        return "Aprovação";
      default:
        return phase;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden" data-testid="modal-comments">
        <DialogHeader>
          <DialogTitle>Comentários do Registro</DialogTitle>
        </DialogHeader>
        
        <div className="max-h-96 overflow-y-auto space-y-4 pr-2">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="border-l-4 border-primary pl-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                  <div className="h-16 bg-muted rounded"></div>
                </div>
              ))}
            </div>
          ) : comments?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum comentário encontrado
            </p>
          ) : (
            comments?.map((comment) => (
              <div key={comment.id} className="border-l-4 border-primary pl-4" data-testid={`comment-${comment.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {user?.id === comment.userId ? "Você" : "Usuário"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(comment.createdAt || new Date())}
                    </p>
                  </div>
                  <span className="text-xs bg-muted px-2 py-1 rounded">
                    {getPhaseLabel(comment.phase)}
                  </span>
                </div>
                <p className="text-sm text-foreground mt-2">
                  {comment.content}
                </p>
              </div>
            ))
          )}
        </div>
        
        <div className="border-t border-border pt-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex space-x-3">
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Textarea 
                        rows={2}
                        placeholder="Adicionar comentário..."
                        {...field}
                        data-testid="textarea-comment"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                disabled={createCommentMutation.isPending}
                data-testid="button-add-comment"
              >
                {createCommentMutation.isPending ? "Enviando..." : "Enviar"}
              </Button>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
