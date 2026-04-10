const crypto = require("crypto");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(email) {
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

function normalizePhone(phone) {
  if (!phone) return null;

  let cleaned = String(phone).replace(/[^\d]/g, "");

  // معالجة أرقام الأردن الشائعة
  // 0779960015 -> 962779960015
  if (cleaned.startsWith("0")) {
    cleaned = "962" + cleaned.slice(1);
  }

  // 779960015 -> 962779960015
  if (cleaned.length === 9 && cleaned.startsWith("7")) {
    cleaned = "962" + cleaned;
  }

  return cleaned;
}

function buildUserData({ leadId, email, phone, firstName, lastName, city }) {
  const userData = {};

  if (leadId) {
    userData.lead_id = String(leadId);
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    userData.em = [sha256(normalizedEmail)];
  }

  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    userData.ph = [sha256(normalizedPhone)];
  }

  if (firstName) {
    userData.fn = [sha256(String(firstName).trim().toLowerCase())];
  }

  if (lastName) {
    userData.ln = [sha256(String(lastName).trim().toLowerCase())];
  }

  if (city) {
    userData.ct = [sha256(String(city).trim().toLowerCase())];
  }

  return userData;
}

async function sendMetaCrmEvent({
  eventName,
  leadId = null,
  email = null,
  phone = null,
  firstName = null,
  lastName = null,
  city = null,
  eventTime = Math.floor(Date.now() / 1000),
  leadEventSource = "Matbakh Al Youm CRM",
  testEventCode = null
}) {
  const datasetId = process.env.META_DATASET_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const apiVersion = process.env.META_API_VERSION || "v25.0";

  if (!datasetId) {
    throw new Error("META_DATASET_ID is missing");
  }

  if (!accessToken) {
    throw new Error("META_CAPI_ACCESS_TOKEN is missing");
  }

  if (!eventName) {
    throw new Error("eventName is required");
  }

  const payload = {
    data: [
      {
        action_source: "system_generated",
        event_name: eventName,
        event_time: eventTime,
        custom_data: {
          event_source: "crm",
          lead_event_source: leadEventSource
        },
        user_data: buildUserData({
          leadId,
          email,
          phone,
          firstName,
          lastName,
          city
        })
      }
    ]
  };

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  const url = `https://graph.facebook.com/${apiVersion}/${datasetId}/events?access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Meta API error: ${JSON.stringify(result)}`);
  }

  return result;
}

module.exports = {
  sendMetaCrmEvent,
  normalizeEmail,
  normalizePhone,
  buildUserData
};
