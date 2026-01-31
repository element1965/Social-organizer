import { cn } from '../../lib/utils';
import { User } from 'lucide-react';

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-16 h-16 text-lg' };
  if (src) {
    return <img src={src} alt={name || ''} className={cn('rounded-full object-cover', sizes[size], className)} />;
  }
  return (
    <div className={cn('rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400', sizes[size], className)}>
      {name ? name[0]?.toUpperCase() : <User className="w-1/2 h-1/2" />}
    </div>
  );
}
