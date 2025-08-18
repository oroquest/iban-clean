// netlify/functions/send_iban_email.js
// Node 18+: global fetch
const crypto = require('crypto');

/** ===== Security config ===== */
const INTERNAL_KEY = process.env.IBAN_INTERNAL_KEY || process.env.GET_CONTACT_INTERNAL_KEY; // eine von beiden setzen
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000);
const RATE_MAX = Number(process.env.RATE_MAX || 30);
const _buckets = new Map();

/** ===== Helpers ===== */
const ok = (data) => ({ statusCode: 200, body: JSON.stringify(data, null, 2) });
const bad = (msg = 'bad_request') => ({ statusCode: 400, body: msg });
const unauth = () => ({ statusCode: 401, body: 'unauthorized' });
const tooMany = () => ({ statusCode: 429, body: 'rate_limited' });

function clientIp(event) {
  const xff = event.headers['x-forwarded-for'] || '';
  return xff.split(',')[0].trim() || 'unknown';
}
function rateLimited(key) {
  const now = Date.now();
  const rec = _buckets.get(key);
  if (!rec || now - rec.start >= RATE_WINDOW_MS) {
    _buckets.set(key, { start: now, count: 1 });
    return false;
  }
  rec.count++;
  if (rec.count > RATE_MAX) return true;
  return false;
}

