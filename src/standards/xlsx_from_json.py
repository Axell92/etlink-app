#!/usr/bin/env python3
"""standards.json -> standards_시트용.xlsx (Google Sheet 'standards' 탭에 붙여넣는 형식, 14열)"""
import json, pathlib
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
HERE = pathlib.Path(__file__).resolve().parent
COLS = ['id','order','cat','equip','item','sub','stage','kr_std','kr_crit','intl_std','intl_crit','note','tag','updated']
rows = json.load(open(HERE / 'standards.json', encoding='utf-8'))
rows.sort(key=lambda r: r['order'])
wb = Workbook(); ws = wb.active; ws.title = 'standards'; ws.append(COLS)
for c in ws[1]: c.font = Font(bold=True); c.fill = PatternFill('solid', fgColor='DDDDDD')
for r in rows: ws.append([r.get(k, '') for k in COLS])
for col, w in zip('ABCDEFGHIJKLMN', [10,7,14,12,30,14,8,28,50,28,60,40,6,11]): ws.column_dimensions[col].width = w
for row in ws.iter_rows(min_row=2):
    for c in row: c.alignment = Alignment(wrap_text=True, vertical='top'); c.number_format = '@'
wb.save(HERE / 'standards_시트용.xlsx'); print(len(rows), 'rows')
