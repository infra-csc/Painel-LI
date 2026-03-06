import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Settings, Save, Info, DollarSign, Car, Utensils, ShieldAlert } from "lucide-react";
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

function CurrencyInput({ field }: { field: any }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400 font-medium">R$</span>
      <Input type="number" step="0.01" min="0" {...field} className="pl-9" />
    </div>
  );
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
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Acesso restrito</h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-xs">Apenas administradores podem acessar as configurações do sistema.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
            <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configurações</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Valores padrão para cálculo de orçamentos</p>
          </div>
        </div>
      </div>

      {/* Alert */}
      <div className="flex gap-3 p-4 mb-8 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-300">
          <span className="font-semibold">Impacto das alterações:</span> Mudanças aqui afetam apenas orçamentos de{" "}
          <span className="font-semibold">novos eventos</span>. Eventos já existentes — passados, em andamento ou já
          planejados — mantêm os valores que já foram salvos.
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">

            {/* Diárias */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Diárias</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Valor por dia de trabalho</p>
                </div>
              </div>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="default_daily_value_weekday"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Dia Útil</FormLabel>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="default_daily_value_weekend"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Fim de Semana</FormLabel>
                      <FormControl><CurrencyInput field={field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Mobilidade */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
                  <Car className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Mobilidade</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ajuda de custo de deslocamento</p>
                </div>
              </div>
              <FormField
                control={form.control}
                name="default_mobility"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">Valor por evento</FormLabel>
                    <FormControl><CurrencyInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Alimentação */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                  <Utensils className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Alimentação</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Almoço e jantar por dia</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Dias Úteis</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="default_weekday_lunch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-600 dark:text-gray-400">Almoço</FormLabel>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="default_weekday_dinner"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-600 dark:text-gray-400">Jantar</FormLabel>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Fim de Semana</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="default_weekend_lunch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-600 dark:text-gray-400">Almoço</FormLabel>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="default_weekend_dinner"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-600 dark:text-gray-400">Jantar</FormLabel>
                          <FormControl><CurrencyInput field={field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer / Save */}
          <div className="flex items-center justify-between py-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Apenas administradores podem alterar estes valores.
            </p>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
