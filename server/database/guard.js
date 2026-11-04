/**
 * GUARDIÁN DE SEGURIDAD DEFENSIVA PARA OPERACIONES DE BASE DE DATOS
 * INGMELEC | ALMACÉN ENTERPRISE
 *
 * Este módulo previene la ejecución accidental de comandos destructivos
 * (DROP TABLE, TRUNCATE, ALTER) o inserciones/borrados de prueba sobre
 * la base de datos de producción (Clever Cloud o entornos no aislados).
 */

export function assertSafeDatabaseTarget(scriptName = 'Operación de BD') {
  const host = (process.env.DB_HOST || '').toLowerCase();
  const dbName = (process.env.DB_NAME || '').toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  const allowDestructive = process.env.ALLOW_DESTRUCTIVE_OPERATIONS === 'true';
  const environment = (process.env.ENVIRONMENT || '').toLowerCase();

  // 1. REGLA INQUEBRANTABLE: Prohibición absoluta de hosts remotos o Clever Cloud
  const isCleverCloud = host.includes('clever-cloud.com') || host.includes('cleverapps.io') || host.includes('services.clever');
  const isRemote = host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '';

  if (isCleverCloud || isRemote) {
    console.error('\n' + '='.repeat(80));
    console.error(`🚨 [BLOQUEO DE SEGURIDAD CRÍTICO] - ${scriptName.toUpperCase()}`);
    console.error('='.repeat(80));
    console.error(`DETECCIÓN: El host configurado es remoto/producción: "${process.env.DB_HOST}"`);
    console.error('REGLA VIOLADA: Está terminantemente prohibido ejecutar scripts destructivos,');
    console.error('reinicializaciones de tablas o pruebas de escritura sobre bases de producción.');
    console.error('ACCIÓN: Operación abortada de inmediato. Los 414 registros maestros están a salvo.');
    console.error('='.repeat(80) + '\n');
    process.exit(1);
  }

  // 2. REGLA: Exigir variable explícita de autorización destructiva
  if (!allowDestructive) {
    console.error('\n' + '='.repeat(80));
    console.error(`🚨 [BLOQUEO DE SEGURIDAD] - ${scriptName.toUpperCase()}`);
    console.error('='.repeat(80));
    console.error('FALTA AUTORIZACIÓN EXPLÍCITA: Para ejecutar operaciones de reinicialización');
    console.error('o pruebas destructivas en local, debe configurar explícitamente:');
    console.error('   ALLOW_DESTRUCTIVE_OPERATIONS=true');
    console.error('ACCIÓN: Operación abortada.\n');
    process.exit(1);
  }

  // 3. REGLA: Exigir entorno aislado explícitamente identificado
  const isTestEnvironment = environment === 'isolated_test' || environment === 'local_test' || nodeEnv === 'test';
  if (!isTestEnvironment) {
    console.error('\n' + '='.repeat(80));
    console.error(`🚨 [BLOQUEO DE SEGURIDAD] - ${scriptName.toUpperCase()}`);
    console.error('='.repeat(80));
    console.error('ENTORNO NO IDENTIFICADO COMO PRUEBAS AISLADAS:');
    console.error('Se requiere: ENVIRONMENT=isolated_test o NODE_ENV=test');
    console.error('ACCIÓN: Operación abortada.\n');
    process.exit(1);
  }

  // 4. REGLA: Comprobar el nombre de la base de datos destino
  const isTestDatabaseName = dbName.includes('test') || dbName.includes('sandbox') || dbName.includes('qa_isolated');
  if (!isTestDatabaseName || dbName === 'gridops_enterprise') {
    console.error('\n' + '='.repeat(80));
    console.error(`🚨 [BLOQUEO DE SEGURIDAD] - ${scriptName.toUpperCase()}`);
    console.error('='.repeat(80));
    console.error(`NOMBRE DE BASE DE DATOS INSEGURO: "${process.env.DB_NAME}"`);
    console.error('La base de datos destino debe contener "test", "sandbox" o "qa_isolated"');
    console.error('y nunca el nombre de producción ("gridops_enterprise").');
    console.error('ACCIÓN: Operación abortada.\n');
    process.exit(1);
  }

  console.log(`🛡️ [GUARDIÁN DE SEGURIDAD] Destino verificado como entorno de pruebas aislado (${host} -> ${dbName}).`);
}
