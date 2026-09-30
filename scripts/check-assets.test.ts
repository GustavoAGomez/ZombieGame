import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAssets } from './check-assets';

describe('assets:check on the repository', () => {
  it('reports no errors for the placeholder manifest and room01', () => {
    const report = checkAssets(resolve(import.meta.dirname, '..'));
    expect(report.errors).toEqual([]);
    expect(report.info.some((line) => line.includes('maps.room01'))).toBe(true);
  });
});
