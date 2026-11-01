import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zlpvnxzqylfghdxgkyyf.supabase.co';
const supabaseKey = 'sb_publishable_LvTzZNNQRupmV2qVgyMKbg_DhAbs3Dm';
const supabase = createClient(supabaseUrl, supabaseKey);

const SHEET_ID = '1xIJDJP2PpIJY8EfaY2gf6Qcq3YBcSCKX3BW-oO92u6Y';

async function fetchGvizSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  const text = await res.text();
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!match) return null;
  const json = JSON.parse(match[1]);
  return json.table?.rows || [];
}

const cellStr = (c) => (c && c.v !== null && c.v !== undefined ? String(c.v).trim() : '');
const cellNum = (c) => {
  if (!c || c.v === null || c.v === undefined) return null;
  const n = Number(c.v);
  return isNaN(n) ? null : n;
};
const isAttended = (c) => {
  if (!c) return 0;
  const v = c.v;
  if (v === 1 || v === '1' || String(v).toLowerCase() === 'tak' || String(v).toLowerCase() === 'true') return 1;
  return 0;
};

function parseGvizDate(c) {
  if (!c || !c.v) return null;
  const v = String(c.v);
  const m = v.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
  if (m) {
    const y = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    const h = m[4] ? parseInt(m[4], 10) : 12;
    const min = m[5] ? parseInt(m[5], 10) : 0;
    const sec = m[6] ? parseInt(m[6], 10) : 0;
    const dt = new Date(Date.UTC(y, month, d, h, min, sec));
    return dt.toISOString();
  }
  return null;
}

export async function prepareData() {
  console.log('Fetching Zarządzanie...');
  const zarzRows = await fetchGvizSheet('Zarz%C4%85dzanie');
  console.log('Fetching Baza_Kwarantanna...');
  const kwarRows = await fetchGvizSheet('Baza_Kwarantanna');

  const members = [];
  const attendanceRecords = [];

  const meetingCols = [
    { code: 'M01', col: 31, name: 'M01 Spotkanie organizacyjne', date: '2026-05-27' },
    { code: 'M02', col: 32, name: 'M02 Wykład: Historia profilaktyki uzależnień | mgr Sławomir Pietrzak', date: '2026-06-08' },
    { code: 'M03', col: 33, name: 'M03 II Spotkanie SKN - Luźne rozmowy', date: '2026-06-25' },
    { code: 'M04', col: 34, name: 'M04 Warsztaty Programu Profilaktycznego Unplugged', date: '2026-07-16' },
    { code: 'M05', col: 35, name: 'M05 Spotkanie naukowe', date: '2026-08-10' },
  ];

  for (let i = 2; i < zarzRows.length; i++) {
    const c = zarzRows[i].c || [];
    const email = cellStr(c[0]);
    const fullName = cellStr(c[1]);
    const phone = cellStr(c[2]);
    const rawIndex = String(cellNum(c[3]) ?? cellStr(c[3]) ?? '').replace(/\D/g, '');
    const statusText = cellStr(c[6]);
    const rawPoints = cellNum(c[7]) ?? 0;

    if (!fullName || fullName.toLowerCase().includes('imię i nazwisko') || fullName.toLowerCase().includes('- wpisz -')) {
      continue;
    }
    if (!email && !rawIndex) continue;

    const isResigned = /rezygnacja|byli|rezygn/i.test(statusText);
    const memberStatus = isResigned ? 'Rezygnacja' : (statusText || 'Aktywny');
    const submissionIso = parseGvizDate(c[4]) || '2026-03-26T10:00:00.000Z';
    const verificationDateStr = parseGvizDate(c[5])?.slice(0, 10) || '2026-03-26';

    const m = {
      organization_id: 'uzaleznienia',
      index_number: rawIndex,
      full_name: fullName,
      email: email.toLowerCase(),
      phone: phone,
      field_of_study: 'Psychologia',
      study_year: 'Rok 1-3',
      activity_status: memberStatus,
      verification_date: verificationDateStr,
      joined_date: verificationDateStr,
      mailing_consent: true,
      total_points: rawPoints,
      custom_fields: {
        aliasy: cellStr(c[15]),
        cert_status: cellStr(c[11]) || (rawPoints >= 20 ? 'MOŻNA WYDAĆ' : 'W toku'),
        source: 'Google Sheet SKNU',
        attendance_count: 0,
      }
    };

    let attCount = 0;
    meetingCols.forEach(mCol => {
      const attended = isAttended(c[mCol.col]);
      if (attended) {
        attCount++;
        if (rawIndex) {
          attendanceRecords.push({
            organization_id: 'uzaleznienia',
            meeting_code: mCol.code,
            meeting_date: mCol.date,
            index_number: rawIndex,
            role: 'member',
            points: 1,
            activity_description: `Obecność: ${mCol.name}`
          });
        }
      }
    });

    m.custom_fields.attendance_count = attCount;
    members.push(m);
  }

  // Parsowanie kwarantanny
  const quarantineSubmissions = [];
  if (kwarRows && kwarRows.length > 0) {
    for (let i = 0; i < kwarRows.length; i++) {
      const c = kwarRows[i].c || [];
      const subDate = parseGvizDate(c[1]);
      const email = cellStr(c[2]) || cellStr(c[5]);
      const firstName = cellStr(c[3]);
      const lastName = cellStr(c[4]);
      const fullName = (firstName + ' ' + lastName).trim();
      const rawIndex = String(cellNum(c[6]) ?? cellStr(c[6]) ?? '').replace(/\D/g, '');
      const field = cellStr(c[7]) || 'Psychologia';
      const studyYear = cellStr(c[8]) || 'Rok 1';
      const isApproved = c[0]?.v === true;

      if (!fullName && !email) continue;

      quarantineSubmissions.push({
        organization_id: 'uzaleznienia',
        submission_date: subDate || '2026-03-26T12:00:00.000Z',
        index_number: rawIndex,
        full_name: fullName,
        email: email.toLowerCase(),
        field_of_study: field,
        study_year: studyYear,
        consents_ok: true,
        decision_status: isApproved ? 'Zatwierdzony' : 'Oczekuje',
        decision_date: isApproved ? '2026-03-26T12:00:00.000Z' : null,
        decision_author: isApproved ? 'Administrator CRM' : null,
        academic_year: '2026/2027',
        custom_fields: {
          phone: cellStr(c[9]),
          source: 'Baza_Kwarantanna (SKNU)'
        }
      });
    }
  }

  return { members, attendanceRecords, quarantineSubmissions };
}

async function run() {
  const data = await prepareData();
  console.log(`Prepared ${data.members.length} members`);
  console.log(`Prepared ${data.attendanceRecords.length} attendance records`);
  console.log(`Prepared ${data.quarantineSubmissions.length} quarantine submissions`);
}

run();
