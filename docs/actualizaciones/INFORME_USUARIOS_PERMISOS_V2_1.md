# INFORME DE USUARIOS, ROLES Y PERMISOS — INGMELEC | ALMACÉN GENERAL v2.1

**Rama:** `develop/almacen-v2.1`  
**Evaluación:** Equipo A + Equipo C (Navegador Real)

---

## 1. Regla de Gobierno y Visibilidad (12 Módulos y 20 Permisos)
- **Developer único:** Único rol con acceso a `/usuarios` y `/api/v2/usuarios*` (`requireDeveloper`). No puede ser desactivado ni duplicado.
- **20 Permisos Granulares (`src/utils/permissions.js` <-> `almacenApi.js`):**
  - `dash:ver`, `aud:ver`
  - `inv:ver`, `inv:crear`, `inv:editar`, `inv:movimientos_registrar`, `inv:movimientos_ver`, `inv:eliminar`
  - `lev:ver`, `lev:crear`, `lev:capturar`, `lev:editar`, `lev:importar`, `lev:consolidar`
  - `rep:ver`, `rep:exportar`, `rep:imprimir`
  - `camp:ver`, `camp:stock`, `camp:operar`
- **Sincronización Sidebar <-> URL <-> API:**
  - Si Developer autoriza un módulo, aparece en `Sidebar.jsx` y es accesible por ruta.
  - Si Developer no lo autoriza, desaparece de `Sidebar.jsx`, el acceso directo por URL muestra `"Acceso Denegado al Módulo"` (403 UI) o redirige al primer módulo autorizado (`getFirstAuthorizedPage`), y la API responde `HTTP 403`.

---

## 2. Verificación de los 4 Escenarios del Módulo `Movimientos`
Probados tanto en API (`etapa08_security_db_qa.test.mjs`) como en Chromium real (`etapa08_browser_e2e_qa.test.mjs`):

| Escenario | Sidebar / URL `/movimientos` | `GET /api/v2/movimientos` | `POST /api/v2/movimientos` | Comportamiento UI |
| :--- | :---: | :---: | :---: | :--- |
| **Solo `inv:movimientos_registrar`** | Visible / Permitido | No se invoca desde UI (API: `403`) | `200` (solo sede asignada; `403` otra sede) | Muestra botón `Registrar Movimiento` y aviso `"Historial de movimientos restringido"` sin errores `403` |
| **Solo `inv:movimientos_ver`** | Visible / Permitido | `200` (filtrado por sede) | `403` | Muestra bitácora y oculta botón `Registrar Movimiento` |
| **Ambos permisos** | Visible / Permitido | `200` | `200` | Bitácora y registro operativos dentro de su sede |
| **Ningún permiso** | Oculto / Bloqueado | `403` | `403` | Módulo ausente en Sidebar; ruta redirige o muestra bloqueo |
