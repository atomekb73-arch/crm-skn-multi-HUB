import sys
import io
import zipfile
import xml.etree.ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with zipfile.ZipFile('scripts/uzaleznienia_full.xlsx', 'r') as z:
    shared_strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        with z.open('xl/sharedStrings.xml') as f:
            sstree = ET.parse(f)
            for si in sstree.getroot().findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                text = ''.join(t.text for t in si.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t') if t.text)
                shared_strings.append(text)

    with z.open('xl/_rels/workbook.xml.rels') as f:
        rtree = ET.parse(f)
        rels = {r.attrib['Id']: r.attrib['Target'] for r in rtree.getroot()}

    with z.open('xl/workbook.xml') as f:
        wbtree = ET.parse(f)
        for s in wbtree.getroot().findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
            name = s.attrib.get('name')
            rId = s.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            target = rels.get(rId)
            sheet_path = 'xl/' + target if not target.startswith('xl/') else target
            with z.open(sheet_path) as sf:
                stree = ET.parse(sf)
                rows = stree.getroot().findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
                first_few = []
                for r in rows[:4]:
                    row_vals = []
                    for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                        v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                        val = v.text if v is not None else ''
                        if c.attrib.get('t') == 's' and val.isdigit():
                            val = shared_strings[int(val)]
                        row_vals.append(val)
                    if any(row_vals):
                        first_few.append(' | '.join(row_vals[:6]))
                print(f"Sheet: {name} (rows: {len(rows)}) -> {first_few[:2]}")