function b64url(s){ return Buffer.from(s,'utf8').toString('base64url'); }
function normLang(x){ const v=String(x||'de').toLowerCase(); return v==='it'?'en':(v==='en'?'en':'de'); }
function pickTemplate(uiLang, category, env){
  const isDirect = String(category||'').toUpperCase() === 'VN DIREKT';
  if (uiLang === 'de') return isDirect ? env.TEMPLATE_DE_IBAN_DIRECT : env.TEMPLATE_DE_IBAN_LAWYER;
  return isDirect ? env.TEMPLATE_EN_IBAN_DIRECT : env.TEMPLATE_EN_IBAN_LAWYER;
}
function pickIdFromProps(p){
  const ids = [p.glaeubiger, p.glaeubiger_nr, p.creditor_id, p.id].filter(Boolean).map(String);
  return ids[0] || '';
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return bad('method_not_allowed');

    // API key
    if (!INTERNAL_KEY) { console.error('Missing INTERNAL_KEY env'); return unauth(); }
    const provided = event.headers['x-internal-key'] || event.headers['x-api-key'];
    if (!provided || provided !== INTERNAL_KEY) return unauth();

    // Rate limit
    const key = `${provided}|${clientIp(event)}`;
    if (rateLimited(key)) return tooMany();

    // Parse body
    const ctype = (event.headers['content-type']||'').toLowerCase();
    const body = ctype.includes('application/json')
      ? (JSON.parse(event.body||'{}') || {})
      : Object.fromEntries(new URLSearchParams(event.body||''));

    // Empfängerliste zusammenstellen
    let items = [];
    if (Array.isArray(body.list)) {
      items = body.list;
    } else if (body.emails) {
      items = String(body.emails).split(',').map(e => ({ email: e.trim() })).filter(x => x.email);
    } else if (body.email) {
      items = [{ email: String(body.email).trim(), id: body.id, category: body.category, lang: body.lang }];
    } else {
      return bad('no_recipients');
    }

    const dry = (String(body.dry || process.env.IBAN_TEST_MODE || '0') === '1');

    // Mailjet setup
    const mjAuth = 'Basic ' + Buffer.from(`${process.env.MJ_APIKEY_PUBLIC}:${process.env.MJ_APIKEY_PRIVATE}`).toString('base64');
    const mjBase = 'https://api.mailjet.com';
    const baseUrl = process.env.BASE_IBAN_URL || 'https://iban.sikuralife.com';
    const tokenDays = Math.max(1, parseInt(process.env.IBAN_TOKEN_DAYS || '7', 10));
    const defaultCategory = String(process.env.IBAN_DEFAULT_CATEGORY || 'VN DIREKT');

    const results = [];
    for (const it of items) {
      try {
        const email = String(it.email||'').trim().toLowerCase();
        if (!email) { results.push({ email, ok:false, error:'missing_email' }); continue; }

        // Kontakt & Props
        const cRes = await fetch(`${mjBase}/v3/REST/contact?Email=${encodeURIComponent(email)}`, { headers: { Authorization: mjAuth }});
        const cJson = await cRes.json().catch(()=>null);
        if (!cRes.ok || !cJson?.Data?.length) { results.push({ email, ok:false, error:'contact_not_found' }); continue; }
        const contactId = cJson.Data[0].ID;

        const cdRes = await fetch(`${mjBase}/v3/REST/contactdata/${contactId}`, { headers: { Authorization: mjAuth }});
        const cdJson = await cdRes.json().catch(()=>null);
        const props = {};
        if (cdJson?.Data?.[0]?.Data) for (const kv of cdJson.Data[0].Data) props[kv.Name]=kv.Value;

        // ID/Kategorie/Sprache (sprache NIE schreiben)
        const creditorId = String(it.id || pickIdFromProps(props) || '').trim();
        const category   = String(it.category || props.category || defaultCategory).toUpperCase();
        const uiLang     = normLang(it.lang || props.sprache || 'de');
        if (!creditorId) { results.push({ email, ok:false, error:'missing_id' }); continue; }

        // Token & Link
        const token = crypto.randomBytes(16).toString('hex');
        const expiryTs = Date.now() + tokenDays*24*60*60*1000;
        const expiry = new Date(expiryTs).toISOString();
        const link = `${baseUrl}/?id=${encodeURIComponent(creditorId)}&token=${encodeURIComponent(token)}&em=${Buffer.from(email,'utf8').toString('base64url')}&lang=${uiLang}`;

        // Mailjet Properties (sprache unverändert)
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
        if (!uRes.ok) { results.push({ email, ok:false, error:'update_failed' }); continue; }

        // Template
        const templateId = pickTemplate(uiLang, category, process.env);
        if (!templateId) { results.push({ email, ok:false, error:'missing_template' }); continue; }

        // Variablen exakt wie im Template
        const vars = {
          verify_url: link,                                  // dein EN-Template erwartet {{var:verify_url}}
          creditor_id: creditorId,
          name: props.name || props.lastname || '',
          firstname: props.firstname || '',
          ort: props.ort || props.city || '',
          country: props.land || props.country || '',
          expires_at: new Date(expiryTs).toLocaleString(uiLang==='de'?'de-CH':'en-GB', { timeZone:'Europe/Zurich' })
        };

        // Versand nur, wenn nicht dry
        if (!dry) {
          const sendRes = await fetch(`${mjBase}/v3.1/send`, {
            method: 'POST',
            headers: { Authorization: mjAuth, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              Messages: [{
                From: {
                  Email: process.env.MAIL_FROM_ADDRESS || process.env.MJ_FROM_EMAIL || 'noreply@sikuralife.com',
                  Name:  process.env.MAIL_FROM_NAME    || process.env.MJ_FROM_NAME  || 'SIKURA Leben AG i.L.'
                },
                To: [{ Email: email }],
                TemplateID: Number(templateId),
                TemplateLanguage: true,
                Variables: vars
              }]
            })
          });
          if (!sendRes.ok) { results.push({ email, ok:false, error:'send_failed' }); continue; }
        }

        // Bei produktivem Versand KEIN Link/Vars zurückgeben (nur OK)
        if (dry) {
          results.push({ email, ok:true, uiLang, category, template: templateId, link, sent:false, vars });
        } else {
          results.push({ email, ok:true, uiLang, category, template: templateId, sent:true });
        }
      } catch (inner) {
        console.error('send_iban_email_inner', inner);
        results.push({ email: it?.email || '', ok:false, error:'internal_error' });
      }
    }

    // Nur im Dry-Run eine bequeme url für Einzelabrufe mitgeben (für deine Tests)
    const singleUrl = (dry && results.length===1 && results[0].link) ? results[0].link : undefined;
    return ok({ ok:true, dry, url: singleUrl, results });
  } catch (e) {
    console.error('send_iban_email_error', e);
    return { statusCode: 500, body: 'internal_error' };
  }
};
