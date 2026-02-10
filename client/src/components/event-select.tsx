import { Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Event } from "@shared/schema";

interface EventSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  events: Event[] | undefined;
  className?: string;
}

export function EventSelect({ value, onValueChange, events, className }: EventSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={`h-11 min-w-[280px] px-3.5 text-[15px] rounded-lg border-gray-300 dark:border-gray-600 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 transition-colors ${className ?? ""}`}
      >
        <Calendar className="w-4.5 h-4.5 text-gray-400 dark:text-gray-500 mr-2.5 shrink-0" />
        <SelectValue placeholder="Selecionar evento" />
      </SelectTrigger>
      <SelectContent className="rounded-lg shadow-lg border-gray-200 dark:border-gray-700">
        {events?.map((event, index) => (
          <TooltipProvider key={event.id} delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  {index > 0 && (
                    <div className="mx-2 h-px bg-gray-100 dark:bg-gray-800" />
                  )}
                  <SelectItem
                    value={event.id}
                    className="py-2.5 px-3 pl-8 text-[14px] rounded-md cursor-pointer data-[state=checked]:bg-blue-50 dark:data-[state=checked]:bg-blue-950/30 data-[state=checked]:text-blue-700 dark:data-[state=checked]:text-blue-300 data-[state=checked]:font-semibold focus:bg-gray-50 dark:focus:bg-gray-800"
                  >
                    <span className="truncate block max-w-[260px]">{event.name}</span>
                  </SelectItem>
                </div>
              </TooltipTrigger>
              {event.name.length > 35 && (
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-sm">{event.name}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        ))}
      </SelectContent>
    </Select>
  );
}

export function EventSelectCTA({
  value,
  onValueChange,
  events,
  accentColor = "blue",
}: EventSelectProps & { accentColor?: "blue" | "purple" | "emerald" }) {
  const colorMap = {
    blue: {
      border: "border-blue-300 dark:border-blue-700 hover:border-blue-400",
      icon: "text-blue-500",
      checked: "data-[state=checked]:bg-blue-50 dark:data-[state=checked]:bg-blue-950/30 data-[state=checked]:text-blue-700 dark:data-[state=checked]:text-blue-300",
    },
    purple: {
      border: "border-purple-300 dark:border-purple-700 hover:border-purple-400",
      icon: "text-purple-500",
      checked: "data-[state=checked]:bg-purple-50 dark:data-[state=checked]:bg-purple-950/30 data-[state=checked]:text-purple-700 dark:data-[state=checked]:text-purple-300",
    },
    emerald: {
      border: "border-emerald-300 dark:border-emerald-700 hover:border-emerald-400",
      icon: "text-emerald-500",
      checked: "data-[state=checked]:bg-emerald-50 dark:data-[state=checked]:bg-emerald-950/30 data-[state=checked]:text-emerald-700 dark:data-[state=checked]:text-emerald-300",
    },
  };

  const colors = colorMap[accentColor];

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={`w-72 h-11 px-3.5 text-[15px] mx-auto bg-white dark:bg-gray-800 ${colors.border} rounded-lg shadow-sm transition-colors`}
      >
        <Calendar className={`w-4.5 h-4.5 ${colors.icon} mr-2.5 shrink-0`} />
        <SelectValue placeholder="Selecionar evento" />
      </SelectTrigger>
      <SelectContent className="rounded-lg shadow-lg border-gray-200 dark:border-gray-700">
        {events?.map((event, index) => (
          <TooltipProvider key={event.id} delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  {index > 0 && (
                    <div className="mx-2 h-px bg-gray-100 dark:bg-gray-800" />
                  )}
                  <SelectItem
                    value={event.id}
                    className={`py-2.5 px-3 pl-8 text-[14px] rounded-md cursor-pointer ${colors.checked} data-[state=checked]:font-semibold focus:bg-gray-50 dark:focus:bg-gray-800`}
                  >
                    <span className="truncate block max-w-[260px]">{event.name}</span>
                  </SelectItem>
                </div>
              </TooltipTrigger>
              {event.name.length > 35 && (
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-sm">{event.name}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        ))}
      </SelectContent>
    </Select>
  );
}
