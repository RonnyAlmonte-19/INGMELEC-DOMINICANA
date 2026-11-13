import InventoryTable from '../components/common/InventoryTable';
import { useApp } from '../context/AppContext';

export default function InventarioGeneralPage({ initialFilters = {}, onNavigateBack }) {
  const { kpis } = useApp();
  const totalCount = kpis?.totalArticulos;
  const totalText = totalCount != null ? `${totalCount} activos empresariales activos` : 'todos los activos empresariales activos';

  return (
    <InventoryTable
      fixedArea={null}
      title="Maestro General de Inventario y Activos"
      subtitle={`Búsqueda unificada y conciliada en tiempo real sobre ${totalText} de las sedes registradas y registros pendientes de clasificación.`}
      allowCreate={true}
      initialFilters={initialFilters}
      onNavigateBack={onNavigateBack}
    />
  );
}
