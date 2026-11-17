import { useState, useEffect, useRef } from 'react';
import { Calendar, X } from 'lucide-react';

// Filtro de fecha reutilizable (solo consulta). Valor: { desde: 'AAAA-MM-DD'|'', hasta: 'AAAA-MM-DD'|'' }.
export const EMPTY_DATE_RANGE = { desde: '', hasta: '' };

export function dateRangeParams(range) {
  const p = {};
  if (range?.desde) p.fecha_desde = range.desde;
  if (range?.hasta) p.fecha_hasta = range.hasta;
  return p;
}

const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export function describeDateRange(range) {
  if (!range?.desde && !range?.hasta) return '';
  if (range.desde && range.desde === range.hasta) return fmt(range.desde);
  if (range.desde && range.hasta) return `${fmt(range.desde)} – ${fmt(range.hasta)}`;
  return range.desde ? `Desde ${fmt(range.desde)}` : `Hasta ${fmt(range.hasta)}`;
}

const inputCls = 'w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none';

export default function DateRangeFilter({ value = EMPTY_DATE_RANGE, onChange, label = 'Filtrar por fecha', hint = '' }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const active = Boolean(value?.desde || value?.hasta);

  useEffect(() => { if (open) { setDraft(value); setError(''); } }, [open, value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const apply = () => {
    if (draft.desde && draft.hasta && draft.desde > draft.hasta) {
      setError('"Desde" no puede ser posterior a "Hasta".');
      return;
    }
    onChange({ desde: draft.desde || '', hasta: draft.hasta || '' });
    setOpen(false);
  };

  const clear = () => {
    setDraft(EMPTY_DATE_RANGE);
    onChange(EMPTY_DATE_RANGE);
    setOpen(false);
  };

  return (
    <div className="relative inline-flex items-center gap-2" ref={rootRef} data-testid="date-range-filter">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
          active ? 'bg-orange-50 text-[#F28524] border-orange-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
        }`}
      >
        <Calendar className="w-4 h-4" />
        {active && <span>{describeDateRange(value)}</span>}
      </button>
      {active && (
        <button type="button" onClick={clear} aria-label="Limpiar filtro de fecha" className="p-1 rounded-lg text-slate-400 hover:text-rose-600">
          <X className="w-4 h-4" />
        </button>
      )}

      {open && (
        <div role="dialog" aria-label={label} className="absolute right-0 top-full mt-2 z-40 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 space-y-3 text-xs">
          <div className="font-bold text-slate-800">{label}</div>
          {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Día exacto</label>
            <input type="date" className={inputCls} value={draft.desde && draft.desde === draft.hasta ? draft.desde : ''}
              onChange={(e) => setDraft({ desde: e.target.value, hasta: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fecha desde</label>
              <input type="date" className={inputCls} value={draft.desde} onChange={(e) => setDraft({ ...draft, desde: e.target.value })} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fecha hasta</label>
              <input type="date" className={inputCls} value={draft.hasta} onChange={(e) => setDraft({ ...draft, hasta: e.target.value })} />
            </div>
          </div>
          {error && <div role="alert" className="text-rose-700 font-semibold">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={clear} className="px-3 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50">Limpiar filtro</button>
            <button type="button" onClick={apply} className="px-4 py-2 bg-[#F28524] hover:bg-[#d87019] text-white rounded-lg font-bold shadow">Aplicar filtro</button>
          </div>
        </div>
      )}
    </div>
  );
}
