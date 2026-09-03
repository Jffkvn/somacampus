import React from 'react';
import { cn } from '../../lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
    isPositive?: boolean;
  };
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  href?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  trend,
  icon: Icon,
  iconColor = 'text-brand-teal',
  href,
  className,
}) => {
  const content = (
    <div
      className={cn(
        'p-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm transition-all duration-150',
        href && 'hover:shadow-md hover:border-slate-300 group cursor-pointer',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {Icon && (
          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
            <Icon className={cn('w-4 h-4', iconColor)} />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          {value}
        </div>
        {trend && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
              trend.direction === 'up'
                ? trend.isPositive !== false
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-red-700 bg-red-50'
                : trend.direction === 'down'
                ? trend.isPositive !== false
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-red-700 bg-red-50'
                : 'text-slate-600 bg-slate-100'
            )}
          >
            {trend.direction === 'up' && <TrendingUp className="w-3 h-3" />}
            {trend.direction === 'down' && <TrendingDown className="w-3 h-3" />}
            {trend.direction === 'neutral' && <Minus className="w-3 h-3" />}
            <span>{trend.value}</span>
          </div>
        )}
      </div>

      {subValue && (
        <p className="mt-1 text-xs text-slate-500">
          {subValue}
        </p>
      )}
    </div>
  );

  if (href) {
    return <Link to={href} className="block no-underline">{content}</Link>;
  }

  return content;
};
