import sys
import io
import zipfile
import xml.etree.ElementTree as ET
import json
import csv

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 1. Wczytanie mapy członków
name_to_index = {}
with open('scripts/psychoonkologia_data/members.csv', 'r', encoding='utf-8', errors='replace') as f:
    for r in csv.reader(f):
        if len(r) > 3 and r[1].strip():
            name = r[0].strip().lower()
            idx = r[1].strip()
            name_to_index[name] = idx

print(f'Załadowano {len(name_to_index)} członków z members.csv')

extracted = []
seen_pairs = set()

with zipfile.ZipFile('scripts/psychoonkologia_full.xlsx', 'r') as z:
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

    meetings_info = {
        'M05': {'code': 'M05', 'date': '2026-06-16', 'desc': 'Rola psychoonkologa w zespole terapeutycznym'},
        'M-SPR-1': {'code': 'M-SPR-1', 'date': '2026-01-23', 'desc': 'Spotkanie sprawozdawczo-warsztatowe I'},
        'M-SPR-2': {'code': 'M-SPR-2', 'date': '2025-12-15', 'desc': 'Spotkanie sprawozdawczo-warsztatowe II'},
    }

    with z.open('xl/workbook.xml') as f:
        wbtree = ET.parse(f)
        for s in wbtree.getroot().findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
            name = s.attrib.get('name')
            if name in meetings_info:
                info = meetings_info[name]
                rId = s.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                target = rels.get(rId)
                sheet_path = 'xl/' + target if not target.startswith('xl/') else target
                with z.open(sheet_path) as sf:
                    stree = ET.parse(sf)
                    rows = stree.getroot().findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
                    matched_count = 0
                    for r in rows[5:]:
                        row_vals = {}
                        for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                            col_ref = ''.join(filter(str.isalpha, c.attrib.get('r', '')))
                            v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                            val = v.text if v is not None else ''
                            if c.attrib.get('t') == 's' and val.isdigit():
                                val = shared_strings[int(val)]
                            row_vals[col_ref] = val or ''
                        
                        full_name = (row_vals.get('A') or '').strip()
                        if not full_name or len(full_name) < 3:
                            continue
                        
                        raw_idx = (row_vals.get('E') or row_vals.get('D') or '').strip()
                        clean_idx = ''.join(filter(str.isdigit, raw_idx))
                        
                        if not clean_idx:
                            fn_lower = full_name.lower()
                            if fn_lower in name_to_index:
                                clean_idx = name_to_index[fn_lower]
                            else:
                                for nm, ix in name_to_index.items():
                                    if nm in fn_lower or fn_lower in nm:
                                        clean_idx = ix
                                        break
                        
                        if clean_idx:
                            pair_key = f"{info['code']}:{clean_idx}"
                            if pair_key not in seen_pairs:
                                seen_pairs.add(pair_key)
                                matched_count += 1
                                extracted.append({
                                    'meeting_code': info['code'],
                                    'meeting_date': info['date'],
                                    'index_number': clean_idx,
                                    'full_name': full_name,
                                    'role': 'Członek koła',
                                    'points': 1,
                                    'activity_description': f"Obecność na spotkaniu: {info['desc']}"
                                })
                    print(f"Arkusz {name}: dopasowano {matched_count} unikalnych obecności.")

output_path = 'scripts/psychoonkologia_data/attendees_extracted.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(extracted, f, ensure_ascii=False, indent=2)

print(f"Łącznie zapisano {len(extracted)} wpisów do {output_path}.")
