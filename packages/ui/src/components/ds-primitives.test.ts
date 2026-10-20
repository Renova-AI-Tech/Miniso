import { describe, expect, it } from 'vitest';
import { emptyStateVariants } from './empty-state';
import { successStateVariants } from './feedback-state';
import {
  compactFieldControlClassName,
  fieldControlClassName,
  selectClassName,
  textAreaClassName,
} from './form-controls';
import { statusBadgeVariants } from './status-badge';
import { inputVariants } from './ui/input';
import { labelVariants } from './ui/label';

describe('DS primitive contracts', () => {
  it('keeps form controls aligned to the DS field treatment', () => {
    const inputClassName = inputVariants();

    expect(inputClassName).toContain('min-h-[46px]');
    expect(inputClassName).toContain('rounded-none');
    expect(inputClassName).toContain('border');
    expect(inputClassName).toContain('border-border');
    expect(inputClassName).toContain('bg-card');
    expect(inputClassName).toContain('px-[14px]');
    expect(inputClassName).toContain('focus-visible:ring-2');
    expect(inputClassName).toContain('disabled:bg-muted');
    expect(fieldControlClassName).toContain('min-h-[46px]');
    expect(selectClassName).toBe(fieldControlClassName);
    expect(textAreaClassName).toContain('min-h-24');
    expect(textAreaClassName).toContain('rounded-none');
    expect(compactFieldControlClassName).toContain('h-8');
    expect(compactFieldControlClassName).toContain('rounded-none');
    expect(compactFieldControlClassName).toContain('bg-muted');
    expect(compactFieldControlClassName).toContain('text-xs');
  });

  it('uses operational label typography for field labels', () => {
    const captionClassName = labelVariants({ variant: 'caption' });

    expect(captionClassName).toContain('text-[13px]');
    expect(captionClassName).toContain('font-extrabold');
    expect(captionClassName).toContain('normal-case');
    expect(captionClassName).toContain('tracking-normal');
    expect(captionClassName).toContain('text-primary');
  });

  it('maps status badges to DS state surfaces', () => {
    const accentClassName = statusBadgeVariants({ tone: 'accent' });
    const warningClassName = statusBadgeVariants({ tone: 'warning' });
    const neutralClassName = statusBadgeVariants({ tone: 'neutral' });

    expect(accentClassName).toContain('min-h-8');
    expect(accentClassName).toContain('rounded-none');
    expect(accentClassName).toContain('bg-accent/10');
    expect(accentClassName).toContain('text-[#17615D]');
    expect(warningClassName).toContain('bg-[#FFF8EA]');
    expect(warningClassName).toContain('text-[#7A4D00]');
    expect(neutralClassName).toContain('bg-muted');
    expect(neutralClassName).toContain('text-muted-foreground');
  });

  it('uses DS feedback surfaces for empty and success states', () => {
    const emptyClassName = emptyStateVariants();
    const successClassName = successStateVariants();

    expect(emptyClassName).toContain('rounded-none');
    expect(emptyClassName).toContain('border-dashed');
    expect(emptyClassName).toContain('px-[22px]');
    expect(emptyClassName).toContain('py-[22px]');
    expect(successClassName).toContain('rounded-none');
    expect(successClassName).toContain('border-accent');
    expect(successClassName).toContain('bg-accent/10');
  });
});
