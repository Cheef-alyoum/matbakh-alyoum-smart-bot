function normalizeInteractivePayload(interactive) {
  if (!interactive || !interactive.type) {
    throw new Error('INTERACTIVE_PAYLOAD_MISSING');
  }

  if (interactive.type === 'button') {
    return {
      type: 'button',
      body: {
        text: String(interactive.body || '').slice(0, 1024)
      },
      action: {
        buttons: (interactive.buttons || []).slice(0, 3).map(button => ({
          type: 'reply',
          reply: {
            id: String(button.id || '').slice(0, 256),
            title: shortButton(button.title || '')
          }
        }))
      }
    };
  }

  if (interactive.type === 'list') {
    return {
      type: 'list',
      body: {
        text: String(interactive.body || '').slice(0, 1024)
      },
      action: {
        button: shortButton(interactive.buttonText || 'عرض'),
        sections: (interactive.sections || []).slice(0, 10).map(section => ({
          title: shortButton(section.title || 'خيارات'),
          rows: (section.rows || []).slice(0, 10).map(row => ({
            id: String(row.id || '').slice(0, 200),
            title: shortButton(row.title || ''),
            description: String(row.description || '').slice(0, 72)
          }))
        }))
      }
    };
  }

  throw new Error(`INTERACTIVE_TYPE_UNSUPPORTED:${interactive.type}`);
}

function interactiveFallbackText(interactive) {
  if (!interactive) {
    return 'أهلًا وسهلًا بك في مطبخ اليوم المركزي 🌿\nاكتب ما تحتاجه وسنكمل معك مباشرة.';
  }

  if (interactive.type === 'button') {
    const lines = (interactive.buttons || []).map((button, index) => `${index + 1}- ${button.title}`);
    return `${String(interactive.body || '').trim()}\n\n${lines.join('\n')}\n\nاكتب الخيار نصًا كما يظهر أمامك.`;
  }

  if (interactive.type === 'list') {
    const rows = (interactive.sections || []).flatMap(section => section.rows || []);
    const lines = rows.map((row, index) => `${index + 1}- ${row.title}${row.description ? ` — ${row.description}` : ''}`);
    return `${String(interactive.body || '').trim()}\n\n${lines.join('\n')}\n\nاكتب اسم الخيار المطلوب نصًا.`;
  }

  return 'أهلًا وسهلًا بك في مطبخ اليوم المركزي 🌿\nاكتب ما تحتاجه وسنكمل معك مباشرة.';
}

async function sendWhatsAppInteractive(rootDir, to, interactive) {
  let normalized;

  try {
    normalized = normalizeInteractivePayload(interactive);
  } catch (error) {
    console.error('WHATSAPP_INTERACTIVE_NORMALIZE_ERROR', {
      to,
      message: error?.message || null,
      interactive
    });

    return sendWhatsAppText(rootDir, to, interactiveFallbackText(interactive));
  }

  const payload = { type: 'interactive', interactive: normalized };
  const result = await sendWhatsAppPayload(to, payload);

  logWebhook('OUTGOING_INTERACTIVE', {
    to,
    status: result.status || null,
    metaError: result.data?.error || null,
    type: normalized.type,
    body: normalized.body?.text || null
  });

  try {
    await saveOutgoingMessage(rootDir, {
      id: crypto.randomUUID(),
      phone: to,
      message_type: `interactive_${normalized.type}`,
      content: normalized.body?.text || '',
      raw_payload: {
        request_interactive: normalized,
        response: result.data || null,
        status: result.status || null
      }
    });
  } catch (error) {
    console.error('MESSAGES_LOG_SUPABASE_ERROR', error);
  }

  if (!result.status || result.status < 200 || result.status >= 300) {
    console.error('WHATSAPP_SEND_ERROR', {
      to,
      status: result.status || null,
      data: result.data || null,
      request_interactive: normalized
    });

    return sendWhatsAppText(rootDir, to, interactiveFallbackText(interactive));
  }

  return result;
}
