// Copyright (c) 2021, jan and contributors
// For license information, please see license.txt

frappe.ui.form.on('Modular Assembly', {
    opportunity: function () {
        cur_frm.call({
            doc: cur_frm.doc,
            method: 'get_sellable_product',
            args: {},
            freeze: true,
            freeze_message: "Get Modular AssemblyTemplates...",
            async:false,
            callback: (r) => {
                cur_frm.set_query("sellable_product", () => {
                    return {
                        filters:[
                            ["name", 'in',r.message],

                        ]
                    }
                })
             }
        })
    },
	refresh: function(frm) {
        cur_frm.set_query("opportunity", () => {
                    return {
                        filters:[
                            ["status", '=','Open']

                        ]
                    }
                })
         cur_frm.fields_dict.modular_assembly.grid.get_field("item_code").get_query =
                function() {
            var names = Array.from(cur_frm.doc.modular_assembly, x => "item_code" in x ? x.item_code:"")
                    var filters =  [
                        ["name", "not in", names]
                    ]
                    return {
                         filters: filters
                    }
                }
	}
});

frappe.ui.form.on('Modular Assembly Raw Material', {
    item_code: function (frm, cdt,cdn) {
        var d = locals[cdt][cdn]
        if(d.item_code){
            frappe.db.get_doc("Item", d.item_code)
                .then(doc => {
                    d.uom = doc.stock_uom
                        cur_frm.refresh_field("raw_material")
            })
        }
    }
})
function add_component(cur_frm,d) {
    if(cur_frm.doc.raw_material.length > 0 && !cur_frm.doc.raw_material[0].item_code){
        cur_frm.clear_table("raw_material")
        cur_frm.refresh_field("raw_material")
    }
    if(cur_frm.doc.operational_cost.length > 0 && !cur_frm.doc.operational_cost[0].operation){
        cur_frm.clear_table("operational_cost")
        cur_frm.refresh_field("operational_cost")
    }
    if(d.item_code){
        if(!d.old_modular_component){
            d.old_modular_component = d.item_code
            cur_frm.refresh_field(d.parentfield)
        }
        cur_frm.call({
            doc: cur_frm.doc,
            method: 'get_modular_component',
            args: {
                name: d.item_code,
                qty: d.qty,
                old_mc: d.old_modular_component
            },
            freeze: true,
            freeze_message: "Get Modular AssemblyTemplates...",
            async:false,
            callback: (r) => {
                    d.uom = r.message[0].uom
                    d.remarks= r.message[0].item_description
                    cur_frm.refresh_field("modular_assembly")


             }
        })
    }

}
frappe.ui.form.on('Modular Assembly Details', {
	item_code: function(frm, cdt, cdn) {
	    var d = locals[cdt][cdn]
      add_component(cur_frm,d)
	},
	before_modular_assembly_remove: function (frm, cdt, cdn) {
	    console.log("naa man")
        var d = locals[cdt][cdn]
	  cur_frm.call({
            doc: cur_frm.doc,
            method: 'delete_modular_component',
            args: {
                name: d.item_code,
                qty: d.qty,
                old_mc: d.old_modular_component
            },
            freeze: true,
            freeze_message: "Get Modular AssemblyTemplates...",
            async:false,
            callback: (r) => {
                    cur_frm.trigger("opportunity")
             }
        })
    },
    modular_assembly_remove: function (frm, cdt, cdn) {
	   if(cur_frm.doc.modular_assembly.length === 0){
	       cur_frm.clear_table("raw_material")
	       cur_frm.clear_table("operational_cost")
           cur_frm.refresh_fields(['raw_material', 'operational_cost'])
       }
    },
    qty: function (frm, cdt, cdn) {
	    var d =locals[cdt][cdn]
        update_tables(cur_frm,d)
    }
});

