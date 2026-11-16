(function () {
  function isLocalDebugHost() {
    try {
      var hostname = window.location && window.location.hostname ? String(window.location.hostname).toLowerCase() : '';
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    } catch {
      return false;
    }
  }

  function appendErrorBanner(bgColor, titleText, sections) {
    if (!document.body) return;

    var errDiv = document.createElement('div');
    errDiv.style.position = 'fixed';
    errDiv.style.top = '0';
    errDiv.style.left = '0';
    errDiv.style.width = '100%';
    errDiv.style.backgroundColor = bgColor;
    errDiv.style.color = '#ffffff';
    errDiv.style.padding = '20px';
    errDiv.style.zIndex = '999999';
    errDiv.style.fontFamily = 'monospace';
    errDiv.style.fontSize = '14px';
    errDiv.style.whiteSpace = 'pre-wrap';
    errDiv.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3)';

    var strongTitle = document.createElement('strong');
    strongTitle.textContent = titleText;
    errDiv.appendChild(strongTitle);

    for (var i = 0; i < sections.length; i += 1) {
      var section = sections[i];
      errDiv.appendChild(document.createElement('br'));
      if (section.label) {
        errDiv.appendChild(document.createElement('br'));
        var strongLabel = document.createElement('strong');
        strongLabel.textContent = section.label;
        errDiv.appendChild(strongLabel);
        errDiv.appendChild(document.createElement('br'));
      }
      errDiv.appendChild(document.createTextNode(String(section.text)));
    }

    document.body.appendChild(errDiv);
  }

  window.addEventListener('error', function (event) {
    if (!isLocalDebugHost()) {
      appendErrorBanner('#ef4444', '❌ ERROR DE APLICACIÓN:', [
        { text: 'Se produjo un error inesperado en la interfaz. Recargue la página o contacte al administrador si el problema persiste.' }
      ]);
      return;
    }

    var messageText = event && event.message ? String(event.message) : 'Error de ejecución desconocido';
    var stackText = event && event.error && event.error.stack ? String(event.error.stack) : 'No stack trace';
    appendErrorBanner('#ef4444', '❌ ERROR RUNTIME DETECTADO:', [
      { text: messageText },
      { label: 'Stack:', text: stackText }
    ]);
  });

  window.addEventListener('unhandledrejection', function (event) {
    if (!isLocalDebugHost()) {
      appendErrorBanner('#f59e0b', '⚠️ ERROR DE OPERACIÓN:', [
        { text: 'No se pudo completar la operación solicitada. Recargue la página o intente nuevamente.' }
      ]);
      return;
    }

    var reason = event ? event.reason : null;
    var reasonText = reason instanceof Error
      ? (reason.stack || reason.message)
      : String(reason !== undefined && reason !== null ? reason : 'Razón desconocida');
    appendErrorBanner('#f59e0b', '⚠️ PROMESA RECHAZADA SIN MANEJO:', [
      { text: reasonText }
    ]);
  });
})();
