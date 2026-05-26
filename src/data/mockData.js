// Seed data for GridOps Enterprise

export const INITIAL_COORDINADORES = [
  { id: 'COORD-001', name: 'William', zone: 'Noroeste Lote 4', campamento: 'Mantenimiento Noroeste' }
];

export const INITIAL_SUPERVISORES = [
  { id: 'SUP-001', name: 'Isaac Gedeoni Ulloa Javier', cargo: 'Supervisor TCT', coordinatorId: 'COORD-001' },
  { id: 'SUP-002', name: 'Cristian Perdomo Durán', cargo: 'Supervisor Mantenimiento', coordinatorId: 'COORD-001' }
];

export const INITIAL_BRIGADAS = [
  { id: 'MRC04-097', name: 'MRC04-097', tipo: 'Canasto', vehiculo: 'L535228', supervisorId: 'SUP-001', zone: 'Noroeste Lote 4', campamento: 'Mantenimiento Noroeste', estado: 'Activo' },
  { id: 'MRC04-098', name: 'MRC04-098', tipo: 'Canasto', vehiculo: 'L534178', supervisorId: 'SUP-002', zone: 'Noroeste Lote 4', campamento: 'Mantenimiento Noroeste', estado: 'Activo' },
  { id: 'MRC04-099', name: 'MRC04-099', tipo: 'Canasto', vehiculo: 'L466963', supervisorId: 'SUP-001', zone: 'Noroeste Lote 4', campamento: 'Mantenimiento Noroeste', estado: 'Activo' },
  { id: 'MRC04-100', name: 'MRC04-100', tipo: 'Luminaria', vehiculo: 'L535499', supervisorId: 'SUP-002', zone: 'Noroeste Lote 4', campamento: 'Mantenimiento Noroeste', estado: 'Activo' },
  { id: 'MRG04-101', name: 'MRG04-101', tipo: 'Grúa Poste', vehiculo: 'L411977', supervisorId: 'SUP-002', zone: 'Noroeste Lote 4', campamento: 'Mantenimiento Noroeste', estado: 'Activo' },
  { id: 'MRG04-102', name: 'MRG04-102', tipo: 'Transformadores', vehiculo: 'L399969', supervisorId: 'SUP-002', zone: 'Noroeste Lote 4', campamento: 'Mantenimiento Noroeste', estado: 'Mantenimiento' },
  { id: 'MCR04-103', name: 'MCR04-103', tipo: 'TCT', vehiculo: 'L535498', supervisorId: 'SUP-001', zone: 'Noroeste Lote 4', campamento: 'Mantenimiento Noroeste', estado: 'Activo' }
];

