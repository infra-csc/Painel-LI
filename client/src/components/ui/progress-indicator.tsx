import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";

interface ProgressIndicatorProps {
  completed: number;
  total: number;
  status?: string;
  className?: string;
}

export function ProgressIndicator({ completed, total, status, className = "" }: ProgressIndicatorProps) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  
  const getStatusColor = () => {
    if (percentage === 100) return "text-green-600";
    if (percentage >= 50) return "text-yellow-600"; 
    return "text-red-600";
  };
  
  const getStatusIcon = () => {
    if (percentage === 100) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (percentage >= 50) return <Clock className="w-4 h-4 text-yellow-600" />;
    return <AlertCircle className="w-4 h-4 text-red-600" />;
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {getStatusIcon()}
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className={`font-medium ${getStatusColor()}`}>
            {completed}/{total} campos
          </span>
          <span className={`${getStatusColor()}`}>
            {Math.round(percentage)}%
          </span>
        </div>
        <Progress 
          value={percentage} 
          className="h-2"
          data-testid="progress-indicator"
        />
      </div>
    </div>
  );
}