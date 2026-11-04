import React from 'react';
import InventoryTable from '../components/common/InventoryTable';

export default function InformaticaPage() {
  return (
    <InventoryTable
      fixedArea="INFORMATICA"
      title="Inventario Informático y Equipos de Comunicación"
      subtitle="Catálogo de activos tecnológicos: Laptops, Computadoras de escritorio, Monitores, Celulares, Switches, Tablets e Impresoras (84 registros iniciales)."
      allowCreate={true}
    />
  );
}
