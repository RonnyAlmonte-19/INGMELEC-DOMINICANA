import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import IngmelecLogo from '../common/IngmelecLogo';
import { useApp } from '../../context/AppContext';
const ACTA_CSS = `
/* v2.2 Actas — estilos aislados (solo clases .acta-*; no afecta estilos globales). */
.acta-doc { width: 100%; max-width: 8.5in; margin: 0 auto; background: #fff; color: #0f172a; padding: 0.5in; box-sizing: border-box; position: relative; font-size: 12px; }
.acta-doc table { width: 100%; border-collapse: collapse; }
.acta-doc th, .acta-doc td { border: 1px solid #94a3b8; padding: 5px 7px; text-align: left; vertical-align: top; }
.acta-doc th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
.acta-firmas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; margin-top: 70px; }
.acta-firma { border-top: 1.5px solid #0f172a; padding-top: 6px; text-align: center; font-size: 11px; }
.acta-marca-anulada { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 96px; font-weight: 900; color: rgba(220, 38, 38, .18); transform: rotate(-24deg); pointer-events: none; }

@media print {
  @page { size: letter; margin: 10mm; }
  #root { display: none !important; }
  .acta-print-overlay { position: static !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
  .acta-no-print { display: none !important; }
  .acta-doc { padding: 0; max-width: none; box-shadow: none !important; }
  .acta-doc tr, .acta-firmas { break-inside: avoid; }
}
`;

const fmtFecha = (v) => (v ? new Date(v).toLocaleString('es-DO') : '—');

export default function ActaImprimible({ acta, onClose }) {
  const { registrarImpresionActa } = useApp();
  if (!acta) return null;
  const anulada = acta.estado === 'ANULADA';

  const imprimir = async () => {
    await registrarImpresionActa(acta.id);
    window.print();
  };

  return createPortal(
    <div className="acta-print-overlay fixed inset-0 z-[60] bg-slate-900/70 overflow-y-auto p-4">
      <style>{ACTA_CSS}</style>
      <div className="acta-no-print max-w-[8.5in] mx-auto mb-3 flex justify-end gap-2">
        <button type="button" onClick={imprimir} className="px-4 py-2 bg-[#F28524] hover:bg-[#d87019] text-white rounded-xl text-xs font-bold shadow flex items-center gap-2">
          <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
        </button>
        <button type="button" onClick={onClose} aria-label="Cerrar vista del acta" className="px-3 py-2 bg-white text-slate-700 rounded-xl text-xs font-bold shadow flex items-center gap-1">
          <X className="w-4 h-4" /> Cerrar
        </button>
      </div>

      <article className="acta-doc shadow-2xl">
        {anulada && <div className="acta-marca-anulada">ANULADA</div>}
        <div className="acta-encabezado" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #F28524', paddingBottom: 10, marginBottom: 14 }}>
          <IngmelecLogo className="h-12" />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>ACTA DE ENTREGA DE HERRAMIENTAS</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F28524' }}>N.º {acta.numero_acta}</div>
            <div style={{ fontSize: 11 }}>Fecha: {fmtFecha(acta.fecha_entrega)}</div>
          </div>
        </div>

        <table style={{ marginBottom: 14 }}>
          <tbody>
            <tr><th style={{ width: '20%' }}>Colaborador</th><td style={{ width: '30%' }}>{acta.colaborador_nombre}</td><th style={{ width: '20%' }}>Departamento</th><td>{acta.departamento || '—'}</td></tr>
            <tr><th>Campamento</th><td>{acta.campamento_nombre}</td><th>Supervisor / Coordinador</th><td>{acta.supervisor_nombre}</td></tr>
            <tr><th>Entrega</th><td>{acta.entregado_por_nombre}</td><th>Motivo</th><td>{acta.motivo}</td></tr>
          </tbody>
        </table>

        <table>
          <thead>
            <tr><th style={{ width: 28 }}>#</th><th>Código</th><th>Descripción de la herramienta</th><th>N.º de serie</th><th>Unidad</th><th style={{ textAlign: 'right' }}>Cant.</th></tr>
          </thead>
          <tbody>
            {(acta.items || []).map((it, i) => (
              <tr key={it.id || i}>
                <td>{i + 1}</td><td>{it.codigo || 'S/C'}</td><td>{it.descripcion}</td><td>{it.serie || '—'}</td><td>{it.unidad || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{Number(it.cantidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {acta.observaciones && <p style={{ marginTop: 10 }}><strong>Observaciones:</strong> {acta.observaciones}</p>}
        <p style={{ marginTop: 14, fontSize: 11, textAlign: 'justify' }}>
          El colaborador declara haber recibido las herramientas descritas en buen estado y se compromete a su cuidado, uso
          exclusivo para labores de la empresa y devolución cuando le sea requerida. Cualquier pérdida o daño deberá ser reportado de inmediato.
        </p>
        {anulada && (
          <p style={{ marginTop: 10, color: '#b91c1c', fontWeight: 700, fontSize: 11 }}>
            ACTA ANULADA el {fmtFecha(acta.anulado_en)} por {acta.anulado_por_nombre}. Motivo: {acta.motivo_anulacion}. La anulación es documental: no devuelve existencias.
          </p>
        )}

        <div className="acta-firmas">
          <div className="acta-firma"><strong>Quien entrega</strong><br />{acta.entregado_por_nombre}</div>
          <div className="acta-firma"><strong>Quien recibe</strong><br />{acta.colaborador_nombre}</div>
          <div className="acta-firma"><strong>Supervisor / Coordinador</strong><br />{acta.supervisor_nombre}</div>
        </div>
      </article>
    </div>,
    document.body
  );
}



