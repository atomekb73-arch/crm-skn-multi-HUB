const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const k = parts[0].trim();
    const v = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    if (k) env[k] = v;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkOrgs() {
  const { data: meetings, error: mErr } = await supabase.from('meetings').select('id, code, organization_id, date').limit(20);
  console.log('Sample meetings:', meetings?.slice(0, 5));

  const { data: meetOrgs } = await supabase.from('meetings').select('organization_id');
  const mCounts = {};
  (meetOrgs || []).forEach(r => {
    mCounts[r.organization_id] = (mCounts[r.organization_id] || 0) + 1;
  });
  console.log('Meetings counts by organization_id:', mCounts);

  const { data: attOrgs } = await supabase.from('attendance').select('organization_id');
  const counts = {};
  (attOrgs || []).forEach(r => {
    counts[r.organization_id] = (counts[r.organization_id] || 0) + 1;
  });
  console.log('Attendance counts by organization_id:', counts);

  const { data: memOrgs } = await supabase.from('members').select('organization_id');
  const memCounts = {};
  (memOrgs || []).forEach(r => {
    memCounts[r.organization_id] = (memCounts[r.organization_id] || 0) + 1;
  });
  console.log('Members counts by organization_id:', memCounts);
}
checkOrgs();
