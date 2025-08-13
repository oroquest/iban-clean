function ibanSanitize(s){return String(s||'').toUpperCase().replace(/\s+/g,'');}
function toNum(ch){const c=ch.charCodeAt(0);if(c>=48&&c<=57)return ch; if(c>=65&&c<=90)return String(c-55); return '';}
function mod97Str(str){let rem=0,buf='';for(const ch of str){buf+=toNum(ch);while(buf.length>=7){rem=Number(String(rem)+buf.slice(0,7))%97;buf=buf.slice(7);}}if(buf.length) rem=Number(String(rem)+buf)%97;return rem;}
function ibanIsValid(raw){const s=ibanSanitize(raw); if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false; const rearr=s.slice(4)+s.slice(0,4); return mod97Str(rearr)===1;}
function bicIsValid(raw){const s=String(raw||'').toUpperCase().trim(); if(!s) return true; return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s);}
function formatIBAN(raw){return ibanSanitize(raw).replace(/(.{4})/g,'$1 ').trim();}

const qs=new URLSearchParams(location.search);
const q_id=(qs.get('id')||'').trim();const q_token=(qs.get('token')||'').trim();
const q_em=(qs.get('em')||'').trim();const q_lang=(qs.get('lang')||'de').toLowerCase();
document.getElementById('hid_id').value=q_id;document.getElementById('hid_token').value=q_token;
document.getElementById('hid_em').value=q_em;document.getElementById('hid_lang').value=q_lang;
document.getElementById('ro_creditor').value=q_id;

(async()=>{try{const url=`/.netlify/functions/verify_check?id=${encodeURIComponent(q_id)}&token=${encodeURIComponent(q_token)}&lang=${encodeURIComponent(q_lang)}&em=${encodeURIComponent(q_em)}`;
const r=await fetch(url);if(!r.ok)throw new Error('verify_check_failed');const data=await r.json();const p=data.display||data||{};
const first=p.firstname||p.vorname||'';const last=p.name||p.nachname||'';const street=p.strasse||p.adresse_strasse||p.street||'';
const houseno=p.hausnummer||p.adresse_hausnummer||p.nr||'';const zip=p.plz||p.adresse_plz||p.zip||'';const city=p.ort||p.adresse_ort||p.city||'';
const country=p.land||p.adresse_land||p.country||'';document.getElementById('ro_firstname').value=first;
document.getElementById('ro_lastname').value=last;document.getElementById('ro_street').value=street;
document.getElementById('ro_houseno').value=houseno;document.getElementById('ro_zip').value=zip;
document.getElementById('ro_city').value=city;document.getElementById('ro_country').value=country;}catch(e){alert('Der Zugriffslink ist ungültig oder abgelaufen.');}})();

const $iban=document.getElementById('iban');const $bic=document.getElementById('bic');
$iban.addEventListener('input',()=>{$iban.value=formatIBAN($iban.value);});
document.getElementById('ibanForm').addEventListener('submit',(ev)=>{const rawIban=$iban.value;const rawBic=$bic.value;
if(!ibanIsValid(rawIban)){ev.preventDefault();alert('Bitte gültige IBAN eingeben.');return;}
if(!bicIsValid(rawBic)){ev.preventDefault();alert('BIC ist ungültig.');return;}
$iban.value=ibanSanitize(rawIban);});