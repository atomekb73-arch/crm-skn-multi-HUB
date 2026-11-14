export async function exportArrayToXlsx(data, fileName, sheetName = 'Raport') {
  const XLSX = await import('xlsx');
  const safeData = Array.isArray(data) && data.length > 0 ? data : [{ Informacja: 'Brak danych do wyświetlenia' }];
  const worksheet = XLSX.utils.json_to_sheet(safeData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, String(sheetName || 'Raport').slice(0, 31));
  const cleanFileName = String(fileName || 'Raport').replace(/\.xlsx$/i, '');
  XLSX.writeFile(workbook, `${cleanFileName}.xlsx`);
}

export async function exportMultipleSheetsToXlsx(sheetsMap = {}, fileName = 'Raport') {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const entries = Object.entries(sheetsMap);
  if (entries.length === 0) {
    const ws = XLSX.utils.json_to_sheet([{ Informacja: 'Brak danych' }]);
    XLSX.utils.book_append_sheet(workbook, ws, 'Raport');
  } else {
    entries.forEach(([rawSheetName, rows]) => {
      const sheetName = String(rawSheetName || 'Arkusz').slice(0, 31).replace(/[\\/?*[\]]/g, '_');
      const safeRows = Array.isArray(rows) && rows.length > 0 ? rows : [{ Informacja: 'Brak danych dla tego zestawienia' }];
      const worksheet = XLSX.utils.json_to_sheet(safeRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });
  }
  const cleanFileName = String(fileName || 'Raport').replace(/\.xlsx$/i, '');
  XLSX.writeFile(workbook, `${cleanFileName}.xlsx`);
}
