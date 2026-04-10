"use strict";

const crypto = require("crypto");

/**
 * إنشاء SHA256 hash
 * @param {string} value
 * @returns {string}
 */
function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * تنظيف النصوص العامة
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function cleanString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

/**
 * توحيد البريد الإلكتروني قبل التجزئة
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
function normalizeEmail(email) {
  const cleaned = cleanString(email);
  if (!cleaned) return null;
  return cleaned.toLowerCase();
}

/**
 * توحيد رقم الهاتف قبل التجزئة
 * أمثلة:
 * 0779960015 -> 962779960015
 * +962779960015 -> 962779960015
 * 962779960015 -> 962779960015
 * @param {string|null|undefined} phone
 * @returns {string|null}
 */
function normalizePhone(phone) {
  const cleaned = cleanString(phone);
  if (!cleaned) return null;

  let digits = cleaned.replace(/[^\d]/g, "");

  // 077xxxxxxx -> 9627xxxxxxxx
  if (digits.startsWith("0") && digits.length >= 9) {
    digits = "962" + digits.slice(1);
  }

  // 7xxxxxxxx -> 9627xxxxxxxx
  if (digits.length === 9 && digits.startsWith("7")) {
    digits = "962" + digits;
  }

  return digits || null;
}

/**
 * توحيد الاسم الأول
 * @param {string|null|undefined} firstName
 * @returns {string|null}
 */
function normalizeFirstName(firstName) {
  const cleaned = cleanString(firstName);
  if (!cleaned) return null;
  return cleaned.toLowerCase();
}

/**
 * توحيد الاسم الأخير
 * @param {string|null|undefined} lastName
 * @returns {string|null}
 */
function normalizeLastName(lastName) {
  const cleaned = cleanString(lastName);
  if (!cleaned) return null;
  return cleaned.toLowerCase();
}

/**
 * توحيد المدينة
 * @param {string|null|undefined} city
 * @returns {string|null}
 */
function normalizeCity(city) {
  const cleaned = cleanString(city);
  if (!cleaned) return null;
  return cleaned.toLowerCase();
}

/**
 * إضافة قيمة مجزأة إلى user_data إذا كانت موجودة
 * @param {object} target
 * @param {string} key
 * @param {string|null} value
 */
function addHashedField(target, key, value) {
  if (!value) return;
  target[key] = [sha256(value)];
}

/**
 * بناء user_data وفق المعايير المطلوبة
 * @param {object} params
 * @param {string|number|null} params.leadId
 * @param {string|null} params.email
 * @param {string|null} params.phone
 * @param {string|null} params.firstName
 * @param {string|null} params.lastName
 * @param {string|null} params.city
 * @returns {object}
 */
function buildUserData({
  leadId = null,
  email = null,
  phone = null,
  firstName = null,
  lastName = null,
  city = null
}) {
  const userData = {};

  if (leadId !== null && leadId !== undefined && String(leadId).trim() !== "") {
    userData.lead_id = String(leadId).trim();
  }

  addHashedField(userData, "em", normalizeEmail(email));
  addHashedField(userData, "ph", normalizePhone(phone));
  addHashedField(userData, "fn", normalizeFirstName(firstName));
  addHashedField(userData, "ln", normalizeLastName(lastName));
  addHashedField(userData, "ct", normalizeCity(city));

  return userData;
}

/**
 * تنظيف user_data من القيم الفارغة
 * @param {object} userData
 * @returns {object}
 */
function pruneUserData(userData) {
  const cleaned = {};

  for (const [key, value] of Object.entries(userData)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      if (value.length > 0) {
        cleaned[key] = value;
      }
      continue;
    }

    if (typeof value === "string" && value.trim() !== "") {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * إنشاء الحمولة النهائية
 * @param {object} params
 * @param {string} params.eventName
 * @param {number} [params.eventTime]
 * @param {string} [params.leadEventSource]
 * @param {string|number|null} [params.leadId]
 * @param {string|null} [params.email]
 * @param {string|null} [params.phone]
 * @param {string|null} [params.firstName]
 * @param {string|null} [params.lastName]
 * @param {string|null} [params.city]
 * @param {string|null} [params.testEventCode]
 * @returns {object}
 */
function buildMetaCrmPayload({
  eventName,
  eventTime = Math.floor(Date.now() / 1000),
  leadEventSource = "Matbakh Al Youm CRM",
  leadId = null,
  email = null,
  phone = null,
  firstName = null,
  lastName = null,
  city = null,
  testEventCode = null
}) {
  if (!eventName || typeof eventName !== "string") {
    throw new Error("eventName is required and must be a non-empty string");
  }

  const userData = pruneUserData(
    buildUserData({
      leadId,
      email,
      phone,
      firstName,
      lastName,
      city
    })
  );

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
        user_data: userData
      }
    ]
  };

  if (testEventCode) {
    payload.test_event_code = String(testEventCode).trim();
  }

  return payload;
}

/**
 * إرسال الحدث إلى Meta Dataset API
 * @param {object} params
 * @returns {Promise<object>}
 */
async function sendMetaCrmEvent(params) {
  const datasetId = cleanString(process.env.META_DATASET_ID);
  const accessToken = cleanString(process.env.META_CAPI_ACCESS_TOKEN);
  const apiVersion = cleanString(process.env.META_API_VERSION) || "v25.0";

  if (!datasetId) {
    throw new Error("META_DATASET_ID is missing in environment variables");
  }

  if (!accessToken) {
    throw new Error("META_CAPI_ACCESS_TOKEN is missing in environment variables");
  }

  const payload = buildMetaCrmPayload(params);

  const endpoint = `https://graph.facebook.com/${apiVersion}/${datasetId}/events?access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let result;
  try {
    result = await response.json();
  } catch (error) {
    result = {
      error: {
        message: "Invalid JSON response from Meta",
        details: error.message
      }
    };
  }

  if (!response.ok) {
    throw new Error(`Meta API request failed: ${JSON.stringify(result)}`);
  }

  return {
    ok: true,
    status: response.status,
    endpoint,
    payload,
    result
  };
}

/**
 * وظائف جاهزة لأكثر الأحداث استخدامًا
 */
async function sendLeadEvent({
  leadId = null,
  email = null,
  phone = null,
  firstName = null,
  lastName = null,
  city = null,
  testEventCode = null
}) {
  return sendMetaCrmEvent({
    eventName: "Lead",
    leadId,
    email,
    phone,
    firstName,
    lastName,
    city,
    testEventCode
  });
}

async function sendOrderSubmittedEvent({
  leadId = null,
  email = null,
  phone = null,
  firstName = null,
  lastName = null,
  city = null,
  testEventCode = null
}) {
  return sendMetaCrmEvent({
    eventName: "OrderSubmitted",
    leadId,
    email,
    phone,
    firstName,
    lastName,
    city,
    testEventCode
  });
}

async function sendPurchaseEvent({
  leadId = null,
  email = null,
  phone = null,
  firstName = null,
  lastName = null,
  city = null,
  testEventCode = null
}) {
  return sendMetaCrmEvent({
    eventName: "Purchase",
    leadId,
    email,
    phone,
    firstName,
    lastName,
    city,
    testEventCode
  });
}

module.exports = {
  sha256,
  normalizeEmail,
  normalizePhone,
  normalizeFirstName,
  normalizeLastName,
  normalizeCity,
  buildUserData,
  buildMetaCrmPayload,
  sendMetaCrmEvent,
  sendLeadEvent,
  sendOrderSubmittedEvent,
  sendPurchaseEvent
};
