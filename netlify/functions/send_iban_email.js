// netlify/functions/send_iban_email.js
// Node 18+: global fetch, kein 'node-fetch' nötig
const crypto = require('crypto');

function b64url(s){ return Buffer.from(s,'utf8').toString('base64url'); }
function normLang(x){
  const v = String(x||'de').toLowerCase();
  if (v === 'it') return 'en';           // IT => EN (wie vereinbart)
  return v === 'en' ? 'en' : 'de';       // default: de
}
function pickTemplate(uiLang, category, env){
  const isDirect = String(category||'').toUpperCase() === 'VN DIREKT';
  if (uiLang === 'de') return isDirect ? env.TEMPLATE_DE_IBAN_DIRECT : env.TEMPLATE_DE_IBAN_LAWYER;
  return isDirect ? env.TEMPLATE_EN_IBAN_DIRECT : env.TEMPLATE_EN_IBAN_LAWYER;
}
function pickIdFromProps(p){
  const ids = [p.glaeubiger, p.glaeubiger_nr, p.creditor_id, p.id].filter(Boolean).map(String);
  return ids[0] || '';
}
function okJson(data){ return { statusCode: 200, body: JSON.stringify(data, null, 2) }; }

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const ctype = (event.headers['content-type']||'').toLowerCase();
    let body = {};
    if (ctype.includes('application/json')) {
      body = JSON.parse(event.body||'{}');
    } else {
      body = Object.fromEntries(new URLSearchParams(event.body||''));
    }

    // Eingaben: einzelne Felder oder Liste
    let items = [];
    if (Array.isArray(body.list)) {
      items = body.list;
    } else if (body.emails) {
      items = String(body.emails).split(',').map(e => ({ email: e.trim() })).filter(x => x.email);
    } else if (body.email) {
      items = [{ email: String(body.email).trim(), id: body.id, category: body.category, lang: body.lang }];
    } else {
      return { statusCode: 400, body: 'no_recipients' };
    }

    const dry = (String(body.dry || process.env.IBAN_TEST_MODE || '0') === '1');

    // Mailjet Basis
    const mjAuth = 'Basic ' + Buffer.from(`${process.env.MJ_APIKEY_PUBLIC}:${process.env.MJ_APIKEY_PRIVATE}`).toString('base64');
    const mjBase = 'https://api.mailjet.com';
    const baseUrl = process.env.BASE_IBAN_URL || 'https://iban.sikuralife.com';
    const tokenDays = Math.max(1, parseInt(process.env.IBAN_TOKEN_DAYS || '7', 10));
    const defaultCategory = String(process.env.IBAN_DEFAULT_CATEGORY || 'VN DIREKT');

    const results = [];
    for (const it of items) {
      const email = String(it.email||'').trim().toLowerCase();
      if (!email) { results.push({ email, ok:false, error:'missing_email' }); continue; }

      // Kontakt + Props laden
      const cRes = await fetch(`${mjBase}/v3/REST/contact?Email=${encodeURIComponent(email)}`, { headers: { Authorization: mjAuth }});
      const cJson = await cRes.json();
      if (!cRes.ok || !cJson?.Data?.length) { results.push({ email, ok:false, error:'contact_not_found' }); continue; }
      const contactId = cJson.Data[0].ID;

      const cdRes = await fetch(`${mjBase}/v3/REST/contactdata/${contactId}`, { headers: { Authorization: mjAuth }});
      const cdJson = await cdRes.json();
      const props = {};
      if (cdJson?.Data?.[0]?.Data) for (const kv of cdJson.Data[0].Data) props[kv.Name]=kv.Value;

      // ID & Kategorie & UI-Sprache (nur lesen – sprache wird NIE geschrieben)
      const creditorId = String(it.id || pickIdFromProps(props) || '').trim();
      const category   = String(it.category || props.category || defaultCategory).toUpperCase();
      const uiLang     = normLang(it.lang || props.sprache || 'de');
      if (!creditorId) { results.push({ email, ok:false, error:'missing_id' }); continue; }

      // Token erzeugen
      const token = crypto.randomBytes(16).toString('hex');
      const expiryTs = Date.now() + tokenDays*24*60*60*1000;
      const expiry = new Date(expiryTs).toISOString();

      // Link
      const link = `${baseUrl}/?id=${encodeURIComponent(creditorId)}&token=${encodeURIComponent(token)}&em=${b64url(email)}&lang=${uiLang}`;

      // Properties updaten (sprache bleibt unverändert)
      const update = [
        { Name:'token_iban',         Value: token },
        { Name:'token_iban_expiry',  Value: expiry },
        { Name:'token_iban_used_at', Value: '' },
        { Name:'iban_status',        Value: 'issued' },
        { Name:'link_iban',          Value: link }
      ];
      const uRes = await fetch(`${mjBase}/v3/REST/contactdata/${contactId}`, {
        method:'PUT', headers:{ Authorization: mjAuth, 'Content-Type':'application/json' }, body: JSON.stringify({ Data: update })
      });
      if (!uRes.ok) {
        results.push({ email, ok:false, error:`update_failed_${uRes.status}`, details: await uRes.text() });
        continue;
      }

      // E-Mail ggf. senden
      const templateId = pickTemplate(uiLang, category, process.env);
      if (!templateId) { results.push({ email, ok:false, uiLang, category, error:'missing_template' }); continue; }

      // Variablen GENAU wie im Template benutzt:
      const vars = {
        // EN-Template erwartet verify_url:
        verify_url: link,
        // Zusätzliche Anzeige-Variablen (falls im Template vorhanden)
        creditor_id: creditorId,
        name: props.name || props.lastname || '',
        firstname: props.firstname || '',
        ort: props.ort || props.city || '',
        country: props.land || props.country || '',
        // Ablauf-Hinweis, falls {{var:expires_at}} genutzt wird
        expires_at: new Date(expiryTs).toLocaleString('en-GB', { timeZone: 'Europe/Zurich' })
      };

      if (!dry) {
        const sendRes = await fetch(`${mjBase}/v3.1/send`, {
          method: 'POST',
          headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Messages: [{
              From: {
                Email: process.env.MAIL_FROM_ADDRESS || process.env.MJ_FROM_EMAIL || 'no-reply@sikuralife.com',
                Name:  process.env.MAIL_FROM_NAME    || process.env.MJ_FROM_NAME  || 'SIKURA Leben AG i.L.'
              },
              To: [{ Email: email }],
              TemplateID: Number(templateId),
              TemplateLanguage: true,
              Variables: vars
            }]
          })
        });
        if (!sendRes.ok) {
          results.push({ email, ok:false, uiLang, category, template: templateId, error:`send_failed_${sendRes.status}`, details: await sendRes.text(), vars });
          continue;
        }
      }

      results.push({ email, ok:true, uiLang, category, template: templateId, link, sent: !dry, vars });
    }

    // Ein-Empfänger-Komfort: url auf Top-Level für $r.url
    const singleUrl = results.length === 1 && results[0].link ? results[0].link : undefined;
    return okJson({ ok:true, dry, url: singleUrl, results });
  } catch (e) {
    return { statusCode: 500, body: `error:${e.message}` };
  }
};
