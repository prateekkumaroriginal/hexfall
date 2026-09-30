import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function PanelOverlay({ className, ...props }: ComponentProps<'section'>) {
  return <section data-slot="panel-overlay" className={cn('absolute inset-0 z-5 flex items-center justify-center overflow-y-auto bg-[#0c1812ad] p-[30px] backdrop-blur-[8px] compact:p-[15px]', className)} {...props} />;
}

export function PanelContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="panel-content" className={cn('relative w-[min(560px,100%)] border border-border bg-card p-11 shadow-[0_30px_100px_#0005] compact:px-[23px] compact:py-[30px] [&_p]:text-[12px] [&_p]:leading-[1.8] [&_p]:text-muted-foreground', className)} {...props} />;
}

export function PanelTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 data-slot="panel-title" className={cn('my-5 font-display text-[43px] leading-[1.1] font-medium compact:text-[35px]', className)} {...props} />;
}
