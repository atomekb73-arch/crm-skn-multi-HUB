import sys, io, zipfile, xml.etree.ElementTree as ET
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
            if s.attrib.get('name') == 'BRAMKARZ':
                target = rels.get(s.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'))
                sheet_path = 'xl/' + target if not target.startswith('xl/') else target
                with z.open(sheet_path) as sf:
                    rows = ET.parse(sf).getroot().findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
                    for r in rows[:65]:
                        vals = []
                        for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                            v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                            val = v.text if v is not None else ''
                            if c.attrib.get('t') == 's' and val.isdigit(): val = shared_strings[int(val)]
                            vals.append(val)
                        if any(vals):
                            print(f'Row {r.attrib.get("r")}:', vals[:5])
