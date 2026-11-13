import InventoryTable from '../components/common/InventoryTable';
import { useApp } from '../context/AppContext';

export default function AlmacenPage() {
  const { kpis } = useApp();
  const totalAlmacen = kpis?.porArea?.ALMACEN;
  const countText = totalAlmacen != null ? ` (${totalAlmacen} registros activos)` : '';

  return (
    <InventoryTable
      fixedArea="ALMACEN"
      title="Almacén Central y Parque de Herramientas"
      subtitle={`Control integral de herramientas eléctricas, EPP, EPC, materiales de alta tensión, instrumentos de medición y suministros industriales${countText}.`}
      allowCreate={true}
    />
  );
}
