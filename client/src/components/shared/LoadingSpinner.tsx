import { cn } from '@/lib/utils';

export function LoadingSpinner({ className, size }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-12 w-12' : 'h-8 w-8';
  const wrap = size === 'sm' ? '' : 'flex items-center justify-center py-12';
  return (
    <div className={cn(wrap, className)}>
      <div className={cn('animate-spin rounded-full border-4 border-border border-t-primary', dim)} />
    </div>
  );
}
