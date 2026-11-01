import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log('--- Inspecting Supabase Tables ---');
  
  // 1. Sprawdź members
  const { data: members, error: mErr } = await supabase.from('members').select('*').limit(3);
  console.log('members count sample:', members?.length, 'error:', mErr);
  if (members && members[0]) {
    console.log('members columns:', Object.keys(members[0]));
    console.log('members sample row:', members[0]);
  }

  // 2. Sprawdź unikalne organization_id w members
  const { data: mOrgs } = await supabase.from('members').select('organization_id');
  const orgCounts = {};
  mOrgs?.forEach(r => {
    orgCounts[r.organization_id] = (orgCounts[r.organization_id] || 0) + 1;
  });
  console.log('members distinct organization_id:', orgCounts);

  // 3. Sprawdź attendance
  const { data: att, error: aErr } = await supabase.from('attendance').select('*').limit(3);
  console.log('attendance sample:', att?.length, 'error:', aErr);
  if (att && att[0]) {
    console.log('attendance columns:', Object.keys(att[0]));
  }
  const { data: aOrgs } = await supabase.from('attendance').select('organization_id');
  const attOrgCounts = {};
  aOrgs?.forEach(r => {
    attOrgCounts[r.organization_id] = (attOrgCounts[r.organization_id] || 0) + 1;
  });
  console.log('attendance distinct organization_id:', attOrgCounts);

  // 4. Sprawdź quarantine_submissions
  const { data: quar, error: qErr } = await supabase.from('quarantine_submissions').select('*').limit(3);
  console.log('quarantine sample:', quar?.length, 'error:', qErr);
  if (quar && quar[0]) {
    console.log('quarantine columns:', Object.keys(quar[0]));
  }
  const { data: qOrgs } = await supabase.from('quarantine_submissions').select('organization_id');
  const qOrgCounts = {};
  qOrgs?.forEach(r => {
    qOrgCounts[r.organization_id] = (qOrgCounts[r.organization_id] || 0) + 1;
  });
  console.log('quarantine distinct organization_id:', qOrgCounts);

  // 5. Sprawdź organization_settings
  const { data: orgSet, error: osErr } = await supabase.from('organization_settings').select('*');
  console.log('organization_settings rows:', orgSet?.length, 'error:', osErr);
  if (orgSet && orgSet.length > 0) {
    console.log('organization_settings sample:', orgSet.slice(0, 5));
  }

  // 6. Sprawdź board_terms
  const { data: bt, error: btErr } = await supabase.from('board_terms').select('*');
  console.log('board_terms rows:', bt?.length, 'error:', btErr);
  if (bt && bt.length > 0) {
    console.log('board_terms sample:', bt);
  }

  // 7. Sprawdź email_templates
  const { data: et, error: etErr } = await supabase.from('email_templates').select('*');
  console.log('email_templates rows:', et?.length, 'error:', etErr);
}

inspect().catch(console.error);
