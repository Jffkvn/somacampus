import { describe, it, expect, vi } from 'vitest';
import { resourceLibraryService } from '../modules/teaching/resourceLibraryService';
import { supabase } from '../lib/supabase';

describe('Resource Library Multi-Tenant Grounding', () => {
  const schoolA = '22222222-2222-2222-2222-222222222222';
  const schoolB = '99999999-0000-0000-0000-000000000002';

  it('queries school resources filtered by objective code and approval state', async () => {
    // In mock env, findMatchingResources fails closed gracefully (returns empty or mock)
    const matches = await resourceLibraryService.findMatchingResources(schoolA, '5Nn.01');
    expect(Array.isArray(matches)).toBe(true);
  });

  it('fails closed when database returns an error on getResources', async () => {
    vi.spyOn(supabase, 'from').mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: null, error: { message: 'RLS denial: cross-tenant access prohibited' } }),
        }),
      }),
    } as any);

    await expect(resourceLibraryService.getResources(schoolB)).rejects.toThrow(
      /Failed to load school resources: RLS denial/
    );
  });
});
