const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL\s*=\s*(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*(.*)/)[1].trim();
const sb = createClient(url, key);

async function testIsolation() {
  const orgs = ['skn_seksuologii', 'uzaleznienia', 'psychoonkologia'];
  for (const org of orgs) {
    const { data: mems } = await sb.from('members').select('id, index_number').eq('organization_id', org);
    const { data: att } = await sb.from('attendance').select('id, meeting_code').eq('organization_id', org);
    const { data: quar } = await sb.from('quarantine_submissions').select('id').eq('organization_id', org);
    console.log(`Tenant [${org}]: members = ${mems ? mems.length : 0}, attendance = ${att ? att.length : 0}, quarantine = ${quar ? quar.length : 0}`);
  }
}
testIsolation();