export const INITIAL_TECNICOS = [
  {
    id: 'TEC-001',
    name: 'Juan Antonio Jiménez',
    cedula: '001-1823945-8',
    codigoEmpleado: 'EMP-2384',
    telefono: '809-555-0192',
    tipoSangre: 'O+',
    licencia: 'Categoría 3',
    vigenciaLicencia: '2028-04-12',
    sie: 'CERT-SIE-9831',
    licenciaSie: 'Válido',
    tallaCamisa: 'L',
    tallaPantalon: '34',
    tallaBota: '42',
    brigadaId: 'MRC04-097',
    supervisorId: 'SUP-001',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2022-03-15'
  },
  {
    id: 'TEC-002',
    name: 'Miguel Ángel Bautista Mateo',
    cedula: '002-9842831-2',
    codigoEmpleado: 'EMP-9821',
    telefono: '829-555-0143',
    tipoSangre: 'A+',
    licencia: 'Categoría 2',
    vigenciaLicencia: '2027-11-20',
    sie: 'CERT-SIE-1249',
    licenciaSie: 'Válido',
    tallaCamisa: 'M',
    tallaPantalon: '32',
    tallaBota: '41',
    brigadaId: 'MRC04-097',
    supervisorId: 'SUP-001',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2023-01-10'
  },
  {
    id: 'TEC-003',
    name: 'Marino Salomón Rodríguez Santana',
    cedula: '054-0012938-1',
    codigoEmpleado: 'EMP-4389',
    telefono: '809-555-0104',
    tipoSangre: 'B+',
    licencia: 'Categoría 3',
    vigenciaLicencia: '2026-08-30',
    sie: 'CERT-SIE-4392',
    licenciaSie: 'Válido',
    tallaCamisa: 'XL',
    tallaPantalon: '36',
    tallaBota: '43',
    brigadaId: 'MRC04-098',
    supervisorId: 'SUP-002',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2021-06-22'
  },
  {
    id: 'TEC-004',
    name: 'Domingo Joehrlin Arias Guzmán',
    cedula: '001-1923847-5',
    codigoEmpleado: 'EMP-8941',
    telefono: '849-555-0182',
    tipoSangre: 'O-',
    licencia: 'Categoría 2',
    vigenciaLicencia: '2026-02-14',
    sie: 'CERT-SIE-9321',
    licenciaSie: 'Por Vencer',
    tallaCamisa: 'M',
    tallaPantalon: '32',
    tallaBota: '40',
    brigadaId: 'MRC04-098',
    supervisorId: 'SUP-002',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2023-05-18'
  },
  {
    id: 'TEC-005',
    name: 'Juan Carlos Ramírez Vásquez',
    cedula: '102-3928139-4',
    codigoEmpleado: 'EMP-1123',
    telefono: '809-555-0111',
    tipoSangre: 'AB+',
    licencia: 'Categoría 3',
    vigenciaLicencia: '2028-10-05',
    sie: 'CERT-SIE-8423',
    licenciaSie: 'Válido',
    tallaCamisa: 'L',
    tallaPantalon: '34',
    tallaBota: '42',
    brigadaId: 'MRC04-099',
    supervisorId: 'SUP-001',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2020-11-12'
  },
  {
    id: 'TEC-006',
    name: 'Bienvenido Guerra Acevedo',
    cedula: '001-0987341-2',
    codigoEmpleado: 'EMP-6731',
    telefono: '829-555-0122',
    tipoSangre: 'O+',
    licencia: 'Categoría 2',
    vigenciaLicencia: '2029-01-20',
    sie: 'CERT-SIE-5381',
    licenciaSie: 'Válido',
    tallaCamisa: 'XXL',
    tallaPantalon: '38',
    tallaBota: '44',
    brigadaId: 'MRC04-099',
    supervisorId: 'SUP-001',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2019-04-02'
  },
  {
    id: 'TEC-007',
    name: 'Juan Carlos Reyes Colón',
    cedula: '402-9832104-5',
    codigoEmpleado: 'EMP-5524',
    telefono: '849-555-0177',
    tipoSangre: 'A-',
    licencia: 'Categoría 2',
    vigenciaLicencia: '2026-07-15',
    sie: 'CERT-SIE-0941',
    licenciaSie: 'Expirado',
    tallaCamisa: 'L',
    tallaPantalon: '34',
    tallaBota: '42',
    brigadaId: 'MRC04-100',
    supervisorId: 'SUP-002',
    coordinatorId: 'COORD-001',
    estado: 'Suspendido',
    fechaIngreso: '2022-09-01'
  },
  {
    id: 'TEC-008',
    name: 'Pablo Jua Pozo Encarnación',
    cedula: '001-2293847-1',
    codigoEmpleado: 'EMP-7394',
    telefono: '809-555-0188',
    tipoSangre: 'O+',
    licencia: 'Categoría 3',
    vigenciaLicencia: '2028-09-12',
    sie: 'CERT-SIE-2834',
    licenciaSie: 'Válido',
    tallaCamisa: 'XL',
    tallaPantalon: '36',
    tallaBota: '43',
    brigadaId: 'MRC04-100',
    supervisorId: 'SUP-002',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2021-02-28'
  },
  {
    id: 'TEC-009',
    name: 'Víctor Manuel María Núñez',
    cedula: '056-0928374-2',
    codigoEmpleado: 'EMP-0294',
    telefono: '809-555-0133',
    tipoSangre: 'O+',
    licencia: 'Categoría 3',
    vigenciaLicencia: '2027-03-30',
    sie: 'CERT-SIE-7321',
    licenciaSie: 'Válido',
    tallaCamisa: 'M',
    tallaPantalon: '32',
    tallaBota: '41',
    brigadaId: 'MRG04-101',
    supervisorId: 'SUP-002',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2023-08-14'
  },
  {
    id: 'TEC-010',
    name: 'Bagner Manuel Feliz',
    cedula: '001-0982345-3',
    codigoEmpleado: 'EMP-1902',
    telefono: '829-555-0155',
    tipoSangre: 'B-',
    licencia: 'Categoría 2',
    vigenciaLicencia: '2026-12-10',
    sie: 'CERT-SIE-2940',
    licenciaSie: 'Válido',
    tallaCamisa: 'L',
    tallaPantalon: '34',
    tallaBota: '42',
    brigadaId: 'MRG04-101',
    supervisorId: 'SUP-002',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2022-10-18'
  },
  {
    id: 'TEC-011',
    name: 'Carlos Yunior Romero Contreras',
    cedula: '003-9283412-9',
    codigoEmpleado: 'EMP-4381',
    telefono: '809-555-0166',
    tipoSangre: 'O+',
    licencia: 'Categoría 4',
    vigenciaLicencia: '2028-12-25',
    sie: 'CERT-SIE-0293',
    licenciaSie: 'Válido',
    tallaCamisa: 'XXL',
    tallaPantalon: '38',
    tallaBota: '45',
    brigadaId: 'MRG04-102',
    supervisorId: 'SUP-002',
    coordinatorId: 'COORD-001',
    estado: 'Inactivo',
    fechaIngreso: '2018-07-30'
  },
  {
    id: 'TEC-012',
    name: 'Dionicio Jiménez Santana',
    cedula: '001-0293847-6',
    codigoEmpleado: 'EMP-7711',
    telefono: '849-555-0100',
    tipoSangre: 'A+',
    licencia: 'Categoría 2',
    vigenciaLicencia: '2027-05-14',
    sie: 'CERT-SIE-8911',
    licenciaSie: 'Válido',
    tallaCamisa: 'L',
    tallaPantalon: '34',
    tallaBota: '42',
    brigadaId: 'MCR04-103',
    supervisorId: 'SUP-001',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2021-04-15'
  },
  {
    id: 'TEC-013',
    name: 'Jordys Brioso Martínez',
    cedula: '002-0938421-4',
    codigoEmpleado: 'EMP-0032',
    telefono: '809-555-0109',
    tipoSangre: 'O-',
    licencia: 'Categoría 3',
    vigenciaLicencia: '2026-10-18',
    sie: 'CERT-SIE-0348',
    licenciaSie: 'Por Vencer',
    tallaCamisa: 'M',
    tallaPantalon: '30',
    tallaBota: '40',
    brigadaId: 'MCR04-103',
    supervisorId: 'SUP-001',
    coordinatorId: 'COORD-001',
    estado: 'Activo',
    fechaIngreso: '2023-09-22'
  }
];

