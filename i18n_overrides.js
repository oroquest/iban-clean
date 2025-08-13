
// Safe text overrides: no logic changed, just replacing displayed strings by data-i18n keys.
(function(){
  const TEXTS={
    de:{
      title_check:"Bitte bestätigen Sie Ihre bereits erfassten Daten",
      subtitle_check:"Diese Angaben stammen aus Ihrem bestehenden Prozess und sind nur zur Kontrolle sichtbar.",
      field_creditor:"Gläubiger‑Nr.",
      field_firstname:"Vorname",
      field_lastname:"Nachname",
      field_street:"Strasse",
      field_houseno:"Nr.",
      field_zip:"PLZ",
      field_city:"Ort",
      field_country:"Land",
      title_iban:"IBAN erfassen",
      field_iban:"IBAN*",
      legend_consent:"Bestätigungen",
      check_correct:"Ich bestätige, dass die Angaben korrekt sind.",
      check_privacy:"Ich stimme der Verarbeitung gemäss Datenschutzhinweisen zu.",
      btn_send:"Senden",
      link_privacy:"Datenschutzhinweise",
      err_iban_invalid:"Bitte eine gültige IBAN eingeben (Format & Prüfsumme).",
      err_consents:"Bitte beide Häkchen setzen, um fortzufahren."
    },
    en:{
      title_check:"Please confirm your already provided data",
      subtitle_check:"The following information is from your existing process and is shown for review only.",
      field_creditor:"Creditor no.",
      field_firstname:"First name",
      field_lastname:"Last name",
      field_street:"Street",
      field_houseno:"No.",
      field_zip:"ZIP",
      field_city:"City",
      field_country:"Country",
      title_iban:"Enter IBAN",
      field_iban:"IBAN*",
      legend_consent:"Confirmations",
      check_correct:"I confirm that the information is correct.",
      check_privacy:"I agree to the processing according to the privacy notice.",
      btn_send:"Submit",
      link_privacy:"Privacy notice",
      err_iban_invalid:"Please enter a valid IBAN (format & checksum).",
      err_consents:"Please tick both checkboxes to proceed."
    },
    it:{
      title_check:"Per favore conferma il tuo indirizzo",
      subtitle_check:"I campi sono precompilati e possono essere aggiornati se necessario.",
      field_creditor:"Numero del creditore",
      field_firstname:"Nome",
      field_lastname:"Cognome",
      field_street:"Via",
      field_houseno:"Nr.",
      field_zip:"CAP",
      field_city:"Città",
      field_country:"Paese",
      title_iban:"Inserisci IBAN",
      field_iban:"IBAN*",
      legend_consent:"Conferme",
      check_correct:"Confermo che i dati forniti sono corretti.",
      check_privacy:"Acconsento al trattamento dei miei dati secondo l’Informativa privacy.",
      btn_send:"Invia",
      link_privacy:"Informativa privacy",
      err_iban_invalid:"Inserire un IBAN valido (formato e checksum).",
      err_consents:"Seleziona entrambe le caselle per procedere."
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
