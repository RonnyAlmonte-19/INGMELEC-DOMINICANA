# INGMELEC v2.2 — Modo mantenimiento verificado y secuencia final de publicación (NO EJECUTADA)

## 1. Cómo funciona realmente `MAINTENANCE_MODE`
- **Backend** (`server/index.js`, líneas 122-145): si al **arrancar** el proceso `MAINTENANCE_MODE` vale `true` (se admite mayúsculas y espacios), un middleware montado en `/api/v2` **antes** de los routers de actas y almacén devuelve `503` con el mensaje «El sistema se encuentra en MODO MANTENIMIENTO por actualización programada…» a todo `POST`, `PUT`, `PATCH` y `DELETE`. Las lecturas (`GET`), `OPTIONS` y `/health` siguen respondiendo.
- **Frontend:** no tiene lógica propia; muestra `message` de la respuesta (aviso rojo en el inicio de sesión y al guardar).
- **v2.1.1 ya publicada contiene el mismo bloqueo** (introducido en el commit `e80525d`): se puede activar **sobre la versión pública actual** antes de desplegar v2.2.
- **Ajuste v2.2 (aprobado e implementado, 18-nov):** al arrancar con el modo activo se registra `[MANTENIMIENTO] ACTIVO: …` y `GET /health` incluye `maintenance: true/false`. La condición de activación no cambió (solo `true`; no se aceptan `1/yes/on`). **v2.1.1 no tiene este ajuste**: mientras corra v2.1.1 la comprobación sigue siendo el sondeo de login (M-01). Prueba automatizada: `server/tests/v22_mantenimiento.test.mjs`.
- Se lee **una sola vez al arrancar**: cambiar la variable exige reiniciar (en Render, el cambio de variable ya redespliega).

## 2. Pruebas locales (MySQL 8.0.22 desechable con base sintética) — resultados
Script: `C:\Users\gener\INGMELEC-RESPALDOS\ensayo-mig07\mantenimiento_test.mjs` (más `mant_servidor.mjs` para la interfaz).
| Prueba | Resultado |
|---|---|
| Las **30** rutas de escritura del código (POST/PUT/PATCH/DELETE de almacén y actas) con sesión válida | 30/30 → `503` con mensaje claro |
| Escritura sin sesión | `503` (se bloquea antes de autenticar) |
| Evasión: mayúsculas en la ruta, barra final, `?_method=`, `/./`, cabecera `X-HTTP-Method-Override`, `PUT`/`DELETE`/`PATCH` con variantes | `503` o `404`; ninguna pasa |
| Preflight CORS (`OPTIONS`) | `204` (sigue funcionando) |
| `/health` y 11 lecturas con la sesión iniciada antes (inventario, movimientos, reportes, auditoría, usuarios, sedes, levantamientos, actas, KPIs, catálogos) | `200` |
| Estado de **todas las tablas** (recuento + huella por columnas) antes y después de todos los intentos | **idéntico** (0 cambios) |
| Interfaz real en navegador: inicio de sesión en mantenimiento | aviso rojo «MODO MANTENIMIENTO…» |
| Interfaz real: sesión previa carga el panel y Movimientos (lectura); «Confirmar Transacción» de una ENTRADA | aviso rojo de mantenimiento; la base no cambió (5 movimientos = 4 del fixture, 1 de ellos oculto por ser sintético, + 1 acta de la prueba anterior) |
| Mantenimiento **desactivado**: login, escritura real (POST /actas → 201, la base cambia: control positivo) y 10 módulos antiguos | todo `200/201`, sin errores SQL |
| Valores de la variable | `true`, `TRUE`, ` True ` activan; **`1`, `yes`, `on`, `si`, `verdadero` NO activan** (quedan escribiendo sin avisar) |

Tras el ajuste: `v22_mantenimiento.test.mjs` 1/1 y regresión completa 98 pruebas (97 aprobadas, 0 fallidas, 1 pendiente: devolución vinculada). No ejecutado: comportamiento de Render durante el cambio de despliegue (solapamiento de instancias); solicitudes en vuelo en el instante del reinicio.

## 3. Hallazgos y propuestas (NO implementadas; requieren aprobación)
| ID | Sev. | Hallazgo | Mitigación operativa (sin código) | Corrección mínima propuesta |
|---|---|---|---|---|
| M-01 | MEDIO | Solo el valor exacto `true` activa el modo; otros valores se ignoran **en silencio** y no hay forma visible de comprobar el estado (sin log ni campo en `/health`). | Escribir exactamente `true` y **sondear**: `POST /api/v2/auth/login` con cuerpo `{}` devuelve `503` si el modo está activo (en modo normal devuelve 400/401 y no escribe nada). | **Implementado en v2.2:** registro `[MANTENIMIENTO] ACTIVO` y campo `maintenance` en `/health`. **No aprobado:** aceptar `1/yes/on`. |
| M-02 | MEDIO (operativo) | El inicio y cierre de sesión también son `POST` (escriben `ultimo_acceso`, auditoría, `token_version`): **nadie puede iniciar sesión ni cerrar sesión en el servidor** durante el mantenimiento. Las sesiones previas siguen leyendo (JWT 12 h). | **Iniciar sesión en la app ANTES de activar el mantenimiento** y mantenerla abierta para las verificaciones de lectura. Cerrar sesión «de verdad» después de reabrir. | Ninguna (comportamiento coherente con «cero escrituras»). |
| M-03 | BAJO | Render sustituye la instancia sin cortar: la instancia vieja puede aceptar escrituras unos segundos tras el cambio. | Tras el sondeo `503`, esperar 2 min y comparar dos lecturas de conteos exactos separadas; si cambian, repetir el respaldo. | — |
| M-04 | BAJO | El modo solo protege la **aplicación**; phpMyAdmin u otros clientes pueden escribir. | No usar otros clientes durante la ventana. | — |
| M-05 | BAJO | Durante el reinicio Render sirve su propio `503` HTML; la interfaz puede mostrar un error genérico. | Avisar a los usuarios antes. | — |
| — | — | **No se encontraron rutas de escritura desprotegidas** (30/30, incluidas actas y permisos). Ninguna lectura probada escribe en la base. | | |

