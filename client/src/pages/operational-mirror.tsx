import { useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import EventCombobox from "@/components/ui/event-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  RefreshCw, FileSpreadsheet, AlertTriangle, Plane, BedDouble, Luggage, Car,
  CheckCircle2, Users, Loader2, CheckCheck, MapPin, Clock,
} from "lucide-react";

function brl(cents: number | null | undefined): string {
  if (!cents) return "R$ 0,00";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
}

const genderLabel: Record<string, string> = { male: "M", female: "F", unknown: "?" };

export default function OperationalMirror() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const search = useSearch();
  const initialEventId = new URLSearchParams(search).get("eventId") || "";
  const [eventId, setEventId] = useState<string>(initialEventId);

  const { data: events } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/events", eventId, "operational-mirror"],
    enabled: !!eventId && eventId !== "all",
  });

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/events/${eventId}/recalculate-logistics-suggestions`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "operational-mirror"] });
      toast({ title: "Sugestões recalculadas", description: "Grupos confirmados foram preservados." });
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível recalcular.", variant: "destructive" }),
  });

  const confirmRoomMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/hotel-room-groups/${id}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "operational-mirror"] });
      toast({ title: "Quarto confirmado" });
    },
  });

  const confirmUberMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/uber-groups/${id}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "operational-mirror"] });
      toast({ title: "Uber confirmado" });
    },
  });

  function handleExport() {
    if (!eventId) return;
    window.open(`/api/events/${eventId}/operational-mirror/export`, "_blank");
  }

  const totals = data?.totals;

  return (
    <div className="p-6 space-y-6" data-testid="page-operational-mirror">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Espelho Operacional do Evento</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada de passagem, hospedagem, bagagem, Uber e locação por colaborador.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => recalcMutation.mutate()} disabled={!eventId || recalcMutation.isPending} data-testid="button-recalc">
            {recalcMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Recalcular sugestões
          </Button>
          <Button onClick={handleExport} disabled={!eventId} data-testid="button-export">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <div className="max-w-md">
        <EventCombobox events={events} value={eventId} onValueChange={setEventId} placeholder="Selecione um evento" showAllOption={false} />
      </div>

      {!eventId && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Selecione um evento para visualizar o espelho operacional.
          </CardContent>
        </Card>
      )}

      {eventId && isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...
        </div>
      )}

      {eventId && !isLoading && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard icon={<Plane className="h-4 w-4" />} label="Passagens" value={brl(totals.tickets)} />
            <SummaryCard icon={<BedDouble className="h-4 w-4" />} label="Hospedagem" value={brl(totals.hotel)} />
            <SummaryCard icon={<Luggage className="h-4 w-4" />} label="Bagagem" value={brl(totals.baggage)} />
            <SummaryCard icon={<Car className="h-4 w-4" />} label="Uber" value={brl(totals.uber)} />
            <SummaryCard icon={<Car className="h-4 w-4" />} label="Locação" value={brl(totals.carRental)} />
            <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Total Geral" value={brl(totals.grand)} highlight />
          </div>

          {data.pendingCount > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              {data.pendingCount} pendência(s) detectada(s) nas linhas abaixo.
            </div>
          )}

          <Tabs defaultValue="table">
            <TabsList>
              <TabsTrigger value="table" data-testid="tab-table">Consolidado</TabsTrigger>
              <TabsTrigger value="rooms" data-testid="tab-rooms">Quartos ({data.roomGroups.length})</TabsTrigger>
              <TabsTrigger value="uber" data-testid="tab-uber">Uber ({data.uberGroups.length})</TabsTrigger>
            </TabsList>

            {/* Consolidated table */}
            <TabsContent value="table">
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b">
                      <tr className="text-left">
                        <th className="p-2 font-medium">Colaborador</th>
                        <th className="p-2 font-medium">Função</th>
                        <th className="p-2 font-medium">Sexo/UF</th>
                        <th className="p-2 font-medium">Escala</th>
                        <th className="p-2 font-medium">Passagem</th>
                        <th className="p-2 font-medium">Hospedagem</th>
                        <th className="p-2 font-medium">Bagagem</th>
                        <th className="p-2 font-medium">Uber</th>
                        <th className="p-2 font-medium">Locação</th>
                        <th className="p-2 font-medium">Pendências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r: any) => (
                        <tr key={r.teamInclusionId} className="border-b hover:bg-muted/30" data-testid={`row-${r.teamInclusionId}`}>
                          <td className="p-2 font-medium">{r.collaborator.fullName}</td>
                          <td className="p-2">{r.function.name || "—"}<div className="text-muted-foreground">{r.function.costCenter || ""}</div></td>
                          <td className="p-2">{genderLabel[r.collaborator.gender || "unknown"]} / {r.collaborator.state || "—"}</td>
                          <td className="p-2 whitespace-nowrap">{fmtDate(r.schedule.startDate)}<br />{fmtDate(r.schedule.endDate)}</td>
                          <td className="p-2 whitespace-nowrap">
                            {r.ticket ? (
                              <>
                                <div>{brl(r.ticket.value)}</div>
                                <div className="text-muted-foreground">{r.ticket.locator || r.ticket.reservationNumber || "s/ loc."}</div>
                              </>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {r.accommodation ? (
                              <>
                                <div>{r.accommodation.hotelName || "s/ hotel"}</div>
                                <div className="text-muted-foreground">{r.roomGroupLabel || r.accommodation.roomType || ""}</div>
                              </>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-2 whitespace-nowrap">{r.baggage.totalCents ? brl(r.baggage.totalCents) : "—"}</td>
                          <td className="p-2 whitespace-nowrap">
                            {r.uber.groupName ? <Badge variant="secondary" className="text-[10px]">{r.uber.groupName}</Badge> : <span className="text-muted-foreground">—</span>}
                            {r.uber.totalCents ? <div>{brl(r.uber.totalCents)}</div> : null}
                          </td>
                          <td className="p-2 whitespace-nowrap">{r.carRental.totalCents ? brl(r.carRental.totalCents) : "—"}</td>
                          <td className="p-2">
                            {r.pendencies.length === 0 ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <div className="flex flex-col gap-1">
                                {r.pendencies.map((p: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400 w-fit">{p}</Badge>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {data.rows.length === 0 && (
                        <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Nenhum colaborador escalado neste evento.</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Room groups */}
            <TabsContent value="rooms" className="space-y-3">
              {data.roomGroups.length === 0 && (
                <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma sugestão de quarto. Clique em "Recalcular sugestões".</CardContent></Card>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.roomGroups.map((g: any) => (
                  <Card key={g.id} className={g.confirmed ? "border-green-400" : "border-dashed"} data-testid={`room-${g.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="flex items-center gap-2"><BedDouble className="h-4 w-4" /> {g.roomType || "quarto"}</span>
                        {g.confirmed ? <Badge className="bg-green-600">Confirmado</Badge> : <Badge variant="outline">Sugestão</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <div className="text-muted-foreground">{g.hotelName || "Hotel a definir"}</div>
                      <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {fmtDate(g.checkInDate)} → {fmtDate(g.checkOutDate)}</div>
                      <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {g.members.length} hóspede(s)</div>
                      {!g.confirmed && (
                        <Button size="sm" className="w-full mt-2" onClick={() => confirmRoomMutation.mutate(g.id)} disabled={confirmRoomMutation.isPending} data-testid={`confirm-room-${g.id}`}>
                          <CheckCheck className="h-3 w-3 mr-1" /> Confirmar
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Uber groups */}
            <TabsContent value="uber" className="space-y-3">
              {data.uberGroups.length === 0 && (
                <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma sugestão de Uber. Clique em "Recalcular sugestões".</CardContent></Card>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.uberGroups.map((g: any) => (
                  <Card key={g.id} className={g.confirmed ? "border-green-400" : "border-dashed"} data-testid={`uber-${g.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="flex items-center gap-2"><Car className="h-4 w-4" /> {g.direction === "ida" ? "Ida" : "Volta"}</span>
                        {g.confirmed ? <Badge className="bg-green-600">Confirmado</Badge> : <Badge variant="outline">Sugestão</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" /> {g.origin || "?"} → {g.destination || "?"}</div>
                      <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {fmtDate(g.date)} {g.time || ""}</div>
                      <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {g.members.length} passageiro(s)</div>
                      {!g.confirmed && (
                        <Button size="sm" className="w-full mt-2" onClick={() => confirmUberMutation.mutate(g.id)} disabled={confirmUberMutation.isPending} data-testid={`confirm-uber-${g.id}`}>
                          <CheckCheck className="h-3 w-3 mr-1" /> Confirmar
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary bg-primary/5" : ""}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-base font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
