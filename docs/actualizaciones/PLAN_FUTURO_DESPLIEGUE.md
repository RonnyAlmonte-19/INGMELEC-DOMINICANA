# PLAN FUTURO DE DESPLIEGUE (EXCLUSIVAMENTE DOCUMENTAL)

> **ADVERTENCIA:** Este documento es una guía técnica para cuando el propietario autorice expresamente publicar `v2.1`. **Ninguno de estos pasos ha sido ejecutado.**

---

## 1. Precondiciones Obligatorias Antes de Publicar
1. Confirmar aprobación explícita del propietario sobre `develop/almacen-v2.1`.
2. Obtener respaldo completo verificado (dump SQL) de la base productiva en **Clever Cloud** antes de cualquier migración.
3. Verificar variables de entorno en **Render**:
   - `JWT_SECRET` (>= 32 caracteres aleatorios).
   - `DB_SSL=true` y `DB_SSL_ALLOW_INSECURE=false` (usando `server/certs/clever-cloud-mysql-ca.pem`).
   - `ALLOWED_ORIGINS` con el dominio exacto de producción.
   - `NODE_ENV=production` y `TRUST_PROXY` acorde a Render.

## 2. Orden Estricto de Migraciones en Clever Cloud (MySQL 8.0)
*(Asumiendo `migration_01` y `migration_02` ya aplicadas en v2.0)*:
1. `server/database/migrations/migration_03_v21_seguridad_y_esquema.sql` (`token_version`, `ENUM`s y columnas v2.1).
2. `server/database/migrations/migration_04_v21_campamentos_alias.sql` (`inv_campamento_alias` + alias base). *(Opcional previa autorización: agregar alias corto `'27 DE FEBRERO'` a `ALM-27FEB`)*.
3. `server/database/migrations/migration_05_v21_rbac_y_permisos.sql` (alineación `permisos_json` base).
4. `server/database/migrations/migration_06_v21_integridad_fk_indices.sql` (verificación de huérfanos, FKs `ON DELETE RESTRICT` e índices compuestos).

## 3. Publicación y Verificación Post-Despliegue
1. Revisar `git diff` y hacer merge controlado `develop/almacen-v2.1` -> rama objetivo tras autorización.
2. Desplegar en Render y verificar `GET /health` (`200 OK`).
3. Validar login `developer`, recarga de página, selector de campamentos y consulta de inventario real (`es_sintetico = 0`).
4. En caso de contingencia, utilizar el respaldo SQL previo y el plan de reversión documentado en `README_MIGRACIONES.md` y `rollback_clever_cloud_produccion.sql`.
