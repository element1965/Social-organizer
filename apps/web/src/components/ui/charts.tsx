import { cn } from '../../lib/utils';

interface DonutChartProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  label?: string;
  sublabel?: string;
  className?: string;
}

export function DonutChart({
  value,
  max,
  size = 120,
  strokeWidth = 12,
  color = '#3b82f6',
  bgColor = '#e5e7eb',
  label,
  sublabel,
  className,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - percentage);

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
          className="dark:stroke-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="text-lg font-bold text-gray-900 dark:text-white">{label}</span>}
        {sublabel && <span className="text-xs text-gray-500">{sublabel}</span>}
      </div>
    </div>
  );
}

interface SemiDonutChartProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  label?: string;
  sublabel?: string;
  className?: string;
}

export function SemiDonutChart({
  value,
  max,
  size = 140,
  strokeWidth = 14,
  color = '#10b981',
  bgColor = '#e5e7eb',
  label,
  sublabel,
  className,
}: SemiDonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // Half circle
  const percentage = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - percentage);

  return (
    <div className={cn('relative inline-flex flex-col items-center', className)}>
      <svg width={size} height={size / 2 + strokeWidth} className="overflow-visible">
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="dark:stroke-gray-700"
        />
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center">
        {label && <span className="text-xl font-bold text-gray-900 dark:text-white">{label}</span>}
        {sublabel && <span className="text-xs text-gray-500">{sublabel}</span>}
      </div>
    </div>
  );
}

interface BarChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  maxValue?: number;
  height?: number;
  className?: string;
}

export function BarChart({ data, maxValue, height = 100, className }: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={cn('flex items-end gap-2', className)} style={{ height }}>
      {data.map((item, i) => {
        const barHeight = (item.value / max) * height;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs font-medium text-gray-900 dark:text-white">{item.value}</span>
            <div
              className="w-full rounded-t transition-all duration-500"
              style={{
                height: Math.max(barHeight, 4),
                backgroundColor: item.color || '#3b82f6',
              }}
            />
            <span className="text-[10px] text-gray-500 truncate max-w-full">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  className?: string;
}

export function StatCard({ label, value, sublabel, icon, trend, className }: StatCardProps) {
  return (
    <div className={cn('p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
          {trend && (
            <p className={cn('text-xs mt-1', trend.isPositive ? 'text-green-600' : 'text-red-500')}>
              {trend.isPositive ? '+' : ''}{trend.value}
            </p>
          )}
        </div>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
    </div>
  );
}

interface TabsProps {
  tabs: Array<{ id: string; label: string; icon?: React.ReactNode }>;
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === tab.id
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          )}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
