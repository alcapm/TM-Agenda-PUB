// ==UserScript==
// @name         Agenda - Cargar Nuevo Recurso (con claves cifradas)
// @namespace    http://tampermonkey.net/
// @version     0.0.1
// @updateURL   https://raw.githubusercontent.com/alcapm/TM-Agenda-PUB/main/agenda.user.js
// @downloadURL https://raw.githubusercontent.com/alcapm/TM-Agenda-PUB/main/agenda.user.js
// @homepageURL https://github.com/alcapm/TM-Agenda-PUB/
// @description  Carga recursos y traduce títulos, con API keys cifradas.
// @author       Tú
// @match        https://repositorio.holaislascanarias.com/*
// @require      https://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js
// @require      https://crypto.stanford.edu/sjcl/sjcl.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function(){
  'use strict';

  // -------------------------------------------------------------------
  // 1) Gestión de la clave maestra y funciones de cifrado/descifrado
  // -------------------------------------------------------------------
  let masterKey = GM_getValue('masterKey','');
  if (!masterKey) {
    masterKey = prompt(
      '🔒 No hay clave maestra configurada para este script.\n' +
      'Por favor, introduce una frase secreta PERSONAL (privada):',
      ''
      );
    if (!masterKey) {
      alert('Necesitas una clave maestra para continuar. Recarga la página y prueba de nuevo.');
      return;
    }
    GM_setValue('masterKey', masterKey);
  }

  function encryptAndStore(clearText){
    return JSON.stringify(sjcl.encrypt(masterKey, clearText));
  }

  function decryptOrPrompt(storedJson, promptText, storageKey){
    let value;
    if (storedJson){
      try {
        value = sjcl.decrypt(masterKey, JSON.parse(storedJson));
      } catch(e){
        // si falla descifrado, pedimos de nuevo
        console.warn('Fallo al descifrar «'+storageKey+'», pide de nuevo.');
        value = null;
      }
    }
    if (!value){
      value = prompt(`${promptText} no configurada. Introdúcela ahora:`, '');
      if (value) {
        GM_setValue(storageKey, encryptAndStore(value));
      }
    }
    return value;
  }

  function changeMasterKey(){
    const old = masterKey;
    const nuevo = prompt('🔄 Cambia la frase maestra (Atención: invalidará las claves previas):','');
    if (nuevo){
      masterKey = nuevo;
      GM_setValue('masterKey', nuevo);
      // eliminamos las claves antiguas para forzar re-prompt
      GM_setValue('translateKey','');
      GM_setValue('sheetsKey','');
      alert('Frase maestra cambiada. Tendrás que reingresar tus API keys.');
    }
  }

  GM_registerMenuCommand('🔑 Cambiar frase maestra', changeMasterKey);

  // -------------------------------------------------------------------
  // 2) Recuperamos las API keys (descifradas o pidiendo al usuario)
  // -------------------------------------------------------------------
  const translateKey = decryptOrPrompt(
    GM_getValue('translateKey',''),
    'API Key de Google Translate',
    'translateKey'
    );
  const sheetsKey = decryptOrPrompt(
    GM_getValue('sheetsKey',''),
    'API Key de Google Sheets',
    'sheetsKey'
    );
  // comandos de menú para cambiar cada una sin tocar la maestra
  GM_registerMenuCommand('✏️ Cambiar Google Translate Key', () => {
    GM_setValue('translateKey',''); location.reload();
  });
  GM_registerMenuCommand('✏️ Cambiar Google Sheets Key', () => {
    GM_setValue('sheetsKey',''); location.reload();
  });
  if (!translateKey || !sheetsKey){
    alert('Faltan API keys: el script no puede continuar.');
    return;
  }

  // -------------------------------------------------------------------
  // 3) Tu lógica original, referenciando translateKey y sheetsKey
  // -------------------------------------------------------------------
  const currentURL = window.location.href;

  function traducirTitulo(){
    const inputEn = document.getElementById("edit-en");
    if (!inputEn) {
      console.error('No se encontró el input con id "edit-en"');
      return;
    }
    const textoEn = inputEn.value;
    const translateURL = `https://translation.googleapis.com/language/translate/v2?key=${translateKey}`;
    function traducirYDepositar(texto, targetLang, inputId){
      fetch(translateURL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({q:texto, target:targetLang, format:'text'})
      })
      .then(r=>r.json())
      .then(data=>{
        const tx = data?.data?.translations?.[0]?.translatedText;
        if (tx){
          const inp = document.getElementById(inputId);
          if (inp) inp.value = tx;
          else console.error(`No existe input #${inputId}`);
        } else console.error('Error en la traducción', data);
      })
      .catch(e=>console.error('Error fetch translate:', e));
    }
    // idiomas...
    ['nl','hu','da','fr','pl','sv','it','nb','fi','cs','ru','de','pt-pt']
    .forEach(lang=>{
      traducirYDepositar(textoEn, lang, `edit-${lang}`);
    });
  }

  function cargarContenido(){
    const urlParams = new URLSearchParams(location.search);
    const recordID = urlParams.get('recordID');
    if (recordID){
      obtenerContenidoFila(
        'https://docs.google.com/spreadsheets/d/1cNf7puC5qZhdazyzly7tGiNT5FAY5xsjQeyeh6VjXMo/edit?usp=sharing',
        recordID
        );
      return;
    }
    // Crear el modal
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';

        // Crear el contenido del modal
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#fff';
    modalContent.style.padding = '20px';
    modalContent.style.borderRadius = '8px';
    modalContent.style.textAlign = 'center';

        // Etiqueta para el input de URL
    const label = document.createElement('label');
    label.textContent = 'Introduce la URL de la celda:';
    modalContent.appendChild(label);

        // Input de URL
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'https://docs.google.com/spreadsheets/d/1cNf7puC5qZhdazyzly7tGiNT5FAY5xsjQeyeh6VjXMo/edit?usp=sharing';
    input.style.width = '100%';
    input.style.marginTop = '10px';
    input.style.padding = '10px';
    input.style.border = '1px solid #ccc';
    input.style.borderRadius = '4px';
    input.style.display = 'none';
    modalContent.appendChild(input);

        // Input para buscar el valor en la columna N
    const valueLabel = document.createElement('label');
    valueLabel.textContent = 'Id de Airtable:';
    valueLabel.style.marginTop = '20px';
    modalContent.appendChild(valueLabel);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.style.width = '100%';
    valueInput.style.marginTop = '10px';
    valueInput.style.padding = '10px';
    valueInput.style.border = '1px solid #ccc';
    valueInput.style.borderRadius = '4px';
    modalContent.appendChild(valueInput);

        // Botón para cargar el contenido
    const button = document.createElement('button');
    button.textContent = 'Cargar';
    button.style.marginTop = '20px';
    button.style.padding = '10px 20px';
    button.style.backgroundColor = '#007bff';
    button.style.color = '#fff';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';

        // Acción al hacer clic en el botón "Cargar"
    button.onclick = function() {
      const url = input.value;
      const valueToSearch = valueInput.value;
      if (url && valueToSearch) {
        console.log(`URL: ${url}, Valor para buscar: ${valueToSearch}`);
        obtenerContenidoFila(url, valueToSearch);
                document.body.removeChild(modal); // Cerrar el modal
              } else {
                alert('Por favor, introduce una URL y un valor para buscar.');
              }
            };

            modalContent.appendChild(button);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
          }

          function obtenerContenidoFila(sheetUrl, valueToSearch){
            const sheetId = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)[1];
            const sheetsURL = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A:Z?key=${sheetsKey}`;
            fetch(sheetsURL)
            .then(r=>r.json())
            .then(data=>{
              const filas = data.values||[];
              const fila = filas.find(f=>f[23]===valueToSearch);
              if (fila) colocarValoresEnInputs(fila);
              else mostrarErrorModal('No se encontró fila con ese ID.');
            })
            .catch(e=>console.error('Error fetch sheets:',e));
          }

  // Función para colocar los valores de la fila en los inputs correspondientes
          function colocarValoresEnInputs(fila) {
            const inputTitle = document.getElementById("edit-title-0-value");
            if (inputTitle) {inputTitle.value = fila[1];} else {console.error(`No se encontró el input con id "edit-title-0-value"`);}
            const inputFechaDesde = document.getElementById("edit-field-fecha-desde-0-value-date");
            if (inputFechaDesde) {inputFechaDesde.value = formatearFecha(fila[3]);} else {console.error(`No se encontró el input con id "edit-field-fecha-desde-0-value-date"`);}
            const inputFechaHasta = document.getElementById("edit-field-fecha-hasta-0-value-date");
            if (inputFechaHasta) {inputFechaHasta.value = formatearFecha(fila[4]);} else {console.error(`No se encontró el input con id "edit-field-fecha-hasta-0-value-date"`);}
            const inputLocalidad = document.getElementById("edit-field-localidad-0-value");
            if (inputLocalidad) {inputLocalidad.value = fila[8];} else {console.error(`No se encontró el input con id "edit-field-localidad-0-value"`);}
            const inputLatitud = document.getElementById("edit-field-latitud-0-value");
            if (inputLatitud) {inputLatitud.value = parseFloat(fila[9].replace(",", "."));} else {console.error(`No se encontró el input con id "edit-field-latitud-0-value"`);}
            const inputLongitud = document.getElementById("edit-field-longitud-0-value");
            if (inputLongitud) {inputLongitud.value = parseFloat(fila[10].replace(",", "."));} else {console.error(`No se encontró el input con id "edit-field-longitud-0-value"`);}
            const inputWeb = document.getElementById("edit-field-website-0-uri");
            if (inputWeb) {inputWeb.value = fila[13];} else {console.error(`No se encontró el input con id "edit-field-website-0-uri"`);}
            const inputTickets = document.getElementById("edit-field-web-venta-tickets-0-uri");
            if (inputTickets) {inputTickets.value = fila[15];} else {console.error(`No se encontró el input con id "edit-field-web-venta-tickets-0-uri"`);}
            const inputDescription = document.getElementById("edit-field-descripcion-0-value");
            if (inputDescription) {inputDescription.value = fila[19];} else {console.error(`No se encontró el input con id "edit-field-descripcion-0-value"`);}
            const selectIsla = document.getElementById("edit-field-isla");
            if (fila[6] === "El Hierro") {
              selectIsla.selectedIndex = 1;
            } else if (fila[6] === "Fuerteventura") {
              selectIsla.selectedIndex = 2;
            } else if (fila[6] === "Gran Canaria") {
              selectIsla.selectedIndex = 3;
            } else if (fila[6] === "La Gomera") {
              selectIsla.selectedIndex = 4;
            } else if (fila[6] === "La Graciosa") {
              selectIsla.selectedIndex = 5;
            } else if (fila[6] === "La Palma") {
              selectIsla.selectedIndex = 6;
            } else if (fila[6] === "Lanzarote") {
              selectIsla.selectedIndex = 7;
            } else if (fila[6] === "Tenerife") {
              selectIsla.selectedIndex = 8;
            }
            const selectPrice = document.getElementById("edit-field-gratis");
            if (fila[14] === "TRUE"){selectPrice.selectedIndex = 1;}else{selectPrice.selectedIndex = 2;}
            const selectAge = document.getElementById("edit-field-edad-recomendada");
            if (fila[16] === "Bebes/Infantil"){selectAge.selectedIndex = 1;}
            else if (fila[16] === "Sólo adultos"){selectAge.selectedIndex = 2;}
            else if (fila[16] === "Todos los Públicos"){selectAge.selectedIndex = 3;}
          }

    // Función para extraer el ID de la hoja desde la URL
          function extractSheetId(url) {
            const regex = /spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
            const match = url.match(regex);
            return match ? match[1] : null;
          }

          function formatearFecha(fecha) {
            const [dia, mes, anio] = fecha.split('/');
            return `${anio}-${mes}-${dia}`;
          }

          function mostrarErrorModal(message) {
        // Crear el modal de error
            const errorModal = document.createElement('div');
            errorModal.style.position = 'fixed';
            errorModal.style.top = '0';
            errorModal.style.left = '0';
            errorModal.style.width = '100%';
            errorModal.style.height = '100%';
            errorModal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            errorModal.style.display = 'flex';
            errorModal.style.alignItems = 'center';
            errorModal.style.justifyContent = 'center';
            errorModal.style.zIndex = '10000';

        // Crear el contenido del modal de error
            const errorModalContent = document.createElement('div');
            errorModalContent.style.backgroundColor = '#fff';
            errorModalContent.style.padding = '20px';
            errorModalContent.style.borderRadius = '8px';
            errorModalContent.style.textAlign = 'center';

            const errorText = document.createElement('p');
            errorText.textContent = message;
            errorModalContent.appendChild(errorText);

            const closeButton = document.createElement('button');
            closeButton.textContent = 'Cerrar';
            closeButton.style.marginTop = '20px';
            closeButton.style.padding = '10px 20px';
            closeButton.style.backgroundColor = '#dc3545';
            closeButton.style.color = '#fff';
            closeButton.style.border = 'none';
            closeButton.style.borderRadius = '4px';
            closeButton.style.cursor = 'pointer';

            closeButton.onclick = function() {
            document.body.removeChild(errorModal); // Cerrar el modal
          };

          errorModalContent.appendChild(closeButton);
          errorModal.appendChild(errorModalContent);
          document.body.appendChild(errorModal);
        }

  // Botones en el footer
        const cont = document.createElement('div');
        cont.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;background:#333;color:#fff;text-align:center;padding:10px;z-index:1000;display:flex;gap:10px;justify-content:center;';
        if (currentURL.includes('/node/add/event') || (currentURL.includes('/node/') && currentURL.includes('/edit'))){
          const btn = document.createElement('button');
          btn.textContent = 'Cargar'; btn.style.padding='10px';
          btn.onclick = cargarContenido;
          cont.appendChild(btn);
        } else if (currentURL.includes('/admin/traducir')){
          const btn = document.createElement('button');
          btn.textContent = 'Traducir Título'; btn.style.padding='10px';
          btn.onclick = traducirTitulo;
          cont.appendChild(btn);
        }
        if (cont.children.length>0) document.body.appendChild(cont);

      })();
