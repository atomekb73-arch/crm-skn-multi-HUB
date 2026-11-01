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
            if name == 'M05':
                sheet_path = 'xl/' + target if not target.startswith('xl/') else target
                with z.open(sheet_path) as sf:
                    stree = ET.parse(sf)
                    rows = stree.getroot().findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
                    print(f'Total rows in {name}: {len(rows)}')
                    count = 0
                    for r in rows:
                        row_vals = []
                        for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                            v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                            val = v.text if v is not None else ''
                            if c.attrib.get('t') == 's' and val.isdigit():
                                val = shared_strings[int(val)]
                            row_vals.append(val)
                        r_num = int(r.attrib.get('r', 0))
                        if r_num >= 6 and any(row_vals[:3]):
                            count += 1
                            print(f'{count}. Row {r_num}: Name="{row_vals[0]}", FirstSeen="{row_vals[1]}", TimeInCall="{row_vals[2]}", Status="{row_vals[3] if len(row_vals)>3 else ""}", Index="{row_vals[4] if len(row_vals)>4 else ""}", ManualIndex="{row_vals[5] if len(row_vals)>5 else ""}", SemiStatus="{row_vals[6] if len(row_vals)>6 else ""}"')
                    print(f'Total participant rows: {count}')
