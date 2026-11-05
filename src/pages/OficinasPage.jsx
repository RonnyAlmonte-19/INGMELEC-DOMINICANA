import React from 'react';
import InventoryTable from '../components/common/InventoryTable';

export default function OficinasPage() {
  return (
    <InventoryTable
      fixedArea="OFICINAS"
      title="Mobiliario y Enseres de Oficinas"
      subtitle="Bienes de instalaciones: Escritorios, Sillas operativas y de visita, Archivadores, Aires Acondicionados y Equipamiento de oficina (69 registros iniciales)."
      allowCreate={true}
    />
  );
}
