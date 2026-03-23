import crypto from 'node:crypto';
import { sha256 } from '../utils/core.js';

export async function sendMetaEvent(config, event = {}) {
  const pixelId = process.env.META_PIXEL_ID || '';
  const accessToken = process.env.META_ACCESS_TOKEN || '';
  if (!pixelId || !accessToken) {
    return { skipped: true, reason: 'META_PIXEL_ID أو META_ACCESS_TOKEN غير مضبوطين.' };
  }

  const payload = {
    data: [
      {
        event_name: event.event_name || 'PageView',
        event_time: Math.floor(Date.now() / 1000),
        action_source: event.action_source || 'website',
        event_source_url: event.event_source_url || config.site.baseUrl,
        event_id: event.event_id || crypto.randomUUID(),
        user_data: {
          ph: event.user_data?.phone ? [sha256(event.user_data.phone)] : undefined
        },
        custom_data: event.custom_data || {}
      }
    ]
  };

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${pixelId}/events?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, payload };
}
