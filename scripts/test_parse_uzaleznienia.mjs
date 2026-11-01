const sheetId = '1xIJDJP2PpIJY8EfaY2gf6Qcq3YBcSCKX3BW-oO92u6Y';

async function parseUzaleznieniaSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Zarz%C4%85dzanie`;
  const res = await fetch(url);
  const text = await res.text();
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!match) return;
  const json = JSON.parse(match[1]);
  const rows = json.table?.rows || [];

  console.log('Total rows in Zarządzanie:', rows.length);

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

  const members = [];
  const attendanceRecords = [];

  const meetingCols = [
    { code: 'M01', col: 31, name: 'M01 Spotkanie organizacyjne', date: '2026-05-27' },
    { code: 'M02', col: 32, name: 'M02 Wykład: Historia profilaktyki uzależnień | mgr Sławomir Pietrzak', date: '2026-06-08' },
    { code: 'M03', col: 33, name: 'M03 II Spotkanie SKN - Luźne rozmowy', date: '2026-06-25' },
    { code: 'M04', col: 34, name: 'M04 Warsztaty Programu Profilaktycznego Unplugged', date: '2026-07-16' },
    { code: 'M05', col: 35, name: 'M05 Spotkanie naukowe', date: '2026-08-10' },
  ];

  for (let i = 2; i < rows.length; i++) {
    const c = rows[i].c || [];
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

    const m = {
      organization_id: 'uzaleznienia',
      index_number: rawIndex,
      full_name: fullName,
      email: email.toLowerCase(),
      phone: phone,
      field_of_study: 'Psychologia',
      study_year: 'Rok 1-3',
      activity_status: memberStatus,
      verification_date: '2026-03-26',
      joined_date: '2026-03-26',
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

  console.log(`Parsed ${members.length} members for uzaleznienia.`);
  console.log(`Parsed ${attendanceRecords.length} attendance records for uzaleznienia.`);
  console.log('Sample member:', members[0]);
  console.log('Sample member last:', members[members.length - 1]);
}

parseUzaleznieniaSheet();
