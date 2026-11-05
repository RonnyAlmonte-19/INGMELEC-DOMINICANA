import React from 'react';
import InventoryTable from '../components/common/InventoryTable';

export default function AlmacenPage() {
  return (
    <InventoryTable
      fixedArea="ALMACEN"
      title="Almacén Central y Parque de Herramientas"
      subtitle="Control integral de herramientas eléctricas, EPP, EPC, materiales de alta tensión, instrumentos de medición y suministros industriales (261 registros iniciales)."
      allowCreate={true}
    />
  );
}
