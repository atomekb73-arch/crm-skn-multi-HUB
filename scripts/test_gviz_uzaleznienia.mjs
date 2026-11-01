const sheetId = '1xIJDJP2PpIJY8EfaY2gf6Qcq3YBcSCKX3BW-oO92u6Y';

async function fetchGviz(sheetName = 'Zarz%C4%85dzanie') {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheetName}`;
  console.log('Fetching:', url);
  try {
    const res = await fetch(url);
    const text = await res.text();
    // parse GViz response: /*O_o*/ google.visualization.Query.setResponse({...});
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
    if (!match) {
      console.log('No gviz match. Text prefix:', text.slice(0, 200));
      return null;
    }
    const json = JSON.parse(match[1]);
    console.log('Status:', json.status, 'Cols:', json.table?.cols?.length, 'Rows:', json.table?.rows?.length);
    return json.table;
  } catch (err) {
    console.error('Error fetching sheet:', err.message);
  }
}

async function run() {
  const table = await fetchGviz('Zarz%C4%85dzanie');
  if (table && table.rows) {
    console.log('Sample Row 0:', JSON.stringify(table.rows[0]?.c?.map(c => c?.v)));
    console.log('Sample Row 1:', JSON.stringify(table.rows[1]?.c?.map(c => c?.v)));
    console.log('Sample Row 2:', JSON.stringify(table.rows[2]?.c?.map(c => c?.v)));
    console.log('Sample Row 3:', JSON.stringify(table.rows[3]?.c?.map(c => c?.v)));
  }

  // Check other sheets: Formularz, Kwarantanna, Spotkania, etc.
  for (const name of ['Kwarantanna', 'Zgłoszenia', 'Odpowiedzi', 'Rejestr_Zgloszen', 'Ewidencja_Obecnosci']) {
    console.log(`Checking sheet ${name}:`);
    await fetchGviz(name);
  }
}

run();
