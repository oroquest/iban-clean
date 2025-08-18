// netlify/functions/iban_issue_token.js
// Node 18+: uses global fetch (kein 'node-fetch' nötig)
const crypto = require('crypto');

/** ===== Security config ===== */
const INTERNAL_KEY = process.env.IBAN_INTERNAL_KEY || process.env.GET_CONTACT_INTERNAL_KEY; // eine von beiden setzen
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000); // 60s
const RATE_MAX = Number(process.env.RATE_MAX || 30); // 30 req/min pro (key+ip)
const _buckets = new Map(); // in-memory (pro warm instance)

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
function pickIdFromProps(p){
  const ids = [p.glaeubiger, p.glaeubiger_nr, p.creditor_id, p.id].filter(Boolean).map(String);
  return ids[0] || '';
}

/** ===== Handler ===== */
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return bad('method_not_allowed');

    // API key
    if (!INTERNAL_KEY) { console.error('Missing INTERNAL_KEY env'); return unauth(); }
    const provided = event.headers['x-internal-key'] || event.headers['x-api-key'];
    if (!provided || provided !== INTERNAL_KEY) return unauth();

    // Rate limit (key + ip)
    const key = `${provided}|${clientIp(event)}`;
    if (rateLimited(key)) return tooMany();

    // Parse body
    const ctype = (event.headers['content-type']||'').toLowerCase();
    const body = ctype.includes('application/json')
      ? (JSON.parse(event.body||'{}') || {})
      : Object.fromEntries(new URLSearchParams(event.body||''));

    const email = String(body.email||'').trim().toLowerCase();
    const id    = String(body.id||'').trim();
    const lang  = normLang(body.lang||'de');        // nur Anzeige; NICHT speichern
    const category = String(body.category||'').trim().toUpperCase();
    const dry   = String(body.dry || '0') === '1';  // nur zu internen Tests Link im Response

    if (!email || !id) return bad('missing_email_or_id');

    // Mailjet
    const mjAuth = 'Basic ' + Buffer.from(`${process.env.MJ_APIKEY_PUBLIC}:${process.env.MJ_APIKEY_PRIVATE}`).toString('base64');
    const mjBase = 'https://api.mailjet.com';

    // Kontakt ermitteln (nur Validierung; Sprache NICHT schreiben)
    const cRes = await fetch(`${mjBase}/v3/REST/contact?Email=${encodeURIComponent(email)}`, { headers:{ Authorization: mjAuth }});
    const cJson = await cRes.json().catch(()=>null);
    if (!cRes.ok || !cJson?.Data?.length) { console.error('contact_not_found', email, cRes.status, cJson); return bad('contact_not_found'); }
    const contactId = cJson.Data[0].ID;

    // Token erzeugen
    const tokenDays = Math.max(1, parseInt(process.env.IBAN_TOKEN_DAYS || '7', 10));
    const token = crypto.randomBytes(16).toString('hex');
    const expiryTs = Date.now() + tokenDays*24*60*60*1000;
    const expiry = new Date(expiryTs).toISOString();
    const baseUrl = process.env.BASE_IBAN_URL || 'https://iban.sikuralife.com';
    const link = `${baseUrl}/?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${b64url(email)}&lang=${lang}`;

    // Properties aktualisieren (sprache NIE schreiben)
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
    if (!uRes.ok) { const txt = await uRes.text().catch(()=>String(uRes.status)); console.error('mj_update_failed', txt); return bad('update_failed'); }

    // Response: Link/Token NIE bei produktivem Versand zurückgeben
    if (dry) return ok({ ok:true, url: link, id, lang, category, dry:true });
    return ok({ ok:true, id, lang, category });
  } catch (e) {
    console.error('iban_issue_token_error', e);
    return { statusCode: 500, body: 'internal_error' };
  }
};
