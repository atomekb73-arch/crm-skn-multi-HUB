const sheetId = '1xIJDJP2PpIJY8EfaY2gf6Qcq3YBcSCKX3BW-oO92u6Y';

async function inspectOtherSheets() {
  const sheetNames = [
    'Kwarantanna',
    'Baza_Kwarantanna',
    'Formularz',
    'Formularz_Rekrutacyjny',
    'Odpowiedzi z formularza 1',
    'Zgłoszenia',
    'Rejestr_Zgloszen',
    'Rejestr_Dorobku',
    'Ustawienia',
  ];

  for (const name of sheetNames) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
      if (match) {
        const json = JSON.parse(match[1]);
        if (json.status === 'ok') {
          console.log(`Sheet "${name}": status=${json.status}, cols=${json.table?.cols?.length}, rows=${json.table?.rows?.length}`);
          if (json.table?.rows?.length > 0) {
            console.log(`  Row 0:`, json.table.rows[0]?.c?.slice(0, 10).map(c => c?.v));
            if (json.table.rows.length > 1) {
              console.log(`  Row 1:`, json.table.rows[1]?.c?.slice(0, 10).map(c => c?.v));
            }
          }
        } else {
          console.log(`Sheet "${name}": error status`, json);
        }
      }
    } catch (e) {
      console.log(`Sheet "${name}": error`, e.message);
    }
  }
}

inspectOtherSheets();