export const INITIAL_INVENTARIO = [
  // HERRAMIENTAS
  { id: 'INV-H01', code: 'HER-CIZ24', name: 'Cizalla de 24 pulgadas', category: 'Herramientas', type: 'Herramientas', stock: 15, min: 5, location: 'Bodega Central A1', status: 'Disponible', value: 85.00 },
  { id: 'INV-H02', code: 'HER-CIZ36', name: 'Cizalla de 36 pulgadas', category: 'Herramientas', type: 'Herramientas', stock: 8, min: 3, location: 'Bodega Central A2', status: 'Disponible', value: 120.00 },
  { id: 'INV-H03', code: 'HER-CHY35', name: 'Compresor hidráulico Y-35', category: 'Herramientas', type: 'Herramientas', stock: 4, min: 2, location: 'Bodega Especial B1', status: 'Asignado', value: 950.00 },
  { id: 'INV-H04', code: 'HER-CCTRQ', name: 'Corta cable de trinquete', category: 'Herramientas', type: 'Herramientas', stock: 12, min: 4, location: 'Bodega Central A3', status: 'Disponible', value: 150.00 },
  { id: 'INV-H05', code: 'HER-LLAVA', name: 'Llave ajustable aislada', category: 'Herramientas', type: 'Herramientas', stock: 25, min: 8, location: 'Bodega Central B3', status: 'Disponible', value: 45.00 },
  { id: 'INV-H06', code: 'HER-PTAIS', name: 'Pértiga aislada extensible', category: 'Herramientas', type: 'Herramientas', stock: 3, min: 5, location: 'Bodega Central A4', status: 'Bajo mínimo', value: 310.00 },
  { id: 'INV-H07', code: 'HER-STIER', name: 'Set de puesta a tierra', category: 'Herramientas', type: 'Herramientas', stock: 9, min: 4, location: 'Bodega Especial B2', status: 'Disponible', value: 420.00 },
  { id: 'INV-H08', code: 'HER-CPORT', name: 'Caja porta herramientas', category: 'Herramientas', type: 'Herramientas', stock: 30, min: 10, location: 'Bodega Central C1', status: 'Disponible', value: 65.00 },

  // EPP (Equipo de Proteccion Personal)
  { id: 'INV-E01', code: 'EPP-CASDI', name: 'Casco dieléctrico', category: 'EPP', type: 'EPP', stock: 40, min: 15, location: 'Bodega EPP D1', status: 'Disponible', value: 25.00 },
  { id: 'INV-E02', code: 'EPP-GUAIS', name: 'Guantes aislados', category: 'EPP', type: 'EPP', stock: 28, min: 10, location: 'Bodega EPP D2', status: 'Disponible', value: 75.00 },
  { id: 'INV-E03', code: 'EPP-BOTDI', name: 'Botas dieléctricas', category: 'EPP', type: 'EPP', stock: 35, min: 12, location: 'Bodega EPP D3', status: 'Disponible', value: 95.00 },
  { id: 'INV-E04', code: 'EPP-LENSE', name: 'Lentes de seguridad', category: 'EPP', type: 'EPP', stock: 50, min: 20, location: 'Bodega EPP D4', status: 'Disponible', value: 8.50 },
  { id: 'INV-E05', code: 'EPP-CHARE', name: 'Chaleco reflectivo', category: 'EPP', type: 'EPP', stock: 6, min: 15, location: 'Bodega EPP D5', status: 'Bajo mínimo', value: 12.00 },
  { id: 'INV-E06', code: 'EPP-ARNES', name: 'Arnés de seguridad', category: 'EPP', type: 'EPP', stock: 18, min: 6, location: 'Bodega Especial B3', status: 'Disponible', value: 180.00 },
  { id: 'INV-E07', code: 'EPP-CAMLA', name: 'Camisa manga larga industrial', category: 'EPP', type: 'EPP', stock: 60, min: 20, location: 'Bodega EPP E1', status: 'Disponible', value: 18.00 },
  { id: 'INV-E08', code: 'EPP-PANIN', name: 'Pantalón industrial', category: 'EPP', type: 'EPP', stock: 55, min: 20, location: 'Bodega EPP E2', status: 'Disponible', value: 22.00 },

  // EPC (Equipo de Proteccion Colectiva)
  { id: 'INV-C01', code: 'EPC-CAP15', name: 'Captador de carga 15 kV', category: 'EPC', type: 'EPC', stock: 5, min: 2, location: 'Bodega Especial C1', status: 'Disponible', value: 1250.00 },
  { id: 'INV-C02', code: 'EPC-COBCL', name: 'Cobertor cubre líneas cilíndrica', category: 'EPC', type: 'EPC', stock: 15, min: 5, location: 'Bodega Central A5', status: 'Disponible', value: 190.00 },
  { id: 'INV-C03', code: 'EPC-ARNMA', name: 'Arnés para mangas aislada', category: 'EPC', type: 'EPC', stock: 10, min: 4, location: 'Bodega Central A6', status: 'Disponible', value: 45.00 },
  { id: 'INV-C04', code: 'EPC-BOLMA', name: 'Bolsa para mangas aisladas', category: 'EPC', type: 'EPC', stock: 12, min: 4, location: 'Bodega Central A7', status: 'Disponible', value: 35.00 },
  { id: 'INV-C05', code: 'EPC-BROMN', name: 'Broches para mantas aisladas', category: 'EPC', type: 'EPC', stock: 120, min: 30, location: 'Bodega Central C3', status: 'Disponible', value: 3.50 }
];

