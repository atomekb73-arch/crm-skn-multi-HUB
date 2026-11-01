import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'child_process';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

// Extract raw data from M05 sheet
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

async function generateAttendance() {
  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('organization_id', 'uzaleznienia');

  console.log(`Fetched ${members.length} members for uzaleznienia`);

  const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();

  const byIndex = new Map();
  const byEmail = new Map();
  const byNormName = new Map();

  for (const m of members) {
    if (m.index_number) byIndex.set(String(m.index_number).trim(), m);
    if (m.email) byEmail.set(m.email.toLowerCase().trim(), m);
    if (m.full_name) byNormName.set(norm(m.full_name), m);
  }

  // Explicit known aliases / special participant overrides
  const specialAliases = {
    'arleta': '11323', // Arleta Żygowska
    'basia twardowska': '36892', // Barbara Twardowska
    'madzia moszninska': '11683', // Magdalena Mosznińska
    'marcel harabin': '14021', // Marcin Harabin
    'sylwia grela- orlowska': '37110', // Sylwia Grela-Orlowska
    'sylwia grela-orlowska': '37110',
    'joanna schelle': '13146', // Joanna Schmidt (email: jo.schelle@gmail.com)
    'marek zarski': '24166', // Marek Żarski
    'katarzyna zaorska podsiadlo': '26814',
    'katarzyna zaorska-podsiadlo': '26814',
  };

  const recordsToInsert = [];

  for (const p of rawParticipants) {
    const rawName = p.rawName.trim();
    const normName = norm(rawName);
    const rawIdx = (p.indexManual || p.indexAuto || '').replace(/\D/g, '').trim();

    // Duration and join time
    const durationMinutes = p.timeInCallSerial ? Math.round(Number(p.timeInCallSerial) * 24 * 60) : 60;
    const durationStr = `${durationMinutes} min`;

    let joinTime = '20:00';
    if (p.firstSeenSerial) {
      const frac = Number(p.firstSeenSerial) % 1;
      const totalSec = Math.round(frac * 86400);
      const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
      const min = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
      joinTime = `${h}:${min}`;
    }

    // Match detection
    let matchedMember = null;
    let isSpeaker = false;
    let isSupervisor = false;

    if (rawName.toLowerCase().includes('sławomir pietrzak') || rawName.toLowerCase().includes('slawomir pietrzak')) {
      isSpeaker = true;
    } else if (rawName.toLowerCase().includes('tymoteusz czerhoniak') || rawName.toLowerCase().includes('tymoteusz czerchoniak')) {
      isSpeaker = true;
    } else if (specialAliases[normName] && byIndex.has(specialAliases[normName])) {
      matchedMember = byIndex.get(specialAliases[normName]);
    } else if (rawIdx && byIndex.has(rawIdx)) {
      matchedMember = byIndex.get(rawIdx);
    } else if (byNormName.has(normName)) {
      matchedMember = byNormName.get(normName);
    } else {
      for (const [nKey, m] of byNormName.entries()) {
        const parts = normName.split(' ');
        if (parts.length >= 2 && nKey.includes(parts[0]) && nKey.includes(parts[parts.length - 1])) {
          matchedMember = m;
          break;
        }
      }
    }

    let role = 'Gość';
    let indexNumber = rawName;
    let points = 0;
    let status = p.statusAuto || 'Sprawdź opis';
    let manualApproved = false;
    let isEligible = false;

    if (isSpeaker) {
      role = 'Prelegent';
      indexNumber = `[SPEAKER]: ${rawName}`;
      points = 1;
      status = 'Zgodny ✔️';
      manualApproved = true;
      isEligible = true;
    } else if (matchedMember) {
      role = 'Członek koła';
      indexNumber = String(matchedMember.index_number);
      points = 1;
      status = 'Zgodny ✔️';
      manualApproved = true;
      isEligible = true;
    } else {
      role = 'Gość';
      indexNumber = rawName;
      points = 0;
      status = 'Sprawdź opis';
      manualApproved = false;
      isEligible = false;
    }

    const activityDescObj = {
      name: rawName,
      fullName: matchedMember ? matchedMember.full_name : rawName,
      rawName: rawName,
      nrIndeksu: matchedMember ? matchedMember.index_number : '',
      index: matchedMember ? matchedMember.index_number : '',
      email: matchedMember ? matchedMember.email : '',
      joinTime: joinTime,
      durationMinutes: durationMinutes,
      durationStr: durationStr,
      status: status,
      role: role,
      points: points,
      isEligible: isEligible,
      manualApproved: manualApproved,
      activeDiscussion: !!p.activeDiscussion,
      presentation: !!p.presentation,
      opisAktywnosci: `Obecność: M01 Spotkanie rekrutacyjno-organizacyjne (${status})`
    };

    recordsToInsert.push({
      organization_id: 'uzaleznienia',
      meeting_code: 'M01',
      meeting_date: '2026-10-29',
      index_number: indexNumber,
      role: role,
      points: points,
      activity_description: JSON.stringify(activityDescObj)
    });
  }

  console.log(`\nGenerated ${recordsToInsert.length} records to insert into attendance.`);
  const membersCount = recordsToInsert.filter(r => r.role === 'Członek koła').length;
  const speakersCount = recordsToInsert.filter(r => r.role === 'Prelegent').length;
  const guestsCount = recordsToInsert.filter(r => r.role === 'Gość').length;
  console.log(`Członkowie: ${membersCount}, Prelegenci: ${speakersCount}, Goście: ${guestsCount}`);

  recordsToInsert.forEach((r, idx) => {
    const desc = JSON.parse(r.activity_description);
    console.log(`${idx + 1}. [${r.role}] ${desc.fullName} (${r.index_number}) | ${desc.status} | join: ${desc.joinTime} | dur: ${desc.durationStr} | pts: ${r.points}`);
  });

  return recordsToInsert;
}

generateAttendance();
