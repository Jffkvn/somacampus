/**
 * P1 Catch-up panel — provider recordings as learning artifacts
 * (charter §12). External URL playback only; no native video pipeline.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { AlertCircle, PlayCircle, ExternalLink } from 'lucide-react';
import {
  sessionRecordingService,
  type CatchUpItem,
} from './sessionRecordingService';

export interface CatchUpPanelProps {
  schoolId: string;
  studentKey: string;
}

function fmtDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const CatchUpPanel: React.FC<CatchUpPanelProps> = ({ schoolId, studentKey }) => {
  const [items, setItems] = useState<CatchUpItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const list = await sessionRecordingService.listCatchUpForStudent(studentKey, schoolId);
        if (!cancelled) setItems(list);
      } catch (err: any) {
        console.error('Catch-up panel failed:', err);
        if (!cancelled) {
          setError('We could not load session catch-up right now. Please try again later.');
          setItems([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId, studentKey]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-brand-teal" /> Session catch-up
            </span>
          </CardTitle>
          <CardDescription>
            Recordings from your live sessions (hosted by the meeting provider). Watch any time — catch-up is learning work, not a video library.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading catch-up…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-400">
            No recordings yet. They appear here after a teacher publishes a session recording.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.recordingId} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                  <p className="text-xs text-slate-400">
                    {item.provider}
                    {fmtDuration(item.durationSeconds) ? ` · ${fmtDuration(item.durationSeconds)}` : ''}
                    {item.startedAt ? ` · ${String(item.startedAt).slice(0, 10)}` : ''}
                    {item.catchUpActivityId ? ' · linked activity' : ''}
                  </p>
                  {item.sessionNote && (
                    <p className="text-xs text-slate-500 mt-1">{item.sessionNote}</p>
                  )}
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-teal hover:underline shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Watch
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
