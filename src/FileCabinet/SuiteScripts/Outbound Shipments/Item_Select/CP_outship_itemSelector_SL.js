/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/ui/dialog', 'N/task', '../lib/CP_outship_suiteql_lib.js'] /**
 * @param{serverWidget} serverWidget
 * @param{dialog} dialog
 * @param{task} task
 * @param{suitqlLib} suiteqlLib
 */, (serverWidget, dialog, task, suiteqlLib) => {
    /**
     * Defines the Suitelet script trigger point.
     * @param {Object} scriptContext
     * @param {ServerRequest} scriptContext.request - Incoming request
     * @param {ServerResponse} scriptContext.response - Suitelet response
     * @since 2015.2
     */
    const onRequest = scriptContext => {
        const { request, response } = scriptContext;

        log.debug({ title: `Request and Response were`, details: `${request} and ${response}` });
        let parameters = scriptContext.request.parameters;
        log.debug({ title: `Parameters were `, details: JSON.stringify(parameters) });
        let action = parameters.action;
        let outboundShipment = parameters.id;

        if (request.method === 'GET') {
            if (action === 'mr') {
                //SUITELET CALLED TO INITIATE FULFILLMENT OF OUTBOUND SHIPMENT FROM MR SCRIPT
                let mrTask = task.create({ taskType: task.TaskType.MAP_REDUCE });
                mrTask.scriptId = `customscript_cp_outship_fulfill_mr`;
                mrTask.deploymentId = `customdeploy_cp_outship_fulfill_mr`;
                mrTask.params = {
                    custscript_cp_outship_fulfill_payload: outboundShipment
                };

                let mrTaskId = mrTask.submit();

                let responseObject = {
                    name: 'mrTaskId',
                    value: mrTaskId
                };

                response.write({
                    output: JSON.stringify(responseObject)
                });
            } else if (action === 'shippable') {
                //SUITELET CALLED TO INVOKE A MANUAL CHECK OF SHIPPABLE STATUS
                let mrTask = task.create({ taskType: task.TaskType.MAP_REDUCE });
                mrTask.scriptId = `customscript_cp_outship_shippable_mr`;
                mrTask.deploymentId = `customdeploy_cp_outship_shippable_mr`;
                mrTask.params = {
                    custscript_cp_outhship_osid: outboundShipment
                };

                let mrTaskId = mrTask.submit();
            } else if (action === 'wosync') {
                //SUITELET CALLED TO INVOKE A MANUAL SYNC OF RELATED WORK ORDERS
                let mrTask = task.create({ taskType: task.TaskType.MAP_REDUCE });
                mrTask.scriptId = `customscript_cp_outship_wo_sync_mr`;
                mrTask.deploymentId = `customdeploy_cp_outship_wo_sync_mr`;
                mrTask.params = {
                    custscript_cp_outhship_wo_mr_osid: outboundShipment
                };

                let mrTaskId = mrTask.submit();
            } else {
                showForm(request.parameters, response);
            }
        } else {
            setParentLineValues(request.parameters, response);
        }
    };

    const showForm = (parameters, response) => {
        const { soId, location, soLinesPresentJSON } = parameters;
        const soLines = suiteqlLib.lookupFulfillableLines(soId, location, soLinesPresentJSON);
        //const soLines = suiteqlLib.lookupAddableSoLines(soId, location, soLinesPresentJSON);
        const form = serverWidget.createForm({
            title: 'Sales Order Lines',
            hideNavBar: true
        });

        //TRUE IF NO LINES RETURNED
        const soLinesIsEmpty = Object.keys(soLines).length === 0;

        //log.debug({ title: 'soLinesPresent was ', details: soLinesIsEmpty });

        form.clientScriptModulePath = './CP_outship_itemSelector_CS.js';

        if (!soLinesIsEmpty) {
            //ADDABLE LINES WERE FOUND
            let selectedLine = 0;

            //HIDDEN FIELD
            let field = form.addField({
                id: 'custpage_solines',
                label: 'Sales Order Lines',
                type: serverWidget.FieldType.LONGTEXT
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });
            field.defaultValue = JSON.stringify(soLines);

            //SHIPMENT ITEM TRANSACTION - tl_lineuniquekey - soLines[key] - custpage_soline
            field = form.addField({
                id: 'custpage_soline',
                label: 'Select Sales Order Line',
                type: serverWidget.FieldType.SELECT
            });
            field.updateLayoutType({
                layoutType: serverWidget.FieldLayoutType.OUTSIDE
            });
            field.updateBreakType({
                breakType: serverWidget.FieldBreakType.STARTROW
            });
            Object.keys(soLines).forEach(value => {
                if (!selectedLine) {
                    selectedLine = value;
                }

                field.addSelectOption({
                    value,
                    text: soLines[value].display,
                    isSelected: selectedLine === value
                });
            });

            //SHIPMENT ITEM - tl_item -item - custpage_item
            field = form.addField({
                id: 'custpage_item',
                label: 'Item ID',
                type: serverWidget.FieldType.INTEGER
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });
            field.defaultValue = soLines[selectedLine]?.item;

            //ITEM DESCRIPTION - i_description - itemdesc -custpage_itemdesc
            field = form.addField({
                id: 'custpage_itemdesc',
                label: 'Item',
                type: serverWidget.FieldType.TEXT
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });
            field.updateLayoutType({
                layoutType: serverWidget.FieldLayoutType.OUTSIDE
            });
            field.updateBreakType({
                breakType: serverWidget.FieldBreakType.STARTROW
            });
            field.defaultValue = soLines[selectedLine]?.itemdesc;

            //STRUCTURE - tl_structure
            field = form.addField({
                id: 'custpage_structure',
                label: 'Structure',
                type: serverWidget.FieldType.TEXT
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });
            field.updateLayoutType({
                layoutType: serverWidget.FieldLayoutType.OUTSIDE
            });
            field.updateBreakType({
                breakType: serverWidget.FieldBreakType.STARTROW
            });
            field.defaultValue = soLines[selectedLine]?.structure;

            //UOM   -   u_name  -   uom -   custpage_uom
            field = form.addField({
                id: 'custpage_uom',
                label: 'UOM',
                type: serverWidget.FieldType.TEXT
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });
            field.defaultValue = soLines[selectedLine]?.uom;

            //QUANTITY TO FULFILL - N/A - N/A - custpage_qtytofulfill
            field = form.addField({
                id: 'custpage_qtytofulfill',
                label: 'Quantity',
                type: serverWidget.FieldType.INTEGER
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.NORMAL
            });
            field.updateLayoutType({
                layoutType: serverWidget.FieldLayoutType.OUTSIDE
            });
            field.updateBreakType({
                breakType: serverWidget.FieldBreakType.STARTROW
            });
            //field.defaultValue = 0;
            if (soLines[selectedLine]?.freightcharge) {
                field.defaultValue = 1;
            } else {
                field.defaultValue = soLines[selectedLine]?.qtyfulfillable;
            }

            //QUANTITY FULFILLABLE - tl_qtyfulfillable - qtyfulfillable - custpage_qtyfulfillable
            field = form.addField({
                id: 'custpage_qtyfulfillable',
                label: 'Quantity Fulfillable',
                type: serverWidget.FieldType.INTEGER
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });
            field.updateLayoutType({
                layoutType: serverWidget.FieldLayoutType.OUTSIDE
            });
            field.updateBreakType({
                breakType: serverWidget.FieldBreakType.STARTROW
            });
            field.defaultValue = soLines[selectedLine]?.qtyfulfillable;

            //SO RATE - tl_rate - rate - custpage_rate
            field = form.addField({
                id: 'custpage_rate',
                label: 'Rate',
                type: serverWidget.FieldType.TEXT
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });
            field.defaultValue = soLines[selectedLine]?.rate;

            //WO    -   tl_wo   -   wo  -   custpage_wo
            field = form.addField({
                id: 'custpage_wo',
                label: 'WO',
                type: serverWidget.FieldType.TEXT
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });
            field.defaultValue = soLines[selectedLine]?.wo;

            //ITEM SERIALIZED
            field = form.addField({
                id: 'custpage_isserial',
                label: 'IsSerial',
                type: serverWidget.FieldType.TEXT
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });
            field.defaultValue = soLines[selectedLine]?.isserial;

            //CUSTOMER
            field = form.addField({
                id: 'custpage_customer',
                label: 'customer',
                type: serverWidget.FieldType.INTEGER
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });
            field.defaultValue = soLines[selectedLine]?.customer;

            //ITEM TYPE
            field = form.addField({
                id: 'custpage_itemtype',
                label: 'itemtype',
                type: serverWidget.FieldType.TEXT
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });
            field.defaultValue = soLines[selectedLine]?.itemtype;

            //FREIGHT CHARGE
            field = form.addField({
                id: 'custpage_freightcharge',
                label: 'freightcharge',
                type: serverWidget.FieldType.TEXT
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });
            field.defaultValue = soLines[selectedLine]?.freightcharge;

            //SUBMIT
            form.addSubmitButton({
                label: 'Submit'
            });
        } else {
            //NO LINES FOUND DISPLAY WARNING MESSAGE
            //NO ITEMS
            field = form.addField({
                id: 'custpage_notice',
                label: 'Notice',
                type: serverWidget.FieldType.TEXT
            });
            field.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });
            field.updateLayoutType({
                layoutType: serverWidget.FieldLayoutType.OUTSIDE
            });
            field.updateBreakType({
                breakType: serverWidget.FieldBreakType.STARTROW
            });
            field.defaultValue = 'No Lines Available To Add From This Sales Order.';
        }

        response.writePage({
            pageObject: form
        });
    };

    const setParentLineValues = (parameters, response) => {
        log.debug({ title: 'setParentLineValues ran', details: `${parameters.custpage_itemtype}` });

        const soLine = parameters.custpage_soline;
        const item = parameters.custpage_item;
        const itemDesc = parameters.custpage_itemdesc;
        const uom = parameters.custpage_uom;
        const qtyToFulfill = parameters.custpage_qtytofulfill;
        const rate = parameters.custpage_rate;
        const amount = qtyToFulfill * rate;
        let wo = 0;
        //Handle Null Values On WO Or It Will Fail
        if (parameters.custpage_wo.length > 0) {
            wo = parameters.custpage_wo;
        }
        const serial = parameters.custpage_isserial;
        let structure = parameters.custpage_structure;
        if (structure === null || structure === undefined) {
            structure = '';
        }
        const customer = parameters.custpage_customer;
        const itemtype = parameters.custpage_itemtype;
        const freightcharge = parameters.custpage_freightcharge;

        const html = `
                <html>
                    <body>
                        <script language='JavaScript'>
                            if (window.opener) {
                                window.opener.require(['/SuiteScripts/Outbound Shipments/OS_Tran/CP_outship_outshiptran_CS.js'], function(openerCs) {
                                    openerCs.setLineFieldValues(${soLine}, ${item}, '${itemDesc}', ${uom}, ${qtyToFulfill}, ${rate}, ${amount}, ${wo}, '${serial}', '${structure}', '${customer}', '${itemtype}','${freightcharge}');
                                });
                            }
                            window.close();
                        </script>
                    </body>
                </html>
            `;

        response.write({
            output: html
        });
    };

    /*    function calcAllowedQty(quantity,quantityAvailable,quantityFulfilled,quantityOnShipment,quantityRemaining){
        let allowedQty

        if(quantityRemaining > quantityAvailable){
            allowedQty = (quantityAvailable - quantityOnShipment)
        } else {
            allowedQty = (quantityRemaining - quantityOnShipment)
        }
        return Math.max(0,allowedQty) //RETURN 0 INSTEAD OF NEGATIVES
    }*/

    return { onRequest };
});
