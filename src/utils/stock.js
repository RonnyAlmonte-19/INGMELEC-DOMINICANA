// v2.2: AGOTADO se calcula desde cantidad_num (no existe columna redundante).
// Solo cuenta como agotado un 0 verificado; NULL ("pendiente de verificación") NO es agotado.
export function isAgotado(articulo) {
  const v = articulo?.cantidad_num;
  if (v === null || v === undefined || v === '') return false;
  return Number(v) === 0;
}
