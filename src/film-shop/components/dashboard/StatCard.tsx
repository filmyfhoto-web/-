import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'accent' | 'success' | 'warning';
  onClick?: () => void;
  badge?: { count: number; variant?: 'default' | 'destructive' | 'secondary' };
}

const variantStyles = {
  default: 'bg-card border-border',
  primary: 'bg-primary/5 border-primary/20',
  accent: 'bg-accent/10 border-accent/20',
  success: 'bg-success/10 border-success/20',
  warning: 'bg-warning/10 border-warning/20',
};

const iconStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-accent/20 text-accent',
  success: 'bg-success/20 text-success',
  warning: 'bg-warning/20 text-warning',
};

export function StatCard({ title, value, subtitle, icon: Icon, trend, variant = 'default', onClick, badge }: StatCardProps) {
  return (
    <div 
      className={cn(
        'rounded-xl border p-3 md:p-6 shadow-card transition-all duration-300 hover:shadow-card-hover animate-scale-in relative',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
      )}
      onClick={onClick}
    >
      {badge && badge.count > 0 && (
        <Badge 
          variant={badge.variant || 'destructive'} 
          className="absolute top-2 right-2 text-xs"
        >
          {badge.count}
        </Badge>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">{title}</p>
          <p className="mt-1 md:mt-2 text-lg md:text-3xl font-bold text-foreground truncate">{value}</p>
          {subtitle && (
            <p className="mt-0.5 md:mt-1 text-[10px] md:text-sm text-muted-foreground truncate">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'mt-1 md:mt-2 text-xs md:text-sm font-medium',
              trend.isPositive ? 'text-success' : 'text-destructive'
            )}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={cn('rounded-lg p-2 md:p-3 shrink-0', iconStyles[variant])}>
          <Icon className="h-4 w-4 md:h-6 md:w-6" />
        </div>
      </div>
    </div>
  );
}
