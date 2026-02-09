import { useState, useRef, useEffect } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

export function Tooltip({ children, content, side = 'top', delayDuration = 300 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Close on outside tap
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: PointerEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [open]);

  if (!content) return <>{children}</>;

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger asChild>
          <div
            ref={triggerRef}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
            className="inline-flex"
          >
            {children}
          </div>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={4}
            className={cn(
              'z-50 max-w-xs rounded-lg px-3 py-2 text-sm',
              'bg-gray-900 text-white dark:bg-white dark:text-gray-900',
              'shadow-lg',
              'animate-in fade-in-0 zoom-in-95',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-gray-900 dark:fill-white" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  );
}
