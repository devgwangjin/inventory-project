import os
import xml.etree.ElementTree as ET

base_dir = r'C:\Users\rberm\.gemini\antigravity\scratch\xlsm_extracted\xl'
output_sql = r'C:\Users\rberm\.gemini\antigravity\scratch\inventory-web\inserts.sql'

def escape_sql(val):
    if not val:
        return 'NULL'
    val = str(val).replace("'", "''")
    return f"'{val}'"

def parse_data():
    ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    
    # 1. Read shared strings
    tree = ET.parse(f'{base_dir}/sharedStrings.xml')
    root = tree.getroot()
    strs = []
    for si in root.findall('ns:si', ns):
        texts = si.findall('.//ns:t', ns)
        val = ''.join(t.text or '' for t in texts)
        strs.append(val)
        
    def get_val(c):
        t_attr = c.get('t', '')
        v = c.find('ns:v', ns)
        if v is None or v.text is None: return ''
        if t_attr == 's':
            try: return strs[int(v.text)]
            except: return ''
        return v.text

    # 2. Map sheet names to file names
    wb = ET.parse(f'{base_dir}/workbook.xml')
    wbroot = wb.getroot()
    sheets = {}
    for sh in wbroot.findall('.//ns:sheet', ns):
        rid = sh.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id', '')
        sheets[sh.get('name', '')] = rid
        
    rels_tree = ET.parse(f'{base_dir}/_rels/workbook.xml.rels')
    rels_root = rels_tree.getroot()
    rid_to_file = {rel.get('Id'): rel.get('Target') for rel in rels_root}

    def read_sheet(name):
        rid = sheets.get(name)
        if not rid: return []
        fname = rid_to_file.get(rid)
        fpath = f'{base_dir}/{fname}'
        if not os.path.exists(fpath): return []
        
        tree = ET.parse(fpath)
        root = tree.getroot()
        rows = []
        for row in root.findall('.//ns:row', ns):
            r_data = {}
            for c in row.findall('ns:c', ns):
                ref = c.get('r', '')
                col = ''.join(filter(str.isalpha, ref))
                r_data[col] = get_val(c)
            if r_data:
                rows.append(r_data)
        return rows

    # 3. Generate SQL Inserts
    with open(output_sql, 'w', encoding='utf-8') as f:
        f.write("-- Supabase Migration SQL\n\n")
        
        # Clients
        print("Parsing Clients...")
        clients = read_sheet('tbl거래처등록')
        client_code_to_id = {}
        for idx, row in enumerate(clients[1:]): # skip header
            code = row.get('C', '')
            name = row.get('D', '')
            if not code or not name or code == '거래처코드': continue
            c_id = idx + 1
            client_code_to_id[code] = c_id
            
            bno = row.get('E', '')
            rep = row.get('F', '')
            btype = row.get('G', '')
            bitem = row.get('H', '')
            mgr = row.get('I', '')
            phone = row.get('J', '')
            email = row.get('K', '')
            addr = row.get('L', '')
            note = row.get('M', '')
            
            sql = f"INSERT INTO clients (id, code, name, business_no, representative, business_type, business_item, manager, phone, email, address, note) VALUES ({c_id}, {escape_sql(code)}, {escape_sql(name)}, {escape_sql(bno)}, {escape_sql(rep)}, {escape_sql(btype)}, {escape_sql(bitem)}, {escape_sql(mgr)}, {escape_sql(phone)}, {escape_sql(email)}, {escape_sql(addr)}, {escape_sql(note)});\n"
            f.write(sql)
            
        f.write("\n")
            
        # Products
        print("Parsing Products...")
        products = read_sheet('tbl품목등록')
        product_code_to_id = {}
        for idx, row in enumerate(products[1:]):
            code = row.get('C', '')
            name = row.get('D', '')
            if not code or not name or code == '품목코드': continue
            p_id = idx + 1
            product_code_to_id[code] = p_id
            
            unit = row.get('E', 'EA')
            note = row.get('F', '')
            
            sql = f"INSERT INTO products (id, code, name, unit, note) VALUES ({p_id}, {escape_sql(code)}, {escape_sql(name)}, {escape_sql(unit)}, {escape_sql(note)});\n"
            f.write(sql)
            
        f.write("\n")

        # Materials
        print("Parsing Materials...")
        materials = read_sheet('tbl자재등록')
        material_code_to_id = {}
        for idx, row in enumerate(materials[1:]):
            code = row.get('C', '')
            name = row.get('D', '')
            if not code or not name or code == '자재코드': continue
            m_id = idx + 1
            material_code_to_id[code] = m_id
            
            unit = row.get('E', 'EA')
            init_stock = row.get('F', '0')
            safety = row.get('G', '0')
            note = row.get('H', '')
            
            sql = f"INSERT INTO materials (id, code, name, unit, initial_stock, safety_stock, note) VALUES ({m_id}, {escape_sql(code)}, {escape_sql(name)}, {escape_sql(unit)}, {init_stock or 0}, {safety or 0}, {escape_sql(note)});\n"
            f.write(sql)
            
        f.write("\n-- Sequence updates\n")
        f.write("SELECT setval('clients_id_seq', (SELECT MAX(id) FROM clients));\n")
        f.write("SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));\n")
        f.write("SELECT setval('materials_id_seq', (SELECT MAX(id) FROM materials));\n")
        
    print(f"SQL file generated at: {output_sql}")

if __name__ == "__main__":
    parse_data()
