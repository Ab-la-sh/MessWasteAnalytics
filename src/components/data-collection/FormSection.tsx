import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export function FormSection({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('animate-slide-up', className)}>
      <div className="flex items-center gap-3 border-b border-navy-100 px-5 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <Icon className="h-[17px] w-[17px] text-brand-600" />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold text-navy-900">{title}</h3>
          {description && <p className="text-[12.5px] text-navy-500">{description}</p>}
        </div>
      </div>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</CardContent>
    </Card>
  );
}

export function FormField({
  label,
  hint,
  colSpan,
  children,
}: {
  label: string;
  hint?: string;
  colSpan?: 'full' | 'half';
  children: React.ReactNode;
}) {
  return (
    <div className={cn(colSpan === 'full' && 'sm:col-span-2 lg:col-span-3', colSpan === 'half' && 'lg:col-span-2')}>
      <label className="mb-1.5 block text-[13px] font-medium text-navy-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] text-navy-400">{hint}</p>}
    </div>
  );
}
