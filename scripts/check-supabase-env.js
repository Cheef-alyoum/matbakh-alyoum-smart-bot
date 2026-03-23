const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Missing Supabase env vars:', missing.join(', '));
  process.exit(1);
}
console.log('Supabase env looks ready.');
