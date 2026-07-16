import { describe, expect, it } from 'vitest';
import { categoryLabel } from './api';

describe('categoryLabel', () => {
  it('formats API memory categories for the interface', () => {
    expect(categoryLabel('long_term')).toBe('Long-term');
    expect(categoryLabel('medical')).toBe('Medical');
  });
});