export const INITIAL_BRIGADA_HERRAMIENTAS = [
  { brigadaId: 'MRC04-097', itemCode: 'HER-CIZ24', name: 'Cizalla de 24 pulgadas', reqQty: 2, delQty: 2, category: 'Herramientas', estado: 'Entregado', obs: 'Sin novedades' },
  { brigadaId: 'MRC04-097', itemCode: 'HER-PTAIS', name: 'Pértiga aislada extensible', reqQty: 1, delQty: 1, category: 'Herramientas', estado: 'Entregado', obs: 'Recalibrada recientemente' },
  { brigadaId: 'MRC04-097', itemCode: 'EPP-GUAIS', name: 'Guantes aislados', reqQty: 4, delQty: 3, category: 'EPP', estado: 'Pendiente', obs: 'Pendiente par talla M' },
  { brigadaId: 'MRC04-097', itemCode: 'HER-CHY35', name: 'Compresor hidráulico Y-35', reqQty: 1, delQty: 1, category: 'Herramientas', estado: 'Entregado', obs: 'Vehículo L535228' },
  
  { brigadaId: 'MRC04-098', itemCode: 'HER-CIZ36', name: 'Cizalla de 36 pulgadas', reqQty: 1, delQty: 1, category: 'Herramientas', estado: 'Entregado', obs: 'Excelente estado' },
  { brigadaId: 'MRC04-098', itemCode: 'HER-CCTRQ', name: 'Corta cable de trinquete', reqQty: 1, delQty: 0, category: 'Herramientas', estado: 'No entregado', obs: 'Falta de stock' },
  { brigadaId: 'MRC04-098', itemCode: 'EPP-ARNES', name: 'Arnés de seguridad', reqQty: 2, delQty: 2, category: 'EPP', estado: 'Entregado', obs: 'Certificación 2026' },
  
  { brigadaId: 'MRC04-099', itemCode: 'HER-STIER', name: 'Set de puesta a tierra', reqQty: 2, delQty: 2, category: 'Herramientas', estado: 'Entregado', obs: 'Última prueba ok' },
  { brigadaId: 'MRC04-099', itemCode: 'HER-PTAIS', name: 'Pértiga aislada extensible', reqQty: 1, delQty: 0, category: 'Herramientas', estado: 'Pendiente', obs: 'Desgaste detectado en inspección' },
  
  { brigadaId: 'MRC04-100', itemCode: 'HER-LLAVA', name: 'Llave ajustable aislada', reqQty: 3, delQty: 3, category: 'Herramientas', estado: 'Entregado', obs: 'Bien' },
  
  { brigadaId: 'MRG04-101', itemCode: 'EPC-CAP15', name: 'Captador de carga 15 kV', reqQty: 1, delQty: 1, category: 'EPC', estado: 'Entregado', obs: 'Uso en grúa' },
  
  { brigadaId: 'MCR04-103', itemCode: 'HER-CIZ24', name: 'Cizalla de 24 pulgadas', reqQty: 1, delQty: 1, category: 'Herramientas', estado: 'Entregado', obs: 'Ok' },
  { brigadaId: 'MCR04-103', itemCode: 'EPP-GUAIS', name: 'Guantes aislados', reqQty: 3, delQty: 3, category: 'EPP', estado: 'Entregado', obs: 'Aprobados' }
];

