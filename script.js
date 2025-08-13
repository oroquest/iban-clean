(function(){
  'use strict';
  const I18N = {
    de:{title_check:"Bitte bestätigen Sie Ihre bereits erfassten Daten",subtitle_check:"Diese Angaben stammen aus Ihrem bestehenden Prozess und sind nur zur Kontrolle sichtbar.",field_creditor:"Gläubiger‑Nr.",field_firstname:"Vorname",field_lastname:"Nachname",field_street:"Strasse",field_houseno:"Nr.",field_zip:"PLZ",field_city:"Ort",field_country:"Land",title_iban:"IBAN erfassen",field_iban:"IBAN*",check_correct:"Ich bestätige, dass die Angaben korrekt sind.",check_privacy:"Ich stimme der Verarbeitung gemäss Datenschutzhinweisen zu.",btn_send:"Senden",link_privacy:"Datenschutzhinweise",err_invalid_link:"Der Zugriffslink ist ungültig oder abgelaufen.",err_iban_invalid:"Bitte eine gültige IBAN eingeben (Format & Prüfsumme)."},
    en:{title_check:"Please confirm your already provided data",subtitle_check:"The following information is from your existing process and is shown for review only.",field_creditor:"Creditor no.",field_firstname:"First name",field_lastname:"Last name",field_street:"Street",field_houseno:"No.",field_zip:"ZIP",field_city:"City",field_country:"Country",title_iban:"Enter IBAN",field_iban:"IBAN*",check_correct:"I confirm that the information is correct.",check_privacy:"I agree to the processing according to the privacy notice.",btn_send:"Submit",link_privacy:"Privacy notice",err_invalid_link:"The access link is invalid or has expired.",err_iban_invalid:"Please enter a valid IBAN (format & checksum)."},
    it:{title_check:"Per favore conferma il tuo indirizzo",subtitle_check:"I campi sono precompilati e possono essere aggiornati se necessario.",field_creditor:"Numero del creditore",field_firstname:"Nome",field_lastname:"Cognome",field_street:"Via",field_houseno:"Nr.",field_zip:"CAP",field_city:"Città",field_country:"Paese",title_iban:"Inserisci IBAN",field_iban:"IBAN*",check_correct:"Confermo che i dati forniti sono corretti.",check_privacy:"Acconsento al trattamento dei miei dati secondo l'informativa sulla privacy.",btn_send:"Invia",link_privacy:"Informativa privacy",err_invalid_link:"Il link di accesso non è valido o è scaduto.",err_iban_invalid:"Inserisci un IBAN valido (formato e checksum)."}
  };
  function normLang(l){l=(l||'de').toLowerCase(); return I18N[l]?l:'de';}
  function t(lang,key){ const d=I18N[lang]||I18N.de; return d[key]||key; }
  function applyI18n(lang){
    document.documentElement.lang=lang;
    document.querySelectorAll('[data-i18n]').forEach(el=>{ const k=el.getAttribute('data-i18n'); el.textContent=t(lang,k); });
  }

  function ibanSanitize(s){ return String(s||'').toUpperCase().replace(/\s+/g,''); }
  function toNum(ch){ const c=ch.charCodeAt(0); if(c>=48&&c<=57) return ch; if(c>=65&&c<=90) return String(c-55); return ''; }
  function mod97Str(str){ let rem=0,buf=''; for(const ch of str){ buf+=toNum(ch); while(buf.length>=7){ rem=Number(String(rem)+buf.slice(0,7))%97; buf=buf.slice(7);} } if(buf.length) rem=Number(String(rem)+buf)%97; return rem; }
  function ibanIsValid(raw){ const s=ibanSanitize(raw); if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false; const rearr=s.slice(4)+s.slice(0,4); return mod97Str(rearr)===1; }
  function ibanGroup(v){ const s=ibanSanitize(v); return s.replace(/(.{4})/g,'$1 ').trim(); }

  function setSelect(lang){
    const sel=document.getElementById('langSel');
    if(sel){
      sel.value=lang;
      sel.onchange=()=>{
        const qs=new URLSearchParams(location.search);
        qs.set('lang', sel.value);
        // preserve id/token/em
        ['id','token','em'].forEach(k=>{ if(!qs.get(k)){ const el=document.getElementById('hid_'+k); if(el&&el.value) qs.set(k,el.value); } });
        location.search='?'+qs.toString();
      };
    }
  }

  window.addEventListener('DOMContentLoaded', async()=>{
    const qs=new URLSearchParams(location.search);
    const id=(qs.get('id')||'').trim();
    const token=(qs.get('token')||'').trim();
    const em=(qs.get('em')||'').trim();
    const lang=normLang((qs.get('lang')||'de').trim());

    applyI18n(lang);
    setSelect(lang);

    const hid=id=>document.getElementById(id);
    if(hid('hid_id')){ hid('hid_id').value=id; hid('hid_token').value=token; hid('hid_em').value=em; hid('hid_lang').value=lang; }
    if(hid('ro_creditor')) hid('ro_creditor').value=id;

    try{
      const r=await fetch(`/.netlify/functions/iban_check?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&lang=${encodeURIComponent(lang)}&em=${encodeURIComponent(em)}`);
      if(!r.ok) throw new Error('iban_check_failed');
      const j=await r.json(); const p=j.display||{};
      if(hid('ro_firstname')) hid('ro_firstname').value=p.firstname||'';
      if(hid('ro_lastname'))  hid('ro_lastname').value=p.name||'';
      if(hid('ro_street'))    hid('ro_street').value=p.strasse||'';
      if(hid('ro_houseno'))   hid('ro_houseno').value=p.hausnummer||'';
      if(hid('ro_zip'))       hid('ro_zip').value=p.plz||'';
      if(hid('ro_city'))      hid('ro_city').value=p.ort||'';
      if(hid('ro_country'))   hid('ro_country').value=p.land||'';
    }catch(e){
      alert(t(lang,'err_invalid_link'));
    }

    const $iban=document.getElementById('iban'), $err=document.getElementById('ibanErr'), $form=document.getElementById('ibanForm');
    if($iban&&$form){
      $iban.addEventListener('input',()=>{ $iban.value=ibanGroup($iban.value); });
      $form.addEventListener('submit',(ev)=>{
        $err.style.display='none';
        if(!ibanIsValid($iban.value)){ ev.preventDefault(); $err.style.display='inline'; return; }
        $iban.value=ibanSanitize($iban.value);
      });
    }
  });
})();