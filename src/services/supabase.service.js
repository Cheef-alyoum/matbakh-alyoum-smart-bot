const baseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const schema = process.env.SUPABASE_SCHEMA || 'public';

export function isSupabaseEnabled() {
  return Boolean(baseUrl && serviceRoleKey);
}

function buildHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'return=representation',
    ...extra
  };
}

function buildUrl(table, query = '') {
  const suffix = query ? `?${query}` : '';
  return `${baseUrl}/rest/v1/${table}${suffix}`;
}

async function handleResponse(response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.hint || 'Supabase request failed');
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export async function upsertRow(table, payload, options = {}) {
  const params = new URLSearchParams();
  if (options.onConflict) params.set('on_conflict', options.onConflict);
  const headers = buildHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' });
  const response = await fetch(buildUrl(table, params.toString()), {
    method: 'POST',
    headers,
    body: JSON.stringify(Array.isArray(payload) ? payload : [payload])
  });
  const data = await handleResponse(response);
  return Array.isArray(data) ? data[0] : data;
}

export async function insertRows(table, payload, options = {}) {
  const headers = buildHeaders({ Prefer: options.returnMinimal ? 'return=minimal' : 'return=representation' });
  const response = await fetch(buildUrl(table), {
    method: 'POST',
    headers,
    body: JSON.stringify(Array.isArray(payload) ? payload : [payload])
  });
  return handleResponse(response);
}

export async function selectRows(table, filters = {}, options = {}) {
  const params = new URLSearchParams();
  params.set('select', options.select || '*');
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      params.set(key, `in.(${value.join(',')})`);
    } else {
      params.set(key, `eq.${value}`);
    }
  }
  if (options.orderBy) {
    params.set('order', `${options.orderBy}.${options.ascending === false ? 'desc' : 'asc'}`);
  }
  if (options.limit) params.set('limit', String(options.limit));

  const response = await fetch(buildUrl(table, params.toString()), {
    method: 'GET',
    headers: buildHeaders()
  });
  return handleResponse(response);
}

export async function patchRows(table, filters = {}, payload = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, `eq.${value}`);
  }
  const response = await fetch(buildUrl(table, params.toString()), {
    method: 'PATCH',
    headers: buildHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(payload)
  });
  const data = await handleResponse(response);
  return Array.isArray(data) ? data[0] : data;
}


export async function deleteRows(table, filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, `eq.${value}`);
  }
  const response = await fetch(buildUrl(table, params.toString()), {
    method: 'DELETE',
    headers: buildHeaders({ Prefer: 'return=representation' })
  });
  return handleResponse(response);
}
