import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyIsolation() {
  console.log('=== WERYFIKACJA IZOLACJI DANYCH MULTI-TENANT ===');

  // Seksuologia
  const { data: seksMembers } = await supabase
    .from('members')
    .select('id, full_name, index_number, total_points, organization_id')
    .eq('organization_id', 'skn_seksuologii');

  const { data: seksAtt } = await supabase
    .from('attendance')
    .select('id, meeting_code')
    .eq('organization_id', 'skn_seksuologii');

  const { data: seksQuar } = await supabase
    .from('quarantine_submissions')
    .select('id, full_name')
    .eq('organization_id', 'skn_seksuologii');

  console.log(`[Seksuologia] Członkowie: ${seksMembers?.length}, Obecności: ${seksAtt?.length}, Kwarantanna: ${seksQuar?.length}`);

  // Uzależnienia
  const { data: uzalMembers } = await supabase
    .from('members')
    .select('id, full_name, index_number, total_points, organization_id')
    .eq('organization_id', 'uzaleznienia');

  const { data: uzalAtt } = await supabase
    .from('attendance')
    .select('id, meeting_code')
    .eq('organization_id', 'uzaleznienia');

  const { data: uzalQuar } = await supabase
    .from('quarantine_submissions')
    .select('id, full_name')
    .eq('organization_id', 'uzaleznienia');

  console.log(`[Uzależnienia] Członkowie: ${uzalMembers?.length}, Obecności: ${uzalAtt?.length}, Kwarantanna: ${uzalQuar?.length}`);

  // Sprawdź czy jakikolwiek rekord ma nieprawidłowy organization_id
  const wrongSeks = seksMembers?.filter(m => m.organization_id !== 'skn_seksuologii');
  const wrongUzal = uzalMembers?.filter(m => m.organization_id !== 'uzaleznienia');

  console.log('Rekordy skażone w seksuologii:', wrongSeks?.length || 0);
  console.log('Rekordy skażone w uzależnieniach:', wrongUzal?.length || 0);

  console.log('Sample Seksuologia:', seksMembers?.[0]?.full_name, `(indeks: ${seksMembers?.[0]?.index_number})`);
  console.log('Sample Uzależnienia:', uzalMembers?.[0]?.full_name, `(indeks: ${uzalMembers?.[0]?.index_number})`);
}

verifyIsolation().catch(console.error);
