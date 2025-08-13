// netlify/functions/send_iban_email.js
const fetch = require("node-fetch");
const { mj_request, gen_token } = require("./_lib");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const params = new URLSearchParams(event.body);
    const email = params.get("email");
    const id = params.get("id");
    const category = params.get("category");
    const lang = params.get("lang") || "de";
    const send = params.get("send") || "1"; // 1=send, 0=only link
    const dry = params.get("dry") || "0";

    if (!email || !id || !category) {
      return { statusCode: 400, body: "Missing required parameters" };
    }

    // Token-Generierung
    const token = gen_token();
    const expiryDays = parseInt(process.env.IBAN_TOKEN_DAYS || "14", 10);
    const expiry = new Date(Date.now() + expiryDays * 86400000).toISOString();

    // Mailjet Felder vorbereiten
    const updateData = {
      token_iban: token,
      token_iban_expiry: expiry,
      token_iban_used_at: "",
      iban_status: "PENDING",
      link_iban: `${process.env.BASE_IBAN_URL}/?id=${id}&token=${token}&em=${Buffer.from(email).toString("base64")}&lang=${lang}`
    };

    // Sprache NICHT überschreiben
    // updateData.sprache = lang; // <- bewusst auskommentiert

    if (dry !== "1") {
      // Mailjet-Kontakt aktualisieren
      const resUpdate = await mj_request(`/contactdata/${encodeURIComponent(email)}`, "PUT", updateData);
      if (!resUpdate.ok) {
        return { statusCode: 500, body: "Mailjet update failed" };
      }

      if (send === "1") {
        // Template auswählen
        const tpl = selectTemplate(lang, category);
        const sendRes = await mj_request("/send", "POST", {
          Messages: [{
            From: { Email: process.env.MAIL_FROM_ADDRESS, Name: process.env.MAIL_FROM_NAME },
            To: [{ Email: email }],
            TemplateID: tpl,
            TemplateLanguage: true,
            Variables: { link_iban: updateData.link_iban }
          }]
        });
        if (!sendRes.ok) {
          return { statusCode: 500, body: "Mailjet send failed" };
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        url: updateData.link_iban,
        dryRun: dry === "1"
      })
    };
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
};

function selectTemplate(lang, category) {
  const cat = category.trim().toUpperCase();
  const lng = lang.trim().toLowerCase();
  if (lng === "de" && cat === "VN DIREKT") return parseInt(process.env.TEMPLATE_DE_IBAN_DIRECT);
  if (lng === "de" && cat === "VN ANWALT") return parseInt(process.env.TEMPLATE_DE_IBAN_LAWYER);
  if (lng === "it" && cat === "VN DIREKT") return parseInt(process.env.TEMPLATE_EN_IBAN_DIRECT);
  if (lng === "it" && cat === "VN ANWALT") return parseInt(process.env.TEMPLATE_EN_IBAN_LAWYER);
  if (lng === "en" && cat === "VN DIREKT") return parseInt(process.env.TEMPLATE_EN_IBAN_DIRECT);
  if (lng === "en" && cat === "VN ANWALT") return parseInt(process.env.TEMPLATE_EN_IBAN_LAWYER);
  return parseInt(process.env.TEMPLATE_EN_IBAN_DIRECT); // Fallback
}