export const INITIAL_ACTAS = [
  { id: 'ACT-2026-001', tipo: 'Entrega EPP', destino: 'Brigada MRC04-097', responsable: 'Isaac Gedeoni Ulloa Javier', fecha: '2026-05-10', estado: 'Firmada', firmado: true },
  { id: 'ACT-2026-002', tipo: 'Asignación Herramientas', destino: 'Brigada MRC04-098', responsable: 'Cristian Perdomo Durán', fecha: '2026-05-15', estado: 'Validada', firmado: false },
  { id: 'ACT-2026-003', tipo: 'Reposición por Daño', destino: 'Juan Antonio Jiménez', responsable: 'Isaac Gedeoni Ulloa Javier', fecha: '2026-05-20', estado: 'Pendiente', firmado: false },
  { id: 'ACT-2026-004', tipo: 'Devolución de Herramientas', destino: 'Técnico Bienvenido Guerra', responsable: 'Isaac Gedeoni Ulloa Javier', fecha: '2026-05-22', estado: 'Borrador', firmado: false }
];

export const INITIAL_REPOSICIONES = [
  { id: 'REP-001', colaborador: 'Juan Antonio Jiménez', item: 'Pértiga aislada extensible', motivo: 'Rotura de acople en campo', valor: 310.00, estado: 'Pendiente', fecha: '2026-05-21', supervisorId: 'SUP-001', coordinatorId: 'COORD-001' },
  { id: 'REP-002', colaborador: 'Domingo Joehrlin Arias Guzmán', item: 'Lentes de seguridad', motivo: 'Pérdida en faena', valor: 8.50, estado: 'Descontar', fecha: '2026-05-23', supervisorId: 'SUP-002', coordinatorId: 'COORD-001' },
  { id: 'REP-003', colaborador: 'Bienvenido Guerra Acevedo', item: 'Guantes aislados', motivo: 'Perforación por arco', valor: 75.00, estado: 'Aprobada', fecha: '2026-05-24', supervisorId: 'SUP-001', coordinatorId: 'COORD-001' },
  { id: 'REP-004', colaborador: 'Pablo Jua Pozo Encarnación', item: 'Cizalla de 24 pulgadas', motivo: 'Desgaste natural de cuchilla', valor: 85.00, estado: 'Repuesta', fecha: '2026-05-25', supervisorId: 'SUP-002', coordinatorId: 'COORD-001' }
];

