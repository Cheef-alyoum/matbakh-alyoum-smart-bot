const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_SCHEMA = String(process.env.SUPABASE_SCHEMA || 'public').trim() || 'public';

function cleanValue(value) {
  const normalized = String(value ?? '').trim();
  return normalized || '';
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function pruneUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(item => pruneUndefined(item)).filter(item => item !== undefined);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, pruneUndefined(item)])
        .filter(([, item]) => item !== undefined)
    );
  }

  return value === undefined ? undefined : value;
}

function encodeFilterValue(value) {
  if (value === null) return 'is.null';
  if (typeof value === 'number' || typeof value === 'boolean') return `eq.${value}`;
  return `eq.${String(value)}`;
}

function buildQueryString(filters = {}, options = {}) {
  const params = new URLSearchParams();

  const select = cleanValue(options.select || '*');
  if (select) {
    params.set('select', select);
  }

  for (const [key, value] of Object.entries(filters || {})) {
    if (value === undefined) continue;
    params.set(key, encodeFilterValue(value));
  }

  if (options.orderBy) {
    params.set('order', `${options.orderBy}.${options.ascending === false ? 'desc' : 'asc'}`);
  }

  if (options.limit) {
    params.set('limit', String(options.limit));
  }

  return params.toString();
}

function buildUrl(table, filters = {}, options = {}) {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL_NOT_CONFIGURED');
  }

  const query = buildQueryString(filters, options);
  const base = `${SUPABASE_URL}/rest/v1/${table}`;
  return query ? `${base}?${query}` : base;
}

function buildHeaders(prefer = '') {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED');
  }

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Profile': SUPABASE_SCHEMA,
    'Content-Profile': SUPABASE_SCHEMA
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

async function parseResponse(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => '');
  return text || {};
}

async function request(method, table, { filters = {}, body, options = {}, prefer = '' } = {}) {
  const url = buildUrl(table, filters, options);
  const headers = buildHeaders(prefer);

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(pruneUndefined(body))
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    const error = new Error(`SUPABASE_${method}_${table}_FAILED`);
    error.status = response.status;
    error.payload = payload;
    error.url = url;
    throw error;
  }

  return payload;
}

export function isSupabaseEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export async function selectRows(table, filters = {}, options = {}) {
  return request('GET', table, { filters, options });
}

export async function insertRows(table, rows, { returnMinimal = false } = {}) {
  const payload = Array.isArray(rows) ? rows : [rows];
  const prefer = returnMinimal ? 'return=minimal' : 'return=representation';
  return request('POST', table, { body: payload, prefer });
}

export async function upsertRow(table, row, { onConflict = '' } = {}) {
  const options = onConflict ? { on_conflict: onConflict } : {};
  const prefer = 'resolution=merge-duplicates,return=representation';
  return request('POST', table, { body: row, options, prefer });
}

export async function patchRows(table, filters = {}, patch = {}) {
  return request('PATCH', table, {
    filters,
    body: patch,
    prefer: 'return=representation'
  });
}

export async function deleteRows(table, filters = {}) {
  return request('DELETE', table, {
    filters,
    prefer: 'return=representation'
  });
}

export default {
  isSupabaseEnabled,
  selectRows,
  insertRows,
  upsertRow,
  patchRows,
  deleteRows
};
