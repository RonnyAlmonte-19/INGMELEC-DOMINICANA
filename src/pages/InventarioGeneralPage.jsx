import React from 'react';
import InventoryTable from '../components/common/InventoryTable';

export default function InventarioGeneralPage({ initialFilters = {}, onNavigateBack }) {
  return (
    <InventoryTable
      fixedArea={null}
      title="Maestro General de Inventario y Activos"
      subtitle="Búsqueda unificada y conciliada sobre los 433 activos empresariales del levantamiento físico (Almacén 27 de Febrero, OPL, Mantenimiento 633 y artículos pendientes de clasificación de sede)."
      allowCreate={true}
      initialFilters={initialFilters}
      onNavigateBack={onNavigateBack}
    />
  );
}