function remove_row(cur_frm, dd, table_name) {
    if(cur_frm.doc[table_name]) {
        for (var x = cur_frm.doc[table_name].length - 1; x >= 0; x -= 1) {
            if (cur_frm.doc[table_name][x].reference.includes(dd.item_code)) {
                var spliced_row = false
                var splice_index = 0
                var spliced = 0
                var reference = JSON.parse(cur_frm.doc[table_name][x].reference)
                for(var xx=0;xx<reference.length;xx+=1){
                    if(reference[xx]['item_code'] === dd.item_code && table_name === 'operational_cost'){
                        console.log("OPERATIONAL COST")
                        cur_frm.doc[table_name][x].operation_time_in_minutes -= (reference[xx]['operation_time_in_minutes'] * reference[xx]['qty'])
                        spliced = xx
                         if(cur_frm.doc[table_name][x].operation_time_in_minutes === 0){
                            spliced_row = true
                            splice_index = x
                        }
                    } else if(reference[xx]['item_code'] === dd.item_code && table_name === 'raw_material'){
                        console.log("RAW MATERIAL")
                        cur_frm.doc[table_name][x].qty -= (reference[xx]['qty'] * reference[xx]['qty_mc'])
                        if(cur_frm.doc[table_name][x].qty === 0){
                            spliced_row = true
                            splice_index = x
                        }
                        spliced = xx
                    }

                }
                reference.splice(spliced, 1);
                cur_frm.doc[table_name][x].reference = JSON.stringify(reference)
                update_qty(cur_frm)
                update_operational(cur_frm)
                if(spliced_row){
                    cur_frm.doc[table_name].splice(x, 1);
                    spliced_row = false
                }
                cur_frm.refresh_field(table_name)
            }
        }
    }
}
function update_qty(cur_frm) {
    if(cur_frm.doc.raw_material.length > 0){
        for(var x=0;x<cur_frm.doc.raw_material.length;x+=1){
            var item_row = cur_frm.doc.raw_material[x]
             var reference = JSON.parse(item_row.reference)
         var total_qty = 0
             for(var xx=0;xx<reference.length;xx+=1){
                total_qty += reference[xx]['qty'] * reference[xx]['qty_mc']
             }
             item_row.qty = total_qty
            item_row.reference = JSON.stringify(reference)
            cur_frm.refresh_field("raw_material")
        }
    }

}
function update_operational(cur_frm) {
        if(cur_frm.doc.operational_cost.length > 0) {

            for (var x = 0; x < cur_frm.doc.operational_cost.length; x += 1) {
                var item_row = cur_frm.doc.operational_cost[x]
                var reference = JSON.parse(item_row.reference)
                var total_minutes = 0
                for (var xx = 0; xx < reference.length; xx += 1) {
                    total_minutes += reference[xx]['qty'] * reference[xx]['operation_time_in_minutes']
                }
                item_row.operation_time_in_minutes = total_minutes
                item_row.reference = JSON.stringify(reference)
                cur_frm.refresh_field("operational_cost")
            }
        }
}
function update_tables(cur_frm, d) {
	if(cur_frm.doc.raw_material.length > 0){
		 for(var x=0;x<cur_frm.doc.raw_material.length;x+=1){
            var item_row = cur_frm.doc.raw_material[x]
             var reference = JSON.parse(item_row.reference)
             for(var xx=0;xx<reference.length;xx+=1){
                if(reference[xx]['item_code'] === d.item_code){
                    reference[xx]['qty_mc'] = d.qty
                }
             }
            item_row.reference = JSON.stringify(reference)
            cur_frm.refresh_field("raw_material")
        }
        update_qty(cur_frm)
	}
	if(cur_frm.doc.operational_cost.length > 0){
		 for(var x=0;x<cur_frm.doc.operational_cost.length;x+=1){
            var item_rows = cur_frm.doc.operational_cost[x]
             var references = JSON.parse(item_rows.reference)
             for(var xxx=0;xxx<references.length;xxx+=1){
                if(references[xxx]['item_code'] === d.item_code){
                    references[xxx]['qty'] = d.qty
                }
             }
            item_rows.reference = JSON.stringify(references)
            cur_frm.refresh_field("operational_cost")
        }
        update_operational(cur_frm)
	}

}
function check_items(item, cur_frm, d) {
	if(cur_frm.doc.raw_material){
		 for(var x=0;x<cur_frm.doc.raw_material.length;x+=1){
            var item_row = cur_frm.doc.raw_material[x]
            if(item_row.item_code === item.item_code){
                var reference = JSON.parse(item_row.reference)
                console.log("CHECK ITEMS QTY")
                console.log(d.qty)
                reference.push({
                    item_code: d.item_code,
                    qty: item.qty,
                    qty_mc: d.qty
                })
                item_row.reference = JSON.stringify(reference)
                cur_frm.refresh_field("raw_material")
                console.log(item_row)
                update_tables(cur_frm, item_row)
                return true
            }
        }
        return false
	}

}
function check_operational_cost(operational_cost, cur_frm,d) {
	if(cur_frm.doc.operational_cost){
		 for(var x=0;x<cur_frm.doc.operational_cost.length;x+=1){
            var item_row = cur_frm.doc.operational_cost[x]

            if( item_row.operation === operational_cost.operation){
                 var reference = JSON.parse(item_row.reference)
                reference.push({
                    item_code: d.item_code,
                    net_hour_rate: operational_cost.net_hour_rate,
                    operation_time_in_minutes: operational_cost.operation_time_in_minutes,
                    qty: d.qty
                })
                console.log(reference)
                item_row.operation_time_in_minutes += operational_cost.operation_time_in_minutes
                item_row.reference = JSON.stringify(reference)
                cur_frm.refresh_field("operational_cost")
                return true
            }
        }
        return false
	}

}