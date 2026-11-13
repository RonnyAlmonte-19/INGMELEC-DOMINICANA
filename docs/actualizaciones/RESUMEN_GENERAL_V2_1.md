# RESUMEN GENERAL DEL PROYECTO — INGMELEC | ALMACÉN GENERAL v2.1

**Rama:** `develop/almacen-v2.1`  
**Veredicto Técnico Final:** **APTO LOCALMENTE**

---

## 1. Estado de las Ocho Etapas del Plan Maestro

| Etapa | Descripción | Estado | Pruebas / Evidencia |
| :---: | :--- | :---: | :--- |
| **Etapa 1** | Preparación, versión y aislamiento local (`127.0.0.1:3310`) | **Aprobada localmente** | `7 / 7 PASS` (`etapa01_isolation_qa`) |
| **Etapa 2** | Autenticación, autorización, TLS CA, CORS, rate limit y seguridad | **Aprobada localmente** | `9 / 9 PASS` (`etapa02_security_qa`) |
| **Etapa 3** | Errores React #31, compatibilidad MySQL 8 y resiliencia BD | **Aprobada localmente** | `12 / 12 PASS` (`etapa03_react_mysql8_qa`) |
| **Etapa 4** | Campamentos, alias canónicos y reasignaciones seguras | **Aprobada localmente** | `8 / 8 PASS` (`etapa04_campamentos_alias_qa`) |
| **Etapa 5** | Usuarios, RBAC granular (20 permisos) y barra lateral dinámica | **Aprobada localmente** | `4 / 4 PASS` (`etapa05_rbac_permissions_qa`) |
| **Etapa 6** | Inventario, movimientos `FOR UPDATE`, FKs y consolidación ACID | **Aprobada localmente** | `4 / 4 PASS` (`etapa06_inventory_consolidate_qa`) |
| **Etapa 7** | Dashboard, reportes, exportación `.xlsx`/CSV segura, sync UI y UX | **Aprobada localmente** | `4 / 4 PASS` (`etapa07_dashboard_reports_ux_qa`) |
| **Etapa 8** | Auditoría final, seguridad integral, E2E Chromium y documentación | **Aprobada localmente** | `3 / 3 PASS` (`etapa08_security_db_qa` + `etapa08_browser_e2e_qa`) |

**Total acumulado:** **51 / 51 pruebas automatizadas aprobadas (`100% PASS`)**, compilación Vite limpia (`4.60s`), `0` errores ESLint en archivos modificados y `0` vulnerabilidades en `npm audit --omit=dev`.

---

## 2. Notas Técnicas de Dependencias para la Futura "Hoja de Asignación" (No Implementada)
- El módulo de **Hoja de Asignación** queda excluido de `v2.1` conforme a la especificación del propietario.
- Para su desarrollo futuro, ya cuenta con:
  1. Custodios normalizados (`inv_custodios` con `departamento` y `telefono` en `migration_03`).
  2. Sedes y almacenes homologados por códigos estables (`ALM-27FEB`, `CAMP-OPL`, `CAMP-M633`).
  3. Movimientos de tipo `ASIGNACION` / `DEVOLUCION` con llaves foráneas `ON DELETE RESTRICT` y auditoría transaccional en `inv_auditoria`.
