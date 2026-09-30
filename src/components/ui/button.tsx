import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

const variants = {
  primary: 'flex min-h-[54px] w-full items-center justify-center gap-[35px] border border-primary-border bg-primary px-[23px] py-0 text-[11px] font-bold tracking-[1.6px] text-primary-foreground [transition:background_.15s,transform_.15s] hover:bg-primary-hover hover:[transform:translateY(-1px)]',
  secondary: 'mt-3 block min-h-12 w-full border border-button-border bg-transparent text-[11px] font-semibold tracking-[1.6px] hover:bg-accent',
  menu: 'mt-3 block min-h-[54px] w-[320px] max-w-full border border-button-border bg-[#17241e80] text-[11px] font-semibold tracking-[1.6px] text-secondary-foreground hover:bg-accent min-[1600px]:min-h-[60px] min-[1600px]:w-[360px]',
  link: 'mt-[25px] border-0 border-b border-solid border-[#abb59450] bg-transparent p-0 pb-[5px] text-[11px] text-[#bdc5af]',
  quality: 'min-h-11 flex-1 rounded-[3px] border border-[#a5b58d50] bg-secondary text-[12px] aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:border-[#dce7c3] aria-pressed:hover:border-[#dce7c3]',
} as const;

type ButtonProps = ComponentProps<'button'> & { variant?: keyof typeof variants };

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return <button data-slot="button" className={cn(variants[variant], className)} {...props} />;
}
