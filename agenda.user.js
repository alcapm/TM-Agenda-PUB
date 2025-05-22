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
    // ... (tu modal aquí, sin cambios)
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

  // ... resto de tus funciones formatearFecha(), colocarValoresEnInputs(), mostrarErrorModal(), etc.

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
