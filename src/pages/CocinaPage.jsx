import { UtensilsCrossed, FlaskConical } from 'lucide-react';
import InventoryTable from '../components/common/InventoryTable';
import { useApp } from '../context/AppContext';

export default function CocinaPage() {
  const { kpis } = useApp();
  const realCocina = Number(kpis?.porArea?.COCINA ?? 0);
  const sintTotal = Number(kpis?.resumenSinteticos?.articulos ?? 0);

  return (
    <div className="space-y-4">
      <div className="bg-pink-50/80 border border-pink-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs text-pink-950">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-pink-100 text-pink-700 rounded-xl mt-0.5 flex-shrink-0">
            <UtensilsCrossed className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-pink-900 text-sm">
              Módulo de Cocina y Comedor · Control en Tiempo Real ({realCocina} Activos Operativos)
            </h4>
            <p className="text-pink-800 leading-relaxed">
              Los registros reales activos del área <span className="font-mono font-semibold">COCINA</span> se consultan directamente en MySQL separando cualquier registro sintético de pruebas (<span className="font-mono font-semibold">es_sintetico = 1</span>) para no alterar los totales empresariales.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-pink-200 rounded-xl text-[11px] font-bold text-pink-800 whitespace-nowrap self-start">
          <FlaskConical className="w-3.5 h-3.5 text-pink-600" />
          <span>{realCocina} Operativos · {sintTotal} Sintéticos Aislados</span>
        </div>
      </div>

      <InventoryTable
        fixedArea="COCINA"
        title="Cocina y Comedor"
        subtitle="Control empresarial de electrodomésticos, dispensadores de agua, cafeteras y mobiliario de comedor (Disponible para nuevos registros reales)."
        allowCreate={true}
        defaultEmptyMessage="No se registran activos operativos actuales en Cocina con los filtros aplicados. Utiliza '+ Registrar Bien' para incorporar activos reales de cocina."
      />
    </div>
  );
}
