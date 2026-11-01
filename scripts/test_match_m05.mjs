import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

// Run python dump_all_m05_rows to get JSON or parse xlsx directly
import { spawnSync } from 'child_process';

const pyScript = `
import sys, io, json, zipfile, xml.etree.ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with zipfile.ZipFile('scripts/uzaleznienia_full.xlsx', 'r') as z:
    shared_strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        with z.open('xl/sharedStrings.xml') as f:
            for si in ET.parse(f).getroot().findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                shared_strings.append(''.join(t.text for t in si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t') if t.text))
    with z.open('xl/_rels/workbook.xml.rels') as f:
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.parse(f).getroot()}
    with z.open('xl/workbook.xml') as f:
        for s in ET.parse(f).getroot().findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
            if s.attrib.get('name') == 'M05':
                target = rels.get(s.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'))
                sheet_path = 'xl/' + target if not target.startswith('xl/') else target
                with z.open(sheet_path) as sf:
                    rows = ET.parse(sf).getroot().findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
                    out = []
                    for r in rows:
                        r_num = int(r.attrib.get('r', 0))
                        vals = []
                        for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                            v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                            val = v.text if v is not None else ''
                            if c.attrib.get('t') == 's' and val.isdigit(): val = shared_strings[int(val)]
                            vals.append(val)
                        if any(vals) and r_num >= 6:
                            out.append({
                                'row': r_num,
                                'rawName': vals[0] if len(vals) > 0 else '',
                                'firstSeenSerial': vals[1] if len(vals) > 1 else '',
                                'timeInCallSerial': vals[2] if len(vals) > 2 else '',
                                'statusAuto': vals[3] if len(vals) > 3 else '',
                                'indexAuto': vals[4] if len(vals) > 4 else '',
                                'indexManual': vals[5] if len(vals) > 5 else '',
                                'statusSemi': vals[6] if len(vals) > 6 else '',
                                'activeDiscussion': vals[7] if len(vals) > 7 else '',
                                'presentation': vals[8] if len(vals) > 8 else ''
                            })
                    print(json.dumps(out, ensure_ascii=False))
`;

const res = spawnSync('python', ['-c', pyScript], { encoding: 'utf8' });
const rawParticipants = JSON.parse(res.stdout);

async function testMatch() {
  const { data: members, error } = await supabase
    .from('members')
    .select('*')
    .eq('organization_id', 'uzaleznienia');

  console.log(`Fetched ${members.length} members for uzaleznienia`);

  // Build maps
  const byIndex = new Map();
  const byEmail = new Map();
  const byNormName = new Map();

  const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();

  for (const m of members) {
    if (m.index_number) byIndex.set(String(m.index_number).trim(), m);
    if (m.email) byEmail.set(m.email.toLowerCase().trim(), m);
    if (m.full_name) byNormName.set(norm(m.full_name), m);
  }

  console.log(`Raw participants from 29.10.2026: ${rawParticipants.length}`);

  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const p of rawParticipants) {
    const rawIdx = (p.indexManual || p.indexAuto || '').replace(/\D/g, '').trim();
    const rawName = p.rawName.trim();
    const normName = norm(rawName);

    let match = null;
    let matchType = '';

    if (rawIdx && byIndex.has(rawIdx)) {
      match = byIndex.get(rawIdx);
      matchType = 'by_index';
    } else if (byNormName.has(normName)) {
      match = byNormName.get(normName);
      matchType = 'by_exact_name';
    } else {
      // Fuzzy name matching (first + last or reverse)
      for (const [nKey, m] of byNormName.entries()) {
        const parts = normName.split(' ');
        if (parts.length >= 2 && nKey.includes(parts[0]) && nKey.includes(parts[parts.length - 1])) {
          match = m;
          matchType = 'by_fuzzy_name';
          break;
        }
      }
    }

    // Time conversion from Excel serial
    // firstSeenSerial: 46324.85221 -> time
    // timeInCallSerial: 0.039884259 -> duration in minutes (serial * 24 * 60)
    const durationMinutes = p.timeInCallSerial ? Math.round(Number(p.timeInCallSerial) * 24 * 60) : 0;
    
    // First seen time of day
    let joinTime = '20:00';
    if (p.firstSeenSerial) {
      const frac = Number(p.firstSeenSerial) % 1;
      const totalSec = Math.round(frac * 86400);
      const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
      const min = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
      joinTime = `${h}:${min}`;
    }

    if (match) {
      matchedCount++;
      console.log(`MATCHED: "${rawName}" -> ${match.full_name} (${match.index_number}) [${matchType}] duration=${durationMinutes}m join=${joinTime}`);
    } else {
      unmatchedCount++;
      console.log(`UNMATCHED: "${rawName}" rawIdx="${rawIdx}" duration=${durationMinutes}m join=${joinTime} status="${p.statusAuto}"`);
    }
  }

  console.log(`\nSummary: Matched = ${matchedCount}, Unmatched = ${unmatchedCount}, Total = ${rawParticipants.length}`);
}

testMatch();
