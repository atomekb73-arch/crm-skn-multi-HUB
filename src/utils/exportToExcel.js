export async function exportArrayToXlsx(data, fileName, sheetName = 'Raport') {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const cleanFileName = String(fileName || 'Raport').replace(/\.xlsx$/i, '');
  XLSX.writeFile(workbook, `${cleanFileName}.xlsx`);
}