## 4. Secuencia exacta de publicación (cada ✋ = punto de aprobación del propietario)
**Antes de empezar**
1. Git: rama `feature/v2.2-actas`, árbol limpio, 6 commits sobre `d5d06fe`; copia del código en `INGMELEC-RESPALDOS` verificada (SHA-256 `31b0b26d…be824ff`). Añadir en un commit los documentos de `docs/auditorias/` si se desea. ✋ aprobar commit de documentos.
2. Sin errores críticos pendientes: regresión 96/97 aprobadas (1 pendiente conocida: devolución vinculada), lint y build correctos, E2E aprobados.
3. Respaldo del 17-nov restaurado y verificado (referencia). Decidir si se aplica la ventana en horario de baja actividad y avisar a los usuarios.

**Ventana de publicación**
4. Iniciar sesión en la aplicación pública (v2.1.1) y dejarla abierta (M-02). ✋ aprobar inicio de ventana.
5. **Congelar escrituras:** en Render poner `MAINTENANCE_MODE=true` (exacto) junto con `APP_TIMEZONE_OFFSET=-04:00`, `DB_TIME_OFFSET=+00:00`, `ACTAS_ENABLED=false`. Render redespliega **la v2.1.1** (mismo código de mantenimiento). ✋ aprobar cambio de variables.
6. Sondeo: `POST /api/v2/auth/login` con `{}` debe dar `503`; la sesión abierta sigue leyendo. Esperar 2 min (M-03).
7. **Conteos exactos** de producción (consulta de solo lectura) — dos lecturas separadas, sin cambios, iguales al respaldo de referencia o registradas como nuevas.
8. **Respaldo definitivo** (phpMyAdmin/`mysqldump --single-transaction`): verificar sin errores de exportación, 28 tablas, `COMMIT` final, SHA-256 anotado, copia fuera del repositorio y en segundo disco. Restaurarlo en MySQL 8.0.22 local desechable y comparar conteos. ✋ aprobar respaldo como válido.
9. **Migración 07** (aditiva e idempotente; el DDL de MySQL confirma implícitamente cada sentencia y **no se puede revertir con ROLLBACK**: si se interrumpe, se verifica qué existe y se vuelve a ejecutar el archivo completo, que omite lo ya creado; no se usa `rollback_07` en producción). ✋ aprobar ejecución.
10. Verificar: tablas, índices, claves foráneas (consulta 1 de `verificacion_migraciones_03_07.sql`, filas `07` con `presente=1`), conteos idénticos a los del paso 7, 0 filas en las tablas de actas.
11. **Git:** merge de `feature/v2.2-actas` a `main` y push (o Pull Request). ✋ aprobar merge y push.
12. Render despliega v2.2 con `MAINTENANCE_MODE=true` aún activo y `ACTAS_ENABLED=false`; esperar `GET /health` = 200 (arranque en frío).
13. Verificación pública **de solo lectura** con la sesión abierta: Inventario (contadores, filtros, AGOTADO), Informática, Oficinas, Cocina, Almacén, Levantamientos, Sedes, Movimientos, Reportes, Auditoría, Usuarios, calendario (un día con movimientos conocidos contra la bitácora), registros de Render sin 500. ✋ aprobar resultado.
14. **Reabrir:** `MAINTENANCE_MODE=false` (o eliminarla); sondeo: el login con `{}` vuelve a dar 400/401. Cerrar la sesión abierta e iniciar una nueva. Una escritura de bajo riesgo acordada y revisión de la bitácora.
15. Actas: **solo con autorización adicional**, en otra ventana: `ACTAS_ENABLED=true`, permisos `act:*` a quien se decida, acta de prueba con un artículo de bajo valor, PDF y descuento exacto. Devolución vinculada: pendiente de desarrollo.

## 5. Recuperación
| Fallo en | Acción |
|---|---|
| Paso 5–6 (mantenimiento no activa) | No continuar; revisar valor exacto `true` y logs; no tocar la base. |
| Paso 8 (respaldo inválido) | Repetir exportación; no migrar sin respaldo verificado. |
| Paso 9 (migración 07) | Verificar objetos existentes y repetir el archivo completo; con actas apagadas el código no usa esas tablas. Si no se resuelve: restaurar el respaldo en una base **nueva** y apuntar `DB_NAME` tras comparar. |
| Paso 12–13 (despliegue/verificación) | En Render, volver al despliegue anterior (`d5d06fe`); la base es compatible (solo objetos aditivos); mantenimiento sigue activo. |
| Tras reabrir | `ACTAS_ENABLED=false`; si persiste, desplegar el anterior; restaurar datos solo con autorización. |

## 6. Riesgos pendientes
Estado del solapamiento de instancias en Render (M-03), valores no reconocidos de la variable (M-01), imposibilidad de iniciar sesión durante la ventana (M-02), devolución vinculada pendiente, rendimiento con más volumen no medido, y que la migración 07 no se ha ejecutado nunca sobre datos reales (sí sobre la estructura y datos del respaldo restaurados en MySQL 8.0.22).
