(function(){
  'use strict';
  const I18N = {
    de:{title_check:"Bitte bestätigen Sie Ihre bereits erfassten Daten",subtitle_check:"Diese Angaben stammen aus Ihrem bestehenden Prozess und sind nur zur Kontrolle sichtbar.",field_creditor:"Gläubiger‑Nr.",field_firstname:"Vorname",field_lastname:"Nachname",field_street:"Strasse",field_houseno:"Nr.",field_zip:"PLZ",field_city:"Ort",field_country:"Land",title_iban:"IBAN erfassen",field_iban:"IBAN*",legend_consent:"Bestätigungen",check_correct:"Ich bestätige, dass die Angaben korrekt sind.",check_privacy:"Ich stimme der Verarbeitung gemäss Datenschutzhinweisen zu.",btn_send:"Senden",link_privacy:"Datenschutzhinweise",err_invalid_link:"Der Zugriffslink ist ungültig oder abgelaufen.",err_iban_invalid:"Bitte eine gültige IBAN eingeben (Format & Prüfsumme).",err_consents:"Bitte beide Häkchen setzen, um fortzufahren."},
    en:{title_check:"Please confirm your already provided data",subtitle_check:"The following information is from your existing process and is shown for review only.",field_creditor:"Creditor no.",field_firstname:"First name",field_lastname:"Last name",field_street:"Street",field_houseno:"No.",field_zip:"ZIP",field_city:"City",field_country:"Country",title_iban:"Enter IBAN",field_iban:"IBAN*",legend_consent:"Confirmations",check_correct:"I confirm that the information is correct.",check_privacy:"I agree to the processing according to the privacy notice.",btn_send:"Submit",link_privacy:"Privacy notice",err_invalid_link:"The access link is invalid or has expired.",err_iban_invalid:"Please enter a valid IBAN (format & checksum).",err_consents:"Please tick both checkboxes to continue."},
    it:{title_check:"Per favore conferma il tuo indirizzo",subtitle_check:"I campi sono precompilati e possono essere aggiornati se necessario.",field_creditor:"Numero del creditore",field_firstname:"Nome",field_lastname:"Cognome",field_street:"Via",field_houseno:"Nr.",field_zip:"CAP",field_city:"Città",field_country:"Paese",title_iban:"Inserisci IBAN",field_iban:"IBAN*",legend_consent:"Conferme",check_correct:"Confermo che i dati forniti sono corretti.",check_privacy:"Acconsento al trattamento dei miei dati secondo l’Informativa privacy.",btn_send:"Invia",link_privacy:"Informativa privacy",err_invalid_link:"Il link di accesso non è valido o è scaduto.",err_iban_invalid:"Inserire un IBAN valido (formato e checksum).",err_consents:"Selezionare entrambe le caselle per continuare."}
  };
  const $ = (id)=>document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  function normLang(l){ l=(l||'de').toLowerCase(); return I18N[l]?l:'de'; }
  function applyI18n(lang){
    const dict = I18N[lang]||I18N.de;
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const key=el.getAttribute('data-i18n'); if(dict[key]) el.textContent=dict[key];
    });
    // select
    const sel = $('langSelect'); if (sel) sel.value = lang;
  }
  // IBAN helpers
  function ibanSanitize(s){ return String(s||'').toUpperCase().replace(/\s+/g,''); }
  function toNum(ch){ const c=ch.charCodeAt(0); if(c>=48&&c<=57) return ch; if(c>=65&&c<=90) return String(c-55); return ''; }
  function mod97Str(str){ let rem=0,buf=''; for(const ch of str){ buf+=toNum(ch); while(buf.length>=7){ rem = Number(String(rem)+buf.slice(0,7))%97; buf = buf.slice(7);} } if(buf.length) rem = Number(String(rem)+buf)%97; return rem; }
  function ibanIsValid(raw){ const s=ibanSanize(raw); if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false; const rearr=s.slice(4)+s.slice(0,4); return mod97Str(rearr)===1; }
  function ibanGroup(v){ const s=ibanSanize(v); return s.replace(/(.{4})/g,'$1 ').trim(); }
  function ibanSanize(v){ return ibanSanitize(v); }

  window.addEventListener('DOMContentLoaded', async () => {
    const id=(qs.get('id')||'').trim();
    const token=(qs.get('token')||'').trim();
    const em=(qs.get('em')||'').trim();
    const lang=normLang((qs.get('lang')||'de').trim());

    applyI18n(lang);
    if($('langSelect')){
      $('langSelect').addEventListener('change', (e)=>{
        const newLang=e.target.value;
        const q=new URLSearchParams({id,token,em,lang:newLang});
        location.search = q.toString();
      });
    }

    // Hidden fields
    if($('hid_id')){ $('hid_id').value=id; $('hid_token').value=token; $('hid_em').value=em; $('hid_lang').value=lang; }
    if($('ro_creditor')) $('ro_creditor').value=id;

    // Load RO data
    try{
      const r = await fetch(`/.netlify/functions/iban_check?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&lang=${encodeURIComponent(lang)}&em=${encodeURIComponent(em)}`);
      if(!r.ok) throw new Error('iban_check_failed');
      const j = await r.json(); const p=j.display||{};
      if($('ro_firstname')) $('ro_firstname').value=p.firstname||'';
      if($('ro_lastname'))  $('ro_lastname').value=p.name||'';
      if($('ro_street'))    $('ro_street').value=p.strasse||'';
      if($('ro_houseno'))   $('ro_houseno').value=p.hausnummer||'';
      if($('ro_zip'))       $('ro_zip').value=p.plz||'';
      if($('ro_city'))      $('ro_city').value=p.ort||'';
      if($('ro_country'))   $('ro_country').value=p.land||'';
    }catch(e){
      alert((I18N[lang]||I18N.de).err_invalid_link);
    }

    // Form behaviour
    const $iban=$('iban'), $err=$('ibanErr'), $form=$('ibanForm'), $cb1=$('cb1'), $cb2=$('cb2'), $cerr=$('consentErr');
    if($iban && $form){
      $iban.addEventListener('input',()=>{ $iban.value=ibanGroup($iban.value); });
      $form.addEventListener('submit',(ev)=>{
        let ok=true;
        // IBAN check
        if (!ibanIsValid($iban.value)){ ok=false; $err && ($err.style.display='inline'); }
        else { $err && ($err.style.display='none'); $iban.value=ibanSanize($iban.value); }
        // Consents check
        if(!($cb1 && $cb1.checked) || !($cb2 && $cb2.checked)){ ok=false; $cerr && ($cerr.style.display='inline'); }
        else { $cerr && ($cerr.style.display='none'); }
        if(!ok){ ev.preventDefault(); }
      });
    }
  });
})();