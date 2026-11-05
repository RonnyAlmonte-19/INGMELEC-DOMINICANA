import React from 'react';
import { UtensilsCrossed, FlaskConical } from 'lucide-react';
import InventoryTable from '../components/common/InventoryTable';

export default function CocinaPage() {
  return (
    <div className="space-y-4">
      {/* Notice Banner (Tarea 8: Módulo Cocina Conciliado) */}
      <div className="bg-pink-50/80 border border-pink-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs text-pink-950">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-pink-100 text-pink-700 rounded-xl mt-0.5 flex-shrink-0">
            <UtensilsCrossed className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-pink-900 text-sm">
              Módulo de Cocina y Comedor · Conciliación Documental (0 Registros Históricos Reales)
            </h4>
            <p className="text-pink-800 leading-relaxed">
              <span className="font-semibold">Estado Real del Levantamiento (16 de Octubre de 2026):</span> La hoja <span className="font-mono font-semibold">03 | COCINA</span> del Excel oficial contiene únicamente 10 filas de plantilla vacías (<strong>0 bienes registrados</strong>).
              Los 2 registros de prueba creados durante validaciones automatizadas (<span className="font-mono font-semibold">COC-001</span> y <span className="font-mono font-semibold">COC-002 · Horno Microondas Industrial Panasonic</span>) han sido clasificados y aislados como <strong>registros sintéticos de prueba (<span className="font-mono">es_sintetico = 1</span>)</strong> para no contaminar las estadísticas empresariales.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-pink-200 rounded-xl text-[11px] font-bold text-pink-800 whitespace-nowrap self-start">
          <FlaskConical className="w-3.5 h-3.5 text-pink-600" />
          <span>0 Reales · 2 Sintéticos Aislados</span>
        </div>
      </div>

      <InventoryTable
        fixedArea="COCINA"
        title="Cocina y Comedor"
        subtitle="Control empresarial de electrodomésticos, dispensadores de agua, cafeteras y mobiliario de comedor (Disponible para nuevos registros reales)."
        allowCreate={true}
        defaultEmptyMessage="0 activos empresariales registrados en Cocina (conforme al levantamiento documental del 16 de octubre de 2026). Utiliza '+ Registrar Bien' para incorporar activos reales de cocina."
      />
    </div>
  );
}
