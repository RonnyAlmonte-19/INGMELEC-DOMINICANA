-- =================================================================================
-- INGMELEC | ALMACÉN GENERAL (v2.1 — ETAPA 5 ADAPTADA)
-- ARCHIVO: server/database/migrations/migration_05_v21_adapted.sql
-- OBJETIVO: Validación y conservación estricta de usuarios, hashes y permisos originales
--           SIN MODIFICAR permisos_json, password_hash, roles ni estados de los 8 usuarios.
-- =================================================================================

SET NAMES utf8mb4;

-- 1. Verificación de integridad: Validar que todos los usuarios poseen JSON válido
SELECT 
  COUNT(*) AS total_usuarios_validados,
  SUM(CASE WHEN `permisos_json` IS NULL OR JSON_VALID(COALESCE(`permisos_json`, '')) = 0 THEN 1 ELSE 0 END) AS usuarios_json_invalido
FROM `inv_usuarios`;

-- 2. Registro de auditoría del estado RBAC intacto
SELECT 
  id, nombre, email, rol, activo, es_developer,
  JSON_VALID(COALESCE(permisos_json, '')) AS json_valido,
  JSON_LENGTH(permisos_json) AS total_permisos,
  '[migration_05_adapted] Permisos originales conservados intactos al 100%.' AS estado_migracion
FROM `inv_usuarios`
ORDER BY id;
