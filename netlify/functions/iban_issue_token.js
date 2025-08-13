exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const isJson = (event.headers['content-type']||'').includes('application/json');
    const body = isJson ? JSON.parse(event.body||'{}') : Object.fromEntries(new URLSearchParams(event.body||''));

    const email = String(body.email||'').trim();
    const id = String(body.id||'').trim();
    const langIn = String(body.lang||'de').toLowerCase();
    const lang = (langIn === 'it') ? 'en' : langIn;
    const category = String(body.category || process.env.IBAN_DEFAULT_CATEGORY || 'VN DIREKT').toUpperCase();
    const send = String(body.send||'0').toLowerCase() in { '1':1, 'true':1, 'yes':1 };
    if (!email || !id) return { statusCode: 400, body: 'Missing email or id' };

    const mjAuth = 'Basic ' + Buffer.from(`${process.env.MJ_APIKEY_PUBLIC}:${process.env.MJ_APIKEY_PRIVATE}`).toString('base64');
    const mjBase = 'https://api.mailjet.com';

    const cRes = await fetch(`${mjBase}/v3/REST/contact?Email=${encodeURIComponent(email)}`, { headers: { Authorization: mjAuth } });
    const cJson = await cRes.json();
    if (!cRes.ok || !cJson?.Data?.length) return { statusCode: 404, body: JSON.stringify({ ok:false, error:'contact_not_found', email }) };
    const contactId = cJson.Data[0].ID;

    const token = require('crypto').randomBytes(16).toString('hex');
    const days = Number(process.env.IBAN_TOKEN_DAYS||'7');
    const expiresAt = new Date(Date.now() + days*24*60*60*1000).toISOString();
    const baseUrl = process.env.BASE_IBAN_URL || 'https://iban.sikuralife.com';
    const em = Buffer.from(email).toString('base64url');
    const url = `${baseUrl}/?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}&em=${encodeURIComponent(em)}&lang=${encodeURIComponent(lang)}`;

    const Data = [
      { Name:'token_iban', Value: token },
      { Name:'token_iban_expiry', Value: expiresAt },
      { Name:'token_iban_used_at', Value: '' },
      { Name:'link_iban', Value: url },
      { Name:'sprache', Value: lang },
      { Name:'iban_status', Value: 'issued' }
    ];
    const uRes = await fetch(`${mjBase}/v3/REST/contactdata/${contactId}`, {
      method:'PUT', headers:{ Authorization: mjAuth, 'Content-Type':'application/json' }, body: JSON.stringify({ Data })
    });
    if (!uRes.ok) return { statusCode: uRes.status, body: await uRes.text() };

    if (send) {
      const tmap = {
        'de__VN DIREKT': process.env.TEMPLATE_DE_IBAN_DIRECT,
        'de__VN ANWALT': process.env.TEMPLATE_DE_IBAN_LAWYER,
        'en__VN DIREKT': process.env.TEMPLATE_EN_IBAN_DIRECT,
        'en__VN ANWALT': process.env.TEMPLATE_EN_IBAN_LAWYER
      };
      const TemplateID = Number(tmap[`${lang}__${category}`] || 0);
      if (!TemplateID) return { statusCode: 400, body: 'template_missing' };
      const sendPayload = { Messages: [{
        From: { Email: process.env.MAIL_FROM_ADDRESS, Name: process.env.MAIL_FROM_NAME },
        To:   [{ Email: email }],
        TemplateID, TemplateLanguage: true,
        Subject: 'IBAN-Erhebung',
        Variables: { link: url, id, lang, category }
      }]};
      const sRes = await fetch(`${mjBase}/v3.1/send`, { method:'POST', headers:{ Authorization: mjAuth, 'Content-Type':'application/json' }, body: JSON.stringify(sendPayload) });
      const sJson = await sRes.json().catch(()=> ({}));
      if (!sRes.ok || sJson?.Messages?.[0]?.Status!=='success') return { statusCode: sRes.status, body: `send_failed:${JSON.stringify(sJson)}` };
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, url, token, expiresAt }) };
  } catch (e) { return { statusCode: 500, body: `error:${e.message}` }; }
};