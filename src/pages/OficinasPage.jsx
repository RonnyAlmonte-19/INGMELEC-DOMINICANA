import InventoryTable from '../components/common/InventoryTable';
import { useApp } from '../context/AppContext';

export default function OficinasPage() {
  const { kpis } = useApp();
  const totalOfi = kpis?.porArea?.OFICINAS;
  const countText = totalOfi != null ? ` (${totalOfi} registros activos)` : '';

  return (
    <InventoryTable
      fixedArea="OFICINAS"
      title="Mobiliario y Enseres de Oficinas"
      subtitle={`Bienes de instalaciones: Escritorios, Sillas operativas y de visita, Archivadores, Aires Acondicionados y Equipamiento de oficina${countText}.`}
      allowCreate={true}
    />
  );
}
