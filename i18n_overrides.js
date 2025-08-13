
// Safe text overrides: no logic changed, just replacing displayed strings by data-i18n keys.
(function(){
  const TEXTS={
    de:{
      title_check:"Bitte überprüfen Sie Ihre bereits erfassten Daten",
      subtitle_check:"Die angezeigten Daten wurden im Rahmen des vorangegangenen Verfahrens erhoben und werden zur Kontrolle angezeigt.",
      field_creditor:"Gläubiger‑Nr.",
      field_firstname:"Vorname",
      field_lastname:"Nachname",
      field_street:"Strasse",
      field_houseno:"Nr.",
      field_zip:"PLZ",
      field_city:"Ort",
      field_country:"Land",
      title_iban:"Angabe Ihrer Bankverbindung",
      field_iban:"IBAN",
      legend_consent:"Bestätigung & Einwilligung",
      check_correct:"Ich bestätige, dass die Angaben korrekt sind.",
      check_privacy:"Ich stimme der Verarbeitung gemäss Datenschutzhinweisen zu.",
      btn_send:"Senden",
      link_privacy:"Datenschutzhinweise",
      err_iban_invalid:"Bitte eine gültige IBAN eingeben (Format & Prüfsumme).",
      err_consents:"Um fortzufahren, bestätigen Sie bitte beide Kontrollkästchen."
    },
    en:{
      title_check:"Please check the data you have already provided",
      subtitle_check:"The displayed data was collected during the previous proceedings and is shown here for your review.",
      field_creditor:"Creditor no.",
      field_firstname:"First name",
      field_lastname:"Last name",
      field_street:"Street",
      field_houseno:"No.",
      field_zip:"ZIP",
      field_city:"City",
      field_country:"Country",
      title_iban:"Provide your bank details",
      field_iban:"IBAN",
      legend_consent:"Confirmation & Consent",
      check_correct:"I confirm that the information is correct.",
      check_privacy:"I agree to the processing according to the privacy notice.",
      btn_send:"Submit",
      link_privacy:"Privacy notice",
      err_iban_invalid:"Please enter a valid IBAN (format & checksum).",
      err_consents:"To proceed, please check both boxes."
    },
    it:{
      title_check:"Si prega di verificare i dati già inseriti",
      subtitle_check:"I dati visualizzati sono stati raccolti nel corso del procedimento precedente e sono riportati qui per la sua verifica.",
      field_creditor:"Numero del creditore",
      field_firstname:"Nome",
      field_lastname:"Cognome",
      field_street:"Via",
      field_houseno:"Nr.",
      field_zip:"CAP",
      field_city:"Città",
      field_country:"Paese",
      title_iban:"Fornire i dati bancari",
      field_iban:"IBAN",
      legend_consent:"Conferma e Consenso",
      check_correct:"Confermo che i dati forniti sono corretti.",
      check_privacy:"Acconsento al trattamento dei miei dati secondo l’Informativa privacy.",
      btn_send:"Invia",
      link_privacy:"Informativa privacy",
      err_iban_invalid:"Inserire un IBAN valido (formato e checksum).",
      err_consents:"Per continuare, selezioni entrambe le caselle di controllo."
    }
  };
  function norm(l){ l=(l||document.documentElement.lang||'de').toLowerCase(); return l==='it'?'it':(l==='en'?'en':'de'); }
  function apply(map){
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const k=el.getAttribute('data-i18n'); if(map[k]) el.textContent=map[k];
    });
  }
  window.addEventListener('DOMContentLoaded',()=>{
    const qs=new URLSearchParams(location.search);
    const lang=norm(qs.get('lang'));
    apply(TEXTS[lang]||TEXTS.de);
  });
})();
