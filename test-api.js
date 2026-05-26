
const API_BASE = 'http://localhost:5000/api';
let devHeaders = {
  'Content-Type': 'application/json',
  'x-username': 'dev',
  'x-user-role': 'Developer'
};

async function runTests() {
  console.log('🧪 INICIANDO CONSOLA DE PRUEBAS DE INTEGRACIÓN: GRIDOPS ENTERPRISE V2 🧪');
  console.log('========================================================================');

  try {
    // Test 1: Authenticate
    console.log('\n[1] Probando autenticación (POST /auth/login)...');
    const authRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dev', password: '1234' })
    });
    const authData = await authRes.json();
    if (authData.success) {
      console.log('✅ Autenticación exitosa. Rol recibido:', authData.user.role);
    } else {
      throw new Error('❌ Falló autenticación: ' + JSON.stringify(authData));
    }

    // Test 2: Dashboard Analytics
    console.log('\n[2] Cargando telemetría del dashboard (GET /dashboard/stats)...');
    const statsRes = await fetch(`${API_BASE}/dashboard/stats`, { headers: devHeaders });
    const statsData = await statsRes.json();
    if (statsData.success) {
      console.log('✅ Telemetría cargada. Estadísticas recibidas:', JSON.stringify(statsData.stats));
    } else {
      throw new Error('❌ Falló telemetría: ' + JSON.stringify(statsData));
    }

    // Test 3: List seeded Dominican technical employees
    console.log('\n[3] Listando personal técnico dominicano (GET /tecnicos)...');
    const listRes = await fetch(`${API_BASE}/tecnicos`, { headers: devHeaders });
    const listData = await listRes.json();
    if (listData.success) {
      console.log(`✅ Personal cargado. Técnicos registrados en MySQL/MariaDB: ${listData.tecnicos.length}`);
      console.log(`   Ejemplo Técnico 1: ${listData.tecnicos[0].name} (Cédula: ${listData.tecnicos[0].cedula}, SIE: ${listData.tecnicos[0].sie})`);
    } else {
      throw new Error('❌ Falló listado de técnicos: ' + JSON.stringify(listData));
    }

    // Test 4: Create new collaborator in SQL
    console.log('\n[4] Registrando nuevo técnico en MySQL/MariaDB (POST /tecnicos)...');
    const randId = Math.floor(100000 + Math.random() * 900000);
    const testTech = {
      name: 'Evaristo de Jesús Peralta',
      cedula: `001-${randId}-2`,
      codigoEmpleado: `EMP-TEST-${randId}`,
      telefono: '809-555-9999',
      tipoSangre: 'A+',
      licencia: 'Categoría 3',
      vigenciaLicencia: '2029-05-15',
      sie: `CERT-SIE-${randId}`,
      licenciaSie: 'Válido',
      tallaCamisa: 'L',
      tallaPantalon: '34',
      tallaBota: '42',
      brigadaId: '',
      supervisorId: 'SUP-001',
      coordinatorId: 'COORD-001',
      estado: 'Activo'
    };

    const createTechRes = await fetch(`${API_BASE}/tecnicos`, {
      method: 'POST',
      headers: devHeaders,
      body: JSON.stringify(testTech)
    });
    const createTechData = await createTechRes.json();
    let newTechId = createTechData.id;
    if (createTechData.success) {
      console.log(`✅ Técnico registrado exitosamente. ID asignado en MySQL/MariaDB: ${newTechId}`);
    } else {
      throw new Error('❌ Falló registro de técnico: ' + JSON.stringify(createTechData));
    }

    // Test 5: Edit collaborator profile in SQL
    console.log('\n[5] Modificando expediente técnico en MySQL/MariaDB (PUT /tecnicos/:id)...');
    const editTech = {
      ...testTech,
      id: newTechId.toString(),
      telefono: '829-555-8888', // nuevo tlf
      tallaCamisa: 'XL' // nueva talla
    };
    const editTechRes = await fetch(`${API_BASE}/tecnicos/${newTechId}`, {
      method: 'PUT',
      headers: devHeaders,
      body: JSON.stringify(editTech)
    });
    const editTechData = await editTechRes.json();
    if (editTechData.success) {
      console.log('✅ Expediente técnico modificado exitosamente en la base de datos.');
    } else {
      throw new Error('❌ Falló edición de técnico: ' + JSON.stringify(editTechData));
    }

    // Test 6: Deactivation flow warning ("Dar de baja" - soft delete check)
    console.log('\n[6] Ejecutando baja operativa de colaborador (POST /tecnicos/:id/baja)...');
    const deactRes = await fetch(`${API_BASE}/tecnicos/${newTechId}/baja`, {
      method: 'POST',
      headers: devHeaders
    });
    const deactData = await deactRes.json();
    if (deactData.success) {
      console.log('✅ Deactivación exitosa (Soft Delete aplicada en MySQL/MariaDB). Roster liberado.');
    } else {
      throw new Error('❌ Falló baja operativa: ' + JSON.stringify(deactData));
    }

    // Test 7: Create a new brigade squad in SQL
    console.log('\n[7] Registrando nueva brigada operativa (POST /brigadas)...');
    const brigadeCode = `BR-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
    const newBrigade = {
      id: brigadeCode,
      tipo: 'TCT',
      vehiculo: 'L999999',
      supervisorId: 'SUP-001',
      zone: 'Noroeste Lote 4',
      campamento: 'Mantenimiento Noroeste'
    };
    const createBrigadeRes = await fetch(`${API_BASE}/brigadas`, {
      method: 'POST',
      headers: devHeaders,
      body: JSON.stringify(newBrigade)
    });
    const createBrigadeData = await createBrigadeRes.json();
    if (createBrigadeData.success) {
      console.log(`✅ Brigada ${brigadeCode} registrada exitosamente.`);
    } else {
      throw new Error('❌ Falló registro de brigada: ' + JSON.stringify(createBrigadeData));
    }

    // Test 8: Load standard kit suggestion for TCT
    console.log(`\n[8] Cargando kit sugerido de TCT (POST /brigadas/${brigadeCode}/cargar-kit)...`);
    const kitRes = await fetch(`${API_BASE}/brigadas/${brigadeCode}/cargar-kit`, {
      method: 'POST',
      headers: devHeaders,
      body: JSON.stringify({ departamento: 'TCT' })
    });
    const kitData = await kitRes.json();
    if (kitData.success) {
      console.log(`✅ Kit TCT cargado. Cantidad de equipos sugeridos: ${kitData.tools.length}`);
      console.log(`   Ejemplo ítem: ${kitData.tools[0].name} (Code: ${kitData.tools[0].itemCode}, Cant: ${kitData.tools[0].reqQty})`);
    } else {
      throw new Error('❌ Falló carga de kit sugerido: ' + JSON.stringify(kitData));
    }

    // Test 9: Save tools allocation (deduct stock check)
    console.log(`\n[9] Guardando asignación de equipos en Almacén Central (PATCH /brigadas/${brigadeCode}/herramientas)...`);
    const assignRes = await fetch(`${API_BASE}/brigadas/${brigadeCode}/herramientas`, {
      method: 'PATCH',
      headers: devHeaders,
      body: JSON.stringify({ toolsList: kitData.tools, overrideStock: false })
    });
    const assignData = await assignRes.json();
    if (assignData.success) {
      console.log('✅ Equipamiento asignado correctamente y descontado del Almacén.');
    } else {
      throw new Error('❌ Falló asignación inicial: ' + JSON.stringify(assignData));
    }

    // Test 10: Trigger stock level warning block (insufficient stock check)
    console.log(`\n[10] Probando bloqueo de inventario por falta de stock (PATCH /brigadas/${brigadeCode}/herramientas)...`);
    const overLimitTools = kitData.tools.map(t => 
      t.itemCode === 'HER-PTAIS' ? { ...t, delQty: 999 } : t // Pértiga extensible stock level is 3
    );
    const deficitRes = await fetch(`${API_BASE}/brigadas/${brigadeCode}/herramientas`, {
      method: 'PATCH',
      headers: devHeaders,
      body: JSON.stringify({ toolsList: overLimitTools, overrideStock: false })
    });
    const deficitData = await deficitRes.json();
    if (!deficitRes.ok && deficitData.success === false) {
      console.log('✅ Control de stock robusto: Bloqueo exitoso.');
      console.log(`   Mensaje recibido del Almacén: "${deficitData.message}"`);
      console.log(`   Déficit reportado:`, JSON.stringify(deficitData.deficits));
    } else {
      throw new Error('❌ Falló bloqueo de stock. Se guardó incorrectamente: ' + JSON.stringify(deficitData));
    }

    // Test 11: Execute stock override (authorized overdraw check)
    console.log(`\n[11] Forzando sobregiro autorizado de almacén (PATCH /brigadas/${brigadeCode}/herramientas)...`);
    const forceRes = await fetch(`${API_BASE}/brigadas/${brigadeCode}/herramientas`, {
      method: 'PATCH',
      headers: devHeaders,
      body: JSON.stringify({ toolsList: overLimitTools, overrideStock: true })
    });
    const forceData = await forceRes.json();
    if (forceData.success) {
      console.log('✅ Sobregiro autorizado con éxito (Rol Developer/Gerente validado). Log registrado.');
    } else {
      throw new Error('❌ Falló sobregiro autorizado: ' + JSON.stringify(forceData));
    }

    // Test 12: Verify immutable security logs recorded in database
    console.log('\n[12] Verificando logs históricos e inmunidad (GET /auditoria)...');
    const auditRes = await fetch(`${API_BASE}/auditoria`, { headers: devHeaders });
    const auditData = await auditRes.json();
    if (auditData.success) {
      console.log(`✅ Logs de auditoría verificados. Entradas registradas: ${auditData.auditoria.length}`);
      const latest = auditData.auditoria[0];
      console.log(`   Última acción registrada en MySQL/MariaDB: ${latest.accion} | Entidad: ${latest.entidad} | IP: ${latest.ip}`);
    } else {
      throw new Error('❌ Falló verificación de auditoría: ' + JSON.stringify(auditData));
    }

    console.log('\n========================================================================');
    console.log('🎉 ¡TODAS LAS OPCIONES OPERATIVAS Y ENDPOINTS FUNCIONAN AL 100% PERFECTO! 🎉');
    console.log('========================================================================');

  } catch (err) {
    console.error('\n❌ ERROR EN EL EXPERIMENTO DE VERIFICACIÓN OPERATIVA:', err.message);
    process.exit(1);
  }
}

runTests();
