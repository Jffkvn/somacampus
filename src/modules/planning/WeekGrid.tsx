import React, { useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

export interface WeekGridAssignment {
  slot: { dayOfWeek: number; periodNumber: number; startTime: string; endTime: string };
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
}

const PALETTE = [
  'bg-sky-100 border-sky-300 text-sky-950',
  'bg-emerald-100 border-emerald-300 text-emerald-950',
  'bg-violet-100 border-violet-300 text-violet-950',
  'bg-amber-100 border-amber-300 text-amber-950',
  'bg-rose-100 border-rose-300 text-rose-950',
  'bg-teal-100 border-teal-300 text-teal-950',
  'bg-indigo-100 border-indigo-300 text-indigo-950',
  'bg-orange-100 border-orange-300 text-orange-950',
];

function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const fmt = (t: string) => String(t).slice(0, 5);

export interface BellBand {
  afterPeriod: number;
  label: string;
  className: string;
}

export const DEFAULT_BANDS: BellBand[] = [
  { afterPeriod: 3, label: '☕ Break 10:15–10:45', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  { afterPeriod: 6, label: '🍽️ Lunch 13:00–14:00', className: 'bg-orange-50 text-orange-800 border-orange-200' },
];

/**
 * School-wall week grid: period rows (with times) x day columns, full-width
 * break/lunch bands, color-coded subjects. Supports compact fit-to-screen
 * density to eliminate Friday column clipping on standard laptops.
 */
export const WeekGrid: React.FC<{
  assignments: WeekGridAssignment[];
  periods: Array<{ periodNumber: number; startTime: string; endTime: string }>;
  bands?: BellBand[];
  renderActions?: (a: WeekGridAssignment, index: number) => React.ReactNode;
  defaultCompact?: boolean;
}> = ({ assignments, periods, bands = DEFAULT_BANDS, renderActions, defaultCompact = true }) => {
  const [isCompact, setIsCompact] = useState(defaultCompact);

  const byDayPeriod = new Map<string, { a: WeekGridAssignment; idx: number }>();
  assignments.forEach((a, idx) => {
    byDayPeriod.set(`${a.slot.dayOfWeek}-${a.slot.periodNumber}`, { a, idx });
  });

  const rows: React.ReactNode[] = [];
  periods.forEach((p) => {
    rows.push(
      <tr key={`p-${p.periodNumber}`} className="border-t border-slate-200">
        <th
          className={`text-left font-bold text-slate-600 bg-slate-50 whitespace-nowrap ${
            isCompact ? 'p-1.5 text-[10px] w-20' : 'p-2 text-[11px]'
          }`}
        >
          P{p.periodNumber}
          <span className="block font-normal text-slate-400 text-[9px]">
            {fmt(p.startTime)}–{fmt(p.endTime)}
          </span>
        </th>
        {[1, 2, 3, 4, 5].map((d) => {
          const hit = byDayPeriod.get(`${d}-${p.periodNumber}`);
          return (
            <td
              key={d}
              className={`border-l border-slate-100 align-top ${
                isCompact ? 'p-1 min-w-0' : 'p-1.5 min-w-[130px]'
              }`}
            >
              {hit && (
                <div
                  className={`rounded-lg border space-y-0.5 transition-all ${
                    isCompact ? 'p-1.5 text-[10px]' : 'p-2 text-[11px]'
                  } ${colorFor(hit.a.subjectName)}`}
                >
                  <p className="font-bold truncate leading-tight">{hit.a.subjectName}</p>
                  <p className="truncate opacity-80 leading-tight">{hit.a.className}</p>
                  <p className="truncate opacity-70 leading-tight text-[9px]">{hit.a.teacherName}</p>
                  {renderActions?.(hit.a, hit.idx)}
                </div>
              )}
            </td>
          );
        })}
      </tr>
    );
    for (const b of bands.filter((x) => x.afterPeriod === p.periodNumber)) {
      rows.push(
        <tr key={`band-${p.periodNumber}-${b.label}`}>
          <td
            colSpan={6}
            className={`text-center font-bold border-t border-slate-200 py-1 ${
              isCompact ? 'text-[10px]' : 'text-[11px]'
            } ${b.className}`}
          >
            {b.label}
          </td>
        </tr>
      );
    }
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">5-Day Academic Week</span>
        <button
          type="button"
          onClick={() => setIsCompact(!isCompact)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-600 transition-colors shadow-2xs"
          title={isCompact ? 'Switch to Comfortable View' : 'Switch to Compact Screen Fit'}
        >
          {isCompact ? (
            <>
              <Maximize2 className="w-3 h-3 text-slate-500" />
              <span>Comfortable View</span>
            </>
          ) : (
            <>
              <Minimize2 className="w-3 h-3 text-brand-teal" />
              <span>Fit All Days (Compact)</span>
            </>
          )}
        </button>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
        <table
          className={`w-full border-collapse bg-white ${
            isCompact ? 'table-fixed min-w-[680px]' : 'min-w-[840px]'
          }`}
        >
          <thead>
            <tr className="bg-slate-50">
              <th
                className={`text-left font-bold text-slate-500 uppercase ${
                  isCompact ? 'p-1.5 text-[10px] w-20' : 'p-2 text-[11px]'
                }`}
              >
                Period
              </th>
              {DAYS.map((d) => (
                <th
                  key={d}
                  className={`text-center font-bold text-slate-500 uppercase ${
                    isCompact ? 'p-1.5 text-[10px]' : 'p-2 text-[11px]'
                  }`}
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    </div>
  );
};
