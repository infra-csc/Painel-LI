import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Settings, Save, Info, DollarSign, Car, Utensils } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdmin } from "@/lib/permissions";

const formSchema = z.object({
  default_daily_value_weekday: z.string().min(1, "Obrigatório"),
  default_daily_value_weekend: z.string().min(1, "Obrigatório"),
  default_mobility: z.string().min(1, "Obrigatório"),
  default_weekday_lunch: z.string().min(1, "Obrigatório"),
  default_weekday_dinner: z.string().min(1, "Obrigatório"),
  default_weekend_lunch: z.string().min(1, "Obrigatório"),
  default_weekend_dinner: z.string().min(1, "Obrigatório"),
});

type FormValues = z.infer<typeof formSchema>;

function centavosToReais(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

export default function SystemSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery<Record<string, number>>({
    queryKey: ["/api/system-settings"],
    queryFn: async () => {
      const res = await fetch("/api/system-settings", { credentials: "include" });
      return res.json();
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      default_daily_value_weekday: "50.00",
      default_daily_value_weekend: "50.00",
      default_mobility: "25.00",
      default_weekday_lunch: "35.00",
      default_weekday_dinner: "40.00",
      default_weekend_lunch: "40.00",
      default_weekend_dinner: "45.00",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        default_daily_value_weekday: centavosToReais(settings.default_daily_value_weekday ?? settings.default_daily_value ?? 5000),
        default_daily_value_weekend: centavosToReais(settings.default_daily_value_weekend ?? settings.default_daily_value ?? 5000),
        default_mobility: centavosToReais(settings.default_mobility ?? 2500),
        default_weekday_lunch: centavosToReais(settings.default_weekday_lunch ?? 3500),
        default_weekday_dinner: centavosToReais(settings.default_weekday_dinner ?? 4000),
        default_weekend_lunch: centavosToReais(settings.default_weekend_lunch ?? 4000),
        default_weekend_dinner: centavosToReais(settings.default_weekend_dinner ?? 4500),
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body: Record<string, number> = {};
      for (const [key, val] of Object.entries(values)) {
        body[key] = parseFloat(val);
      }
      return apiRequest("PUT", "/api/system-settings", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      toast({ title: "Configurações salvas", description: "Os novos valores padrão serão aplicados em orçamentos futuros." });
    },
    onError: () => {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    },
  });

  if (!isAdmin(user)) {
    return (
      <div className="p-8 text-center">
        <Settings className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Acesso restrito</h2>
        <p className="text-muted-foreground">Apenas administradores podem acessar as configurações do sistema.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-purple-500" />
          Configurações
        </h1>
        <p className="text-muted-foreground mt-1">Valores padrão para cálculo de orçamentos</p>
      </div>

      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <strong>Impacto das alterações:</strong> Mudanças aqui afetam apenas orçamentos de <strong>novos eventos</strong>. Eventos já existentes — passados, em andamento ou já planejados — mantêm os valores que já foram salvos e não serão alterados.
            </div>
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-5">

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-500" />
                Diárias
              </CardTitle>
              <CardDescription>Valor padrão por diária quando não há configuração específica por função</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="default_daily_value_weekday"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Diária — Dia Útil (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="50.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="default_daily_value_weekend"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Diária — Fim de Semana (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="100.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Car className="w-4 h-4 text-orange-500" />
                Mobilidade
              </CardTitle>
              <CardDescription>Ajuda de custo de transporte/deslocamento</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="default_mobility"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobilidade (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="25.00" {...field} className="max-w-xs" />
                    </FormControl>
                    <FormDescription>Aplicado quando a função não tem mobilidade configurada</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Utensils className="w-4 h-4 text-green-500" />
                Alimentação
              </CardTitle>
              <CardDescription>Valores de almoço e jantar por tipo de dia</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="default_weekday_lunch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Almoço — Dia Útil (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="35.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="default_weekday_dinner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jantar — Dia Útil (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="40.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="default_weekend_lunch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Almoço — Fim de Semana (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="40.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="default_weekend_dinner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jantar — Fim de Semana (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="45.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={saveMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
