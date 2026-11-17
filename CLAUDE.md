# INGMELEC | ALMACÉN GENERAL — instrucciones del proyecto

Stack: React 19 + Vite + Tailwind (src/) · Node/Express ESM (server/, rutas en server/routes/almacenApi.js) · MySQL en Clever Cloud · Render.
Producción: rama `main`. Último commit publicado conocido: `d5d06fe` (verificar con `git log` antes de actuar).
Tests: `server/tests/*.test.mjs` sobre MariaDB local aislada (puerto 3310). Nunca contra Clever Cloud.

## Reglas permanentes
- Sin autorización explícita NO: tocar producción, migraciones productivas, datos/usuarios reales, push, merge a main, despliegue Render, scripts de recuperación.
- No `git reset --hard`, no force push, no borrar archivos de trabajo, no revelar secretos.
- No declarar pruebas aprobadas sin ejecutarlas. No declarar agentes funcionando si solo están definidos.
- Trabajar en rama de desarrollo; commits solo cuando el usuario lo pida.

## Equipo (fuentes en docs/equipo/agents/; se instalan en .claude/agents/ con docs/equipo/INSTALAR_AGENTES.ps1; prefijo ing-)
director, architect, frontend, backend, db, security, devops, qa, uiux, integrations, performance, analyst, writer, ai-automation, mobile.

## Ahorro de tokens (obligatorio)
1. Tareas simples: trabajar directo, sin subagentes. Solo el coordinador/principal activo por defecto.
2. Máx. 2 subagentes simultáneos; sin cadenas ni revisiones repetidas; no duplicar análisis.
3. Estimar coste de contexto (BAJO/MEDIO/ALTO) antes de tareas extensas; si es ALTO, proponer alternativa y pedir autorización.
4. Leer solo lo necesario; grep antes de abrir archivos grandes (almacenApi.js ≈ 8.500 líneas). No volcar archivos ni logs.
5. Modelo: el más económico suficiente (haiku/sonnet); opus solo arquitectura compleja, seguridad y errores difíciles.
6. No repetir auditorías con evidencia vigente (ver docs/auditorias/). Al terminar cada tarea, dejar un resumen de 5-10 líneas.
7. Escritura paralela solo con worktrees; nunca dos agentes sobre los mismos archivos.

## Flujo
analizar → alcance/riesgos → plan → especialistas → rama dev → revisión (ing-security si es sensible) → pruebas reales → informe → auditoría independiente de Antigravity (informe Markdown manual: docs/equipo/HANDOFF_ANTIGRAVITY.md) → correcciones autorizadas → aprobación del usuario antes de publicar.
