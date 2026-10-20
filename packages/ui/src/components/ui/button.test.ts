import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button';

describe('buttonVariants', () => {
  it('uses the DS 02 primary action treatment by default', () => {
    const className = buttonVariants();

    expect(className).toContain('rounded-none');
    expect(className).toContain('font-extrabold');
    expect(className).toContain('bg-primary');
    expect(className).toContain('text-primary-foreground');
    expect(className).toContain('h-[42px]');
    expect(className).toContain('px-[18px]');
  });

  it('uses a strong secondary outline treatment', () => {
    const className = buttonVariants({ variant: 'outline' });

    expect(className).toContain('rounded-none');
    expect(className).toContain('border-primary');
    expect(className).toContain('text-primary');
    expect(className).not.toContain('bg-card');
  });

  it('keeps ghost buttons as low-weight row actions', () => {
    const className = buttonVariants({ variant: 'ghost', size: 'sm' });

    expect(className).toContain('h-9');
    expect(className).toContain('bg-transparent');
    expect(className).toContain('text-[#17615D]');
    expect(className).toContain('hover:underline');
  });
});
