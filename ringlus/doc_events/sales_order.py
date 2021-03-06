import frappe, json
from frappe.utils import add_days, cint, cstr, flt, get_link_to_form, getdate, nowdate, strip_html
def on_submit_so(doc, method):
    if not doc.cost_center:
        frappe.throw("Please Generate Project Code First")
    for i in doc.budget_bom_reference:
        if i.budget_bom:
            frappe.db.sql(""" UPDATE `tabBudget BOM` SET status=%s WHERE name=%s  """, ("To Material Request", i.budget_bom))
            frappe.db.commit()


def on_submit_dn(doc, method):
    doctype = "Delivery Note" if doc.doctype == 'Sales Invoice' else doc.doctype
    for i in doc.budget_bom_reference:
        if i.budget_bom:
            frappe.db.sql(""" UPDATE `tabBudget BOM` SET status=%s WHERE name=%s  """,
                          ("To Bill ", i.budget_bom))
            frappe.db.commit()

def update_budget_bom(i):
    if i.budget_bom:
        budget_bom = frappe.db.sql(""" SELECT * FROM `tabBudget BOM` WHERE name=%s""", i.budget_bom, as_dict=1)
        status = ""
        if budget_bom[0].status == "To PO and SO":
            status = "To SO"

        elif budget_bom[0].status == "To PO":
            status = "Completed"

        frappe.db.sql(""" UPDATE `tabBudget BOM` SET status=%s WHERE name=%s""",(status, i.budget_bom))
        frappe.db.commit()

def on_cancel_so(doc, method):
    for i in doc.budget_bom_reference:
        if i.budget_bom:
            frappe.db.sql(""" UPDATE `tabBudget BOM` SET status=%s WHERE name=%s  """,("Quotation In Progress", i.budget_bom))
            frappe.db.commit()

@frappe.whitelist()
def generate_cost_centers(items, name, customer,project_code, company):
    items_data = json.loads(items)

    company = frappe.get_doc("Company", company)
    default_project_code = frappe.db.get_single_value('Global Defaults', 'default_project_code')
    if not default_project_code:
        frappe.throw("Please Set Default Project Code in Global Defaults")
    generate_cc(project_code, customer, name, company, items_data,default_project_code)

def generate_cc(project_code, customer, name, company, items_data,default_project_code):
    cc_name = ""
    if not project_code:
        args = {
            "doctype": "Cost Center",
            "cost_center_name": name,
            "is_group": 1,
            "parent_cost_center": default_project_code,
            "sales_order": name,
            'is_root': 'true'
        }
        cc = frappe.new_doc("Cost Center")
        cc.update(args)
        cc.old_parent = ""
        cc.insert()
        cc_name = cc.name

        frappe.db.sql(""" UPDATE `tabSales Order` SET cost_center=%s WHERE name=%s""", (cc_name, name))
        frappe.db.commit()
    else:
        cc_name = name + " - " + company.abbr

    for i in items_data:
        if 'project_code' not in i:
            obj = {
                "doctype": "Cost Center",
                "cost_center_name": name + "-" + i['item_code'],
                "parent_cost_center": cc_name,
                "sales_order": name
            }
            ccc = frappe.get_doc(obj).insert()
            frappe.db.sql(""" UPDATE `tabSales Order Item` SET project_code=%s WHERE name=%s""", (ccc.name, i['name']))
            frappe.db.commit()

@frappe.whitelist()
def get_work_order_items(so,for_raw_material_request=0):
    '''Returns items with BOM that already do not have a linked work order'''
    self = frappe.get_doc("Sales Order", so)
    items = []
    item_codes = [i.item_code for i in self.items]
    product_bundle_parents = [pb.new_item_code for pb in frappe.get_all("Product Bundle", {"new_item_code": ["in", item_codes]}, ["new_item_code"])]

    for table in [self.items, self.packed_items]:
        for i in table:
            bom = get_default_bom_item(i.item_code)
            stock_qty = i.qty if i.doctype == 'Packed Item' else i.stock_qty
            if not for_raw_material_request:
                total_work_order_qty = flt(frappe.db.sql('''select sum(qty) from `tabWork Order`
                    where production_item=%s and sales_order=%s and sales_order_item = %s and docstatus<2''', (i.item_code, self.name, i.name))[0][0])
                pending_qty = stock_qty - total_work_order_qty
            else:
                pending_qty = stock_qty
            print("PENDIIIIING QQQTY")
            print(pending_qty)
            for ii in range(1,int(pending_qty + 1)):
                if ii and i.item_code not in product_bundle_parents:
                    if bom:
                        items.append(dict(
                            name= i.name,
                            item_code= i.item_code,
                            description= i.description,
                            bom = bom,
                            warehouse = i.warehouse,
                            pending_qty = 1,
                            required_qty = 1 if for_raw_material_request else 0,
                            sales_order_item = i.name
                        ))
                    else:
                        items.append(dict(
                            name= i.name,
                            item_code= i.item_code,
                            description= i.description,
                            bom = '',
                            warehouse = i.warehouse,
                            pending_qty = 1,
                            required_qty = 1 if for_raw_material_request else 0,
                            sales_order_item = i.name
                        ))
    return items

def get_default_bom_item(item_code):
    bom = frappe.get_all('BOM', dict(item=item_code, is_active=True),
            order_by='is_default desc')
    bom = bom[0].name if bom else None

    return bom

@frappe.whitelist()
def make_work_orders(items, sales_order, company, project=None):
    '''Make Work Orders against the given Sales Order for the given `items`'''
    items = json.loads(items).get('items')
    out = []

    for i in items:
        if not i.get("bom"):
            frappe.throw("Please select BOM against item {0}".format(i.get("item_code")))
        if not i.get("pending_qty"):
            frappe.throw("Please select Qty against item {0}".format(i.get("item_code")))

        work_order = frappe.get_doc(dict(
            doctype='Work Order',
            production_item=i['item_code'],
            bom_no=i.get('bom'),
            qty=i['pending_qty'],
            company=company,
            sales_order=sales_order,
            sales_order_item=i['sales_order_item'],
            project=project,
            fg_warehouse=i['warehouse'],
            description=i['description']
        )).insert()
        work_order.set_work_order_operations()
        work_order.save()
        out.append(work_order)

    return [p.name for p in out]
