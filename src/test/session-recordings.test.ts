import { describe, it, expect, vi } from 'vitest';
import {
  validateIngestRecording,
  sessionRecordingService,
} from '../modules/online/sessionRecordingService';

describe('Digital Learning Spine — provider recording → catch-up (P1)', () => {
  it('requires an http(s) provider URL (external storage OK, no fake media)', () => {
    expect(() =>
      validateIngestRecording({
        schoolId: 's1',
        sessionId: 'ses-1',
        provider: 'zoom',
        url: 'not-a-url',
      }),
    ).toThrow(/url/i);

    expect(() =>
      validateIngestRecording({
        schoolId: 's1',
        sessionId: 'ses-1',
        provider: 'zoom',
        url: 'https://zoom.example/rec/abc',
      }),
    ).not.toThrow();
  });

  it('rejects unknown providers and negative duration', () => {
    expect(() =>
      validateIngestRecording({
        schoolId: 's1',
        sessionId: 'ses-1',
        provider: 'skype' as any,
        url: 'https://example.com/r',
      }),
    ).toThrow(/provider/i);

    expect(() =>
      validateIngestRecording({
        schoolId: 's1',
        sessionId: 'ses-1',
        provider: 'meet',
        url: 'https://meet.example/r',
        durationSeconds: -5,
      }),
    ).toThrow(/duration/i);
  });

  it('rejects endedAt before startedAt', () => {
    expect(() =>
      validateIngestRecording({
        schoolId: 's1',
        sessionId: 'ses-1',
        provider: 'custom',
        url: 'https://example.com/r',
        startedAt: '2026-09-22T10:00:00Z',
        endedAt: '2026-09-22T09:00:00Z',
      }),
    ).toThrow(/endedAt/i);
  });

  it('mock env returns honest empty catch-up (never fake recordings)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const list = await sessionRecordingService.listCatchUpForStudent('a@b.c', 's1');
    expect(list).toEqual([]);
  });
});
