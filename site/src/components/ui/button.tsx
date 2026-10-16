/** shadcn/ui Button, in the site's tokens: carbon primary, outlined secondary, underlined ghost; one 44px height. */
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-sheet border-2 px-4 py-1 font-semibold text-base leading-tight disabled:cursor-not-allowed disabled:opacity-55',
  {
    variants: {
      variant: {
        default: 'border-ink bg-ink text-on-ink hover:bg-ink-hover',
        secondary: 'border-ink bg-transparent text-ink hover:bg-ink-wash',
        ghost: 'border-transparent bg-transparent text-ink underline underline-offset-4 hover:bg-ink-wash',
        chip: 'rounded-full border-ink bg-transparent px-3 text-left text-ink text-sm hover:bg-ink hover:text-on-ink',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Button({
  className,
  variant,
  asChild = false,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" type={asChild ? undefined : type} className={cn(buttonVariants({ variant, className }))} {...props} />;
}
