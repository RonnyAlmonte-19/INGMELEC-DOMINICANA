import InventoryTable from '../components/common/InventoryTable';
import { useApp } from '../context/AppContext';

export default function InformaticaPage() {
  const { kpis } = useApp();
  const totalInfo = kpis?.porArea?.INFORMATICA;
  const countText = totalInfo != null ? ` (${totalInfo} registros activos)` : '';

  return (
    <InventoryTable
      fixedArea="INFORMATICA"
      title="Inventario Informático y Equipos de Comunicación"
      subtitle={`Catálogo de activos tecnológicos: Laptops, Computadoras de escritorio, Monitores, Celulares, Switches, Tablets e Impresoras${countText}.`}
      allowCreate={true}
    />
  );
}
