# Copia las definiciones de agentes a .claude\agents SIN sobrescribir los existentes.
# Ejecutar desde la raíz del proyecto:  powershell -File docs\equipo\INSTALAR_AGENTES.ps1
$dest = ".claude\agents"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Get-ChildItem "docs\equipo\agents\*.md" | ForEach-Object {
  $t = Join-Path $dest $_.Name
  if (Test-Path $t) { Write-Host "Existe, se conserva: $($_.Name)" } else { Copy-Item $_.FullName $t; Write-Host "Instalado: $($_.Name)" }
}
Write-Host "Listo. Abra Claude Code en el proyecto y ejecute /agents para verificar."
