/** Cards-aba "Sem Passagem" / "Com Transporte" da Escalação (TabsList). */
import { Check, Clock } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ScalingTabCards({ withoutCount, withoutPending, withCount, withPending }: {
  withoutCount: number;
  withoutPending: number;
  withCount: number;
  withPending: number;
}) {
  return (
    <TabsList className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-auto bg-transparent p-0 w-full mb-2">
      <TabsTrigger
        value="without-ticket"
        disabled={withoutCount === 0}
        className="group relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/20 data-[state=active]:border-[#F97316] data-[state=active]:bg-orange-50/60 data-[state=active]:shadow-lg data-[state=active]:shadow-orange-100 transition-all duration-200 disabled:opacity-40 text-left p-0 h-auto"
      >
        <div className="absolute top-0 inset-x-0 h-[3px] bg-[#F97316] rounded-t-[14px] opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-200" />
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#F97316] items-center justify-center shadow hidden group-data-[state=active]:flex">
          <Check className="w-3 h-3 text-white" strokeWidth={3.5} />
        </span>
        <div className="flex items-center gap-3.5 px-4 pt-4 pb-4">
          <div className="w-10 h-10 rounded-xl bg-orange-100 group-data-[state=active]:bg-orange-200/60 flex items-center justify-center shrink-0 transition-colors duration-200">
            <Clock className="w-[18px] h-[18px] text-[#F97316]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-[14px] font-bold text-slate-800 leading-tight">Sem Passagem</h3>
              <span className="px-2 py-0.5 rounded-full bg-orange-100 text-[#F97316] text-[11px] font-black tabular-nums group-data-[state=active]:bg-orange-200/70">
                {withoutCount}
              </span>
            </div>
            <p className="text-[11px] font-medium leading-tight text-orange-400 group-[&:not([data-state=active])]:text-slate-400">
              {withoutPending > 0
                ? `${withoutPending} pendente${withoutPending !== 1 ? "s" : ""} de escalação`
                : "Nenhum pendente"}
            </p>
          </div>
        </div>
      </TabsTrigger>

      <TabsTrigger
        value="with-ticket"
        disabled={withCount === 0}
        className="group relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-white hover:border-green-200 hover:bg-green-50/20 data-[state=active]:border-[#16A34A] data-[state=active]:bg-green-50/60 data-[state=active]:shadow-lg data-[state=active]:shadow-green-100 transition-all duration-200 disabled:opacity-40 text-left p-0 h-auto"
      >
        <div className="absolute top-0 inset-x-0 h-[3px] bg-[#16A34A] rounded-t-[14px] opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-200" />
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#16A34A] items-center justify-center shadow hidden group-data-[state=active]:flex">
          <Check className="w-3 h-3 text-white" strokeWidth={3.5} />
        </span>
        <div className="flex items-center gap-3.5 px-4 pt-4 pb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 group-data-[state=active]:bg-green-100 flex items-center justify-center shrink-0 transition-colors duration-200 text-[15px]">✈️</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-[14px] font-bold text-slate-800 leading-tight">Com Transporte</h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-black tabular-nums group-data-[state=active]:bg-green-100 group-data-[state=active]:text-green-700 transition-colors duration-200">
                {withCount}
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-400 leading-tight">Aéreo · Rodoviário · Van</p>
            <p className="text-[11px] font-medium text-green-500 group-[&:not([data-state=active])]:text-slate-400 leading-tight">
              {withPending > 0
                ? `${withPending} pendente${withPending !== 1 ? "s" : ""} de escalação`
                : "Todos escalados"}
            </p>
          </div>
        </div>
      </TabsTrigger>
    </TabsList>
  );
}