export const INITIAL_SWAPS = [
  { id: 'SWP-001', herramientaAnterior: 'Cizalla de 24" Dañada', herramientaNueva: 'Cizalla de 24" Nueva (SN-0982)', brigadaId: 'MRC04-097', tecnico: 'Juan Antonio Jiménez', motivo: 'Filo inservible', fecha: '2026-05-18', estado: 'Completado' },
  { id: 'SWP-002', herramientaAnterior: 'Compresor Y-35 Descalibrado', herramientaNueva: 'Compresor Y-35 Calibrado (SN-4412)', brigadaId: 'MCR04-103', tecnico: 'Dionicio Jiménez Santana', motivo: 'Error de presión', fecha: '2026-05-22', estado: 'Completado' }
];

export const INITIAL_DEVOLUCIONES = [
  { id: 'DEV-001', colaborador: 'Bienvenido Guerra Acevedo', brigadaId: 'MRC04-099', item: 'Corta cable de trinquete', cantEsperada: 1, cantDevuelta: 1, estado: 'Devuelto', observacion: 'Excelente estado' },
  { id: 'DEV-002', colaborador: 'Pablo Jua Pozo Encarnación', brigadaId: 'MRC04-100', item: 'Arnés de seguridad', cantEsperada: 1, cantDevuelta: 0, estado: 'Faltante', observacion: 'Alega extravío en zona de postes' },
  { id: 'DEV-003', colaborador: 'Domingo Joehrlin Arias Guzmán', brigadaId: 'MRC04-098', item: 'Cizalla de 36 pulgadas', cantEsperada: 1, cantDevuelta: 1, estado: 'Devuelto', observacion: 'Tornillos sueltos' },
  { id: 'DEV-004', colaborador: 'Miguel Ángel Bautista Mateo', brigadaId: 'MRC04-097', item: 'Botas dieléctricas', cantEsperada: 1, cantDevuelta: 1, estado: 'Parcial', observacion: 'Suela agrietada en bota izquierda' }
];

export const INITIAL_AUDITORIA = [
  { id: 'AUD-001', fecha: '2026-05-25 08:30:12', usuario: 'william', rol: 'Coordinador', accion: 'ASIGNACION_TECNICO', entidad: 'Brigada MRC04-097', antes: 'Técnicos: Ninguno', despues: 'Juan Antonio Jiménez, Miguel Ángel Bautista', zona: 'Noroeste Lote 4', ip: '192.168.4.112', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' },
  { id: 'AUD-002', fecha: '2026-05-25 09:12:45', usuario: 'isaac', rol: 'Supervisor', accion: 'VALIDACION_ACTA', entidad: 'Acta ACT-2026-001', antes: 'Estado: Borrador', despues: 'Estado: Validada', zona: 'Noroeste Lote 4', ip: '192.168.4.155', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' },
  { id: 'AUD-003', fecha: '2026-05-25 09:20:00', usuario: 'dev', rol: 'Developer', accion: 'ACTUALIZACION_STOCK', entidad: 'Bodega - Set de puesta a tierra', antes: 'Stock: 10', despues: 'Stock: 9', zona: 'Sistema Central', ip: '127.0.0.1', userAgent: 'PostmanRuntime/7.37.3' }
];
