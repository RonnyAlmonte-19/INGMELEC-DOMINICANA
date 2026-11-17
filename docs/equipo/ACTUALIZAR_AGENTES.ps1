# Actualiza .claude\agents desde docs\equipo\agents.
# - Agentes nuevos: se instalan.
# - Idénticos: se omiten.
# - Distintos: pide confirmación (S/N) antes de sobrescribir; guarda copia .bak.
# Ejecutar desde la raíz del proyecto:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\docs\equipo\ACTUALIZAR_AGENTES.ps1
$dest = ".claude\agents"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Get-ChildItem "docs\equipo\agents\ing-*.md" | ForEach-Object {
  $t = Join-Path $dest $_.Name
  if (-not (Test-Path $t)) { Copy-Item $_.FullName $t; Write-Host "Instalado: $($_.Name)"; return }
  if ((Get-FileHash $t).Hash -eq (Get-FileHash $_.FullName).Hash) { Write-Host "Sin cambios: $($_.Name)"; return }
  $r = Read-Host "Sobrescribir $($_.Name)? (S/N)"
  if ($r -match '^[sS]') { Copy-Item $t "$t.bak" -Force; Copy-Item $_.FullName $t -Force; Write-Host "Actualizado (copia .bak): $($_.Name)" } else { Write-Host "Conservado: $($_.Name)" }
}
