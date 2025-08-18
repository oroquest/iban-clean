// --- NEU: winziges Hardening (nur Browser, Batch unberührt) ---
const ALLOW_ORIGINS = new Set([
  'https://iban.sikuralife.com',
  'https://verify.sikuralife.com'
]);
// ---------------------------------------------------------------

// iban_check.js - validates IBAN token link and returns read-only display data.
// Uses native fetch (Node 18/20). No external deps.

function b64urlDecode(s){
  try { return Buffer.from(String(s||''), 'base64url').toString('utf8'); }
  catch { 
    // fallback: some older links might have standard base64
    try { return Buffer.from(String(s||''), 'base64').toString('utf8'); } catch { return ''; }
  }
}

exports.handler = async (event) => {
  try {
    // --- NEU: Preflight sauber beantworten (neutral, beeinflusst GET nicht) ---
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, body: '' };
    }

    // --- NEU: Nur wenn aus dem Browser (Origin/Referer vorhanden), fremde Origins blocken.
    // Server-to-Server-/Batch-Calls haben i.d.R. keinen Origin/Referer -> bleiben unberührt.
    const hdr = event.headers || {};
    const isBrowser = !!(hdr.origin || hdr.referer);
    if (isBrowser) {
      const origin = hdr.origin || '';
      if (!ALLOW_ORIGINS.has(origin)) {
        return { statusCode: 403, body: JSON.stringify({ ok:false, error:'forbidden' }) };
      }
    }
    // ---------------------------------------------------------------------------

    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const qs = event.queryStringParameters || {};
    const id = String(qs.id||'').trim();
    const token = String(qs.token||'').trim();
    const email = b64urlDecode(qs.em||'');
    const lang = String(qs.lang||'de').toLowerCase();

    if (!id || !token || !email) {
      return { statusCode: 400, body: JSON.stringify({ ok:false, error:'missing_params' }) };
    }

    const mjAuth = 'Basic ' + Buffer.from(`${process.env.MJ_APIKEY_PUBLIC}:${process.env.MJ_APIKEY_PRIVATE}`).toString('base64');
    const mjBase = 'https://api.mailjet.com';

    // Get contact by email
    const cRes = await fetch(`${mjBase}/v3/REST/contact?Email=${encodeURIComponent(email)}`, { headers: { Authorization: mjAuth } });
    const cJson = await cRes.json();
    if (!cRes.ok || !cJson?.Data?.length) {
      return { statusCode: 404, body: JSON.stringify({ ok:false, error:'contact_not_found' }) };
    }
    const contactId = cJson.Data[0].ID;

    // Get contact properties
    const dRes = await fetch(`${mjBase}/v3/REST/contactdata/${contactId}`, { headers: { Authorization: mjAuth } });
    const dJson = await dRes.json();
    const props = {};
    if (dJson?.Data?.[0]?.Data) for (const kv of dJson.Data[0].Data) props[kv.Name] = kv.Value;

    // Token check for IBAN flow
    if (props.token_iban !== token) return { statusCode: 403, body: JSON.stringify({ ok:false, error:'invalid_token' }) };
    const expiryTs = new Date(props.token_iban_expiry || 0).getTime();
    const testMode = String(process.env.IBAN_TEST_MODE||'0') === '1';
    if (Date.now() > expiryTs && !testMode) return { statusCode: 410, body: JSON.stringify({ ok:false, error:'expired' }) };

    // ID hardening like Verify
    const candidates = [props.glaeubiger, props.glaeubiger_nr, props.creditor_id, props.id].filter(Boolean).map(String);
    if (candidates.length && !candidates.includes(String(id))) {
      return { statusCode: 403, body: JSON.stringify({ ok:false, error:'id_mismatch' }) };
    }

    // Update status to opened (non-blocking)
    if (props.iban_status !== 'submitted') {
      try {
        await fetch(`${mjBase}/v3/REST/contactdata/${contactId}`, {
          method: 'PUT',
          headers: { Authorization: mjAuth, 'Content-Type':'application/json' },
          body: JSON.stringify({ Data: [{ Name:'iban_status', Value:'opened' }] })
        });
      } catch {}
    }

    // Build display like Verify (but tolerant keys)
    const display = {
      creditor_id: props.glaeubiger || props.glaeubiger_nr || props.creditor_id || id,
      firstname:   props.firstname || props.vorname || '',
      name:        props.name || props.nachname || '',
      strasse:     props.strasse || props.adresse_strasse || props.street || '',
      hausnummer:  props.hausnummer || props.adresse_hausnummer || props.nr || '',
      plz:         props.plz || props.adresse_plz || props.zip || '',
      ort:         props.ort || props.adresse_ort || props.city || '',
      land:        props.land || props.adresse_land || props.country || '',
      sprache:     props.sprache || lang,
      category:    props.category || 'VN DIREKT'
    };

    return { statusCode: 200, body: JSON.stringify({ ok:true, display }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: 'server_error', detail: e.message }) };
  }
};
