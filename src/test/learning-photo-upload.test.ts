import { describe, it, expect } from 'vitest';
import {
  assertPhotoAcceptable,
  formatBytes,
  MAX_PHOTOS_PER_SUBMISSION,
  MAX_PHOTO_BYTES,
} from '../modules/learning/photoUpload';

describe('Digital Learning Spine — photo-first upload helpers (M4 UI)', () => {
  it('formats compressed sizes for the upload chip', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatBytes(-1)).toBe('—');
  });

  it('rejects non-images and empty files (fail closed)', () => {
    expect(() => assertPhotoAcceptable({ type: 'application/pdf', size: 10 })).toThrow(/photo/i);
    expect(() => assertPhotoAcceptable({ type: 'image/jpeg', size: 0 })).toThrow(/empty/i);
  });

  it('rejects oversized originals and over-cap queues', () => {
    expect(() =>
      assertPhotoAcceptable({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 }),
    ).toThrow(/too large/i);
    expect(() =>
      assertPhotoAcceptable({ type: 'image/jpeg', size: 100 }, MAX_PHOTOS_PER_SUBMISSION),
    ).toThrow(/up to/i);
  });

  it('accepts a normal phone photo', () => {
    expect(() => assertPhotoAcceptable({ type: 'image/jpeg', size: 2_000_000 }, 0)).not.toThrow();
  });
});
