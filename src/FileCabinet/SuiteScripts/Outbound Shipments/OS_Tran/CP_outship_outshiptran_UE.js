/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define([
    'N/record',
    'N/task',
    'N/url',
    'N/runtime',
    'N/ui/serverWidget',
    'N/ui/message',
    '../lib/CP_outship_suiteql_lib.js'
] /**
 * @param{record} record
 * @param{task} task
 * @param{url} url
 * @param{runtime} runtime
 * @param{serverWidget} serverWidget
 * @param{message} message
 * @param{suiteqlLib} suiteqlLib
 */, (record, task, url, runtime, serverWidget, message, suiteqlLib) => {
    const beforeLoad = scriptContext => {
        const { type, form } = scriptContext;
        form.clientScriptModulePath = './CP_outship_outshiptran_CS.js';

        const PARAM = 'custscript_cp_outship_max_weight'; // script/deployment parameter id

        if (type === 'view') {
            let osRec = scriptContext.newRecord;
            let tranStatus = osRec.getValue({ fieldId: 'transtatus' });
            let shippable = osRec.getValue({ fieldId: 'custbody_cp_outship_shippable' });

            // Get values (may come back as string or number)
            const totalWeight = toNumberOrNull(osRec.getValue('custbody_cp_outship_totalweight'));
            const maxWeight = toNumberOrNull(runtime.getCurrentScript().getParameter({ name: PARAM }));

            //let totalWeight = osRec.getValue({fieldId: 'custbody_cp_outship_totalweight'});
            //let maxWeight = runtime.getCurrentScript().getParameter({ name: 'custscript_cp_outship_max_weight' });

            // If maxWeight is not a decimal, show an error banner instructing user to set the script parameter
            if (maxWeight == null) {
                scriptContext.form.addPageInitMessage({
                    type: message.Type.ERROR,
                    title: 'Maximum Weight Not Configured',
                    message: `Please add the Maximum Weight in the Script Parameter (${PARAM}) of Script Deployment 'customdeploy_cp_outship_ue'.`
                });
                return; // Do not attempt comparison
            }

            // If totalWeight is missing/invalid, do nothing
            if (totalWeight == null) return;

            // Safe comparison; if it somehow can't evaluate, nothing happens
            if (totalWeight > maxWeight) {
                scriptContext.form.addPageInitMessage({
                    type: message.Type.WARNING,
                    title: 'Outbound Shipping Limit',
                    message: `Total Weight ${fmt(totalWeight)} exceeds Maximum Weight ${fmt(maxWeight)}.`
                });
            }

            //GET THE TOTAL QUANTITY OF SERIAL NUMBERS REQUIRED BEFORE FULFILLMENT CAN BE ATTEMPTED
            let linesCount = osRec.getLineCount({ sublistId: 'line' });
            let serialNumbersRequired = 0;
            let serialNumbersAssigned = 0;
            for (let i = 0; i < linesCount; i++) {
                let isSerial = osRec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_isserial',
                    line: i
                });
                if (isSerial) {
                    let serialQty = osRec.getSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_cp_outship_qtytofulfill',
                        line: i
                    });
                    serialNumbersRequired += serialQty;
                }
            }

            //IF SERIAL ITEMS PRESENT GET THE TOTAL NUMBER OF SERIAL NUMBERS CURRENTLY ASSIGNED TO THIS OS
            //ALSO DISPLAY THE DATATABLES VIEW FOR OUTBOUND SERIALS
            if (parseInt(serialNumbersRequired) > 0) {
                serialNumbersAssigned = suiteqlLib.lookupAssignedSerials(osRec.id)[0]?.serial_count;

                //LOOKUP LINKED OUTBOUND SHIPMENT SERIAL RECORDS FOR DISPLAY IN DATATABLES VIEW
                let outboundSerials = suiteqlLib.lookupLinkedOutboundSerials(osRec.id);

                //DISPLAY OUTBOUND SHIPMENT SERIALS TAB HOLDING DATATABLES VIEW
                let osTab = scriptContext.form.addTab({
                    //CREATE NEW TAB
                    id: 'custpage_os_tab',
                    label: 'Outbound Serials'
                });

                scriptContext.form.insertTab({
                    //PLACE LEFT OF COMMUNICATIONS TAB
                    tab: osTab,
                    nexttab: 'cmmnctntab'
                });

                let outboundSerialsField = scriptContext.form.addField({
                    //FIELD TO INJECT THE DATATABLES VIEW CODE INTO ONCE GENERATED
                    id: 'custpage_os_field',
                    type: serverWidget.FieldType.TEXT,
                    label: 'OUTBOUND SERIALS',
                    container: 'custpage_os_tab'
                });

                osRec.setValue({
                    fieldId: 'custpage_os_field',
                    value: outboundSerialTableGen(outboundSerials)
                });
            }

            //DETERMINE THE NUMBER OF SERIAL NUMBERS REMAINING TO BE ASSIGNED BEFORE ATTEMPTING FULFILLMENT
            let serialNumbersRemaining = serialNumbersRequired - serialNumbersAssigned;

            //DISPLAY THE CHECK SHIPPABLE BUTTON
            form.addButton({
                id: 'custpage_cp_outship_check_ship',
                label: 'Check Shippable',
                functionName: 'checkShippable()'
            });

            //DISPLAY THE SYNC WOs BUTTON
            form.addButton({
                id: 'custpage_cp_outship_sync_wos',
                label: 'Sync WOs',
                functionName: 'woSync()'
            });

            //ONLY DISPlAY IF OUTBOUND SHIPMENT STATUS IS 'TO BE FULFILLED' OR 'PARTIALLY FULFILLED'
            //AND IF ALL REQUIRED SERIAL NUMBERS HAVE BEEN ASSIGNED
            if ((tranStatus === 'A' || tranStatus === 'E') && parseInt(serialNumbersRemaining) === 0 && shippable) {
                form.addButton({
                    id: 'custpage_cp_outship_fulfill_all',
                    label: 'Fulfill All',
                    functionName: 'fulfillAll()'
                });
            }
        }

        if (type === 'edit') {
            let osRec = scriptContext.newRecord;
            let tranStatus = osRec.getValue({ fieldId: 'transtatus' });

            /*      log.debug({title: `tranStatus was`, details: tranStatus});
            log.debug({title: `typeof tranStatus was`, details: typeof tranStatus});*/

            if (tranStatus === 'B') {
                // Status is FULFILLED
                let allowedRoles = suiteqlLib.lookupEditRoles();
                log.debug({ title: `allowedRoles`, details: allowedRoles });

                let userObj = runtime.getCurrentUser();
                let userRole = userObj.role;

                if (!isUserAllowed(userRole, allowedRoles)) {
                    log.debug({ title: `Blocked`, details: `` });

                    // Add a hidden field that Client Script can detect
                    var blockEditField = form.addField({
                        id: 'custpage_block_edit',
                        type: serverWidget.FieldType.TEXT,
                        label: 'Block Edit'
                    });
                    blockEditField.updateDisplayType({
                        displayType: serverWidget.FieldDisplayType.HIDDEN
                    });
                    blockEditField.defaultValue = 'true';
                }
            }
        }
    };

    const beforeSubmit = scriptContext => {
        let { oldRecord, newRecord, type } = scriptContext;

        log.audit({
            title: 'beforeSubmit: Entry',
            details: `OS ID: ${newRecord.id || 'new'}, Operation: ${type}`
        });

        // AUDIT DELETE EVENTS
        auditDeleteOperation(scriptContext);

        //DON'T RUN ON INLINE EDITS - THIS IS HOW SCHEDULER UPDATES OCCUR
        if (type !== 'xedit') {
            log.debug({
                title: 'beforeSubmit: Processing OS update',
                details: `Operation type: ${type}, will recalculate status, weights, and charges`
            });
            let osRec = scriptContext.newRecord;
            let oldLinesCount = 0; //NO OLDRECORD ON CREATE
            if (type !== 'create') {
                oldLinesCount = scriptContext.oldRecord.getLineCount({ sublistId: 'line' });
            }
            //let tranStatus = scriptContext.oldRecord.getValue({fieldId: 'transtatus'});
            let newLinesCount = osRec.getLineCount({ sublistId: 'line' });
            let locationId = osRec.getValue({ fieldId: 'location' });

            log.debug({
                title: 'beforeSubmit: Line count check',
                details: `Old lines: ${oldLinesCount}, New lines: ${newLinesCount}`
            });

            //IF A LINE HAS BEEN ADDED CLEAR THE SHIPPABLE CHECKBOX BECAUSE WE DON'T YET KNOW IF SHIPPABLE IS TRUE
            if (newLinesCount > oldLinesCount) {
                log.debug({
                    title: 'beforeSubmit: Lines added',
                    details: `Clearing shippable flag - new lines need validation`
                });
                osRec.setValue({
                    fieldId: 'custbody_cp_outship_shippable',
                    value: false
                });
            }

            //ADD UP TOTAL QTY FULFILLED AND TOTAL QUANTITY REMAINING TO SET TRANSTATUS
            let qtyToFulfill = 0;
            let qtyFulfilled = 0;
            for (let i = 0; i < newLinesCount; i++) {
                qtyToFulfill += newRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_qtytofulfill',
                    line: i
                });
                qtyFulfilled += newRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_qty_fulfilled',
                    line: i
                });
            }

            let qtyRemaining = parseInt(qtyToFulfill) - parseInt(qtyFulfilled);
            log.debug({
                title: 'beforeSubmit: Fulfillment quantities calculated',
                details: `To Fulfill: ${qtyToFulfill}, Fulfilled: ${qtyFulfilled}, Remaining: ${qtyRemaining}`
            });

            // SET OS TRANSACTION STATUS TO PENDING FULFILLMENT
            if (qtyRemaining === parseInt(qtyToFulfill)) {
                log.debug({
                    title: 'beforeSubmit: Status set to Pending Fulfillment',
                    details: `No items fulfilled yet`
                });
                osRec.setValue({
                    fieldId: 'transtatus',
                    value: 'A'
                });
            }

            // SET OS TRANSACTION STATUS TO PARTIALLY FULFILLED
            if (qtyRemaining < parseInt(qtyToFulfill) && qtyRemaining > 0) {
                log.debug({
                    title: 'beforeSubmit: Status set to Partially Fulfilled',
                    details: `${qtyFulfilled} of ${qtyToFulfill} items fulfilled`
                });
                osRec.setValue({
                    fieldId: 'transtatus',
                    value: 'E'
                });
            }

            // SET OS TRANSACTION STATUS TO FULFILLED
            if (qtyRemaining === 0) {
                log.debug({
                    title: 'beforeSubmit: Status set to Fulfilled',
                    details: `All ${qtyToFulfill} items fulfilled`
                });
                osRec.setValue({
                    fieldId: 'transtatus',
                    value: 'B'
                });
            }

            if (locationId) {
                let currentTimezone = osRec.getValue({ fieldId: 'custbody_cp_outship_loc_tz' });

                if (!currentTimezone) {
                    let locationRec = record.load({
                        type: record.Type.LOCATION,
                        id: locationId
                    });

                    let locTimezoneOlson = locationRec.getValue('timezone'); //CASE MATTERS HERE ON FIELDID - OLSON (i.e. 'AMERICA/NEW_YORK')
                    let timezoneKey = getNetSuiteTimeZoneKey(locTimezoneOlson);
                    log.debug({
                        title: 'beforeSubmit: Setting location timezone',
                        details: `Location ${locationId}, Timezone: ${locTimezoneOlson} -> Key: ${timezoneKey}`
                    });
                    osRec.setValue({
                        fieldId: 'custbody_cp_outship_loc_tz',
                        value: timezoneKey
                    });
                } else {
                    log.debug({
                        title: 'beforeSubmit: Timezone already set',
                        details: `Location timezone already exists (${currentTimezone}), skipping update`
                    });
                }
            }

            // RECALC LINE WEIGHTS ANS SET TOTAL WEIGHT AT HEADER OF OUTBOUND SHIPMENT
            log.debug({
                title: 'beforeSubmit: Calculating line weights',
                details: `Processing ${newLinesCount} lines`
            });

            let totalWeight = 0;
            for (i = 0; i < newLinesCount; i++) {
                let qty = osRec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_qtytofulfill',
                    line: i
                });

                let itemWeight = osRec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_item_weight',
                    line: i
                });

                let lineWeight = qty * itemWeight;

                osRec.setSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_line_weight',
                    line: i,
                    value: lineWeight
                });

                totalWeight += lineWeight;
            }

            log.debug({
                title: 'beforeSubmit: Total weight calculated',
                details: `Total weight: ${totalWeight} (from ${newLinesCount} lines)`
            });
            osRec.setValue({ fieldId: 'custbody_cp_outship_totalweight', value: totalWeight });

            // UPDATE TOTAL SHIPMENT CHARGE AT HEADER
            let totalFreightCharge = 0;
            let freightLineCount = 0;
            for (i = 0; i < newLinesCount; i++) {
                let isFrieghtCharge = osRec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_freightcharge',
                    line: i
                });

                if (isFrieghtCharge) {
                    let freightCharge = osRec.getSublistValue({
                        sublistId: 'line',
                        fieldId: 'amount',
                        line: i
                    });
                    totalFreightCharge += freightCharge;
                    freightLineCount++;
                }
            }

            log.debug({
                title: 'beforeSubmit: Freight charges calculated',
                details: `Total freight: ${totalFreightCharge} (from ${freightLineCount} freight lines)`
            });
            osRec.setValue({ fieldId: 'custbody_cp_outship_charge', value: totalFreightCharge });

            log.audit({
                title: 'beforeSubmit: Complete',
                details: `OS ${newRecord.id} updated - Lines: ${newLinesCount}, Weight: ${totalWeight}, Freight: ${totalFreightCharge}`
            });
        } else {
            log.debug({
                title: 'beforeSubmit: Skipped',
                details: `Inline edit (xedit) detected - skipping calculations`
            });
        }
    };

    const afterSubmit = scriptContext => {
        let { oldRecord, newRecord, type } = scriptContext;
        //log.debug({ title: `afterSubmit type was `, details: `${type}` });

        //DON'T RUN ON INLINE EDITS - THIS IS HOW SCHEDULER UPDATES OCCUR
        if (type !== 'xedit') {
            let oldLinesCount = 0;

            if (type !== 'create') {
                oldLinesCount = oldRecord.getLineCount({ sublistId: 'line' });
            }

            let newLinesCount = newRecord.getLineCount({ sublistId: 'line' });

            let oldLines = [];
            let oldLineEntry = {};
            let newLines = [];
            let newLineEntry = {};

            for (let i = 0; i < oldLinesCount; i++) {
                let so = oldRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_sotran',
                    line: i
                });
                let soLine = oldRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_shipitemtran',
                    line: i
                });
                let qtyToFulfill = oldRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_qtytofulfill',
                    line: i
                });
                let isSerial = oldRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_isserial',
                    line: i
                });
                let osTranId = oldRecord.getValue({
                    fieldId: 'tranid'
                });
                oldLineEntry = {
                    lineId: soLine,
                    value: { qty: qtyToFulfill, soId: so, osId: newRecord.id, osTranId: osTranId, isSerial: isSerial }
                };
                oldLines.push(oldLineEntry);
            }

            for (let i = 0; i < newLinesCount; i++) {
                let so = newRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_sotran',
                    line: i
                });
                let soLine = newRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_shipitemtran',
                    line: i
                });
                let qtyToFulfill = newRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_qtytofulfill',
                    line: i
                });
                let isSerial = newRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_isserial',
                    line: i
                });
                let osTranId = newRecord.getValue({
                    fieldId: 'tranid'
                });
                newLineEntry = {
                    lineId: soLine,
                    value: { qty: qtyToFulfill, soId: so, osId: newRecord.id, osTranId: osTranId, isSerial: isSerial }
                };
                newLines.push(newLineEntry);
            }

            //log.debug({ title: `oldLines was`, details: oldLines });
            //log.debug({ title: `newLines was`, details: newLines });

            let lineDeltas = [];

            if (type !== 'delete') {
                lineDeltas = compareLines(oldLines, newLines);
            } else {
                newLines.forEach(line => {
                    lineDeltas.push({
                        lineId: line.lineId,
                        qtyDiff: line.value.qty * -1,
                        soId: line.value.soId,
                        osId: line.value.osId,
                        osTranId: line.value.osTranId,
                        isSerial: line.isSerial
                    });
                });
            }

            //log.debug({ title: `lineDeltas was`, details: lineDeltas });

            updateSOs(lineDeltas, type);

            //CHECK IF A SERIALIZED ITEM HAS BEEN ADDED - CREATE OUTBOUND SERIALS ENTRY IF SO
            for (let i = 0; i < newLinesCount; i++) {
                let isSerial = newRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_isserial',
                    line: i
                });
                if (isSerial) {
                    serialLine = {
                        itemId: newRecord.getSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_cp_outship_item',
                            line: i
                        }),

                        locationId: newRecord.getValue({
                            fieldId: 'location'
                        }),

                        osId: newRecord.id,

                        shipmentItemTran: newRecord.getSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_cp_outship_shipitemtran',
                            line: i
                        }),

                        qty: newRecord.getSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_cp_outship_qtytofulfill',
                            line: i
                        }),

                        structureText: newRecord.getSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_bpm_structure_type',
                            line: i
                        })
                    };

                    for (let i = 0; i < serialLine.qty; i++) {
                        createOutboundSerial(serialLine);
                    }
                }
            }

            //CHECK IF A SERIALIZED ITEM HAS BEEN CHANGED
            for (let i = 0; i < lineDeltas.length; i++) {
                if (lineDeltas[i].isSerial) {
                    //SERIAL LINE WAS CHANGED
                    //log.debug({title: `SERIAL LINE WAS CHANGED`, details: ``});

                    if (parseInt(lineDeltas[i].qtyDiff) < 0) {
                        //SERIAL LINE WAS REDUCED IN QTY
                        //log.debug({title: `SERIAL LINE WAS REDUCED IN QTY`, details: ``});

                        if (lineDeltas[i].oldQty - Math.abs(lineDeltas[i].qtyDiff) === 0) {
                            //SERIAL LINE WAS REMOVED ENTIRELY
                            //log.debug({title: `SERIAL LINE WAS REMOVED ENTIRELY`, details: ``});

                            let idsToDelete = suiteqlLib.lookupExistingOutboundSerialLineIds(lineDeltas[i].lineId);

                            for (let i = 0; i < idsToDelete.length; i++) {
                                //DELETE LINE
                                //log.debug({title: `DELETE LINE`, details: `${idsToDelete[i].id}`});

                                try {
                                    record.delete({
                                        type: 'customrecord_cp_outship_serials',
                                        id: idsToDelete[i].id
                                    });
                                    //log.debug({title: `Outbound Serial Record deleted SUCCESSFULLY`, details: ``});
                                } catch (e) {
                                    log.error({
                                        title: `Outbound Serial Record FAILED to delete`,
                                        details: `NetSuite said ${e.message}`
                                    });
                                }
                            }
                        }
                    }
                }
            }

            //DELETE ANY ORPHANED OUTBOUND SERIAL RECORDS
            //DELETING AN OS RECORD WITH ASSOCIATED OUTBOUND SERIAL LINES WILL CREATE ORPHANS
            if (type === 'delete') {
                let orphanedIds = suiteqlLib.lookupOrphanedOutboundSerials();
                orphanedIds.forEach(orphanedId => {
                    try {
                        let result = record.delete({
                            type: 'customrecord_cp_outship_serials',
                            id: orphanedId.id
                        });
                    } catch (e) {
                        log.error({
                            title: `Orphaned Outbound Serial Failed to Delete`,
                            details: `NetSuite said ${e.message}`
                        });
                    }
                });
            }
        }
    };

    function compareLines(oldLines, newLines) {
        const deltas = [];
        const oldLines_map = new Map(oldLines.map(item => [item.lineId, item.value]));
        const newLines_map = new Map(newLines.map(item => [item.lineId, item.value]));

        //EXISTING LINE
        for (const [lineId, value] of oldLines_map) {
            if (newLines_map.has(lineId)) {
                if (newLines_map.get(lineId).qty !== value.qty) {
                    deltas.push({
                        lineId,
                        oldQty: value.qty,
                        qtyDiff: newLines_map.get(lineId).qty - value.qty,
                        soId: newLines_map.get(lineId).soId,
                        osId: newLines_map.get(lineId).osId,
                        osTranId: newLines_map.get(lineId).osTranId,
                        isSerial: value.isSerial
                    });
                }
            } else {
                deltas.push({
                    lineId,
                    oldQty: value.qty,
                    qtyDiff: -value.qty,
                    soId: value.soId,
                    osId: value.osId,
                    osTranId: value.osTranId,
                    isSerial: value.isSerial
                });
            }
        }

        //NEW LINE
        for (const [lineId, value] of newLines_map) {
            if (!oldLines_map.has(lineId)) {
                deltas.push({
                    lineId,
                    qtyDiff: value.qty,
                    soId: value.soId,
                    osId: value.osId,
                    osTranId: value.osTranId,
                    isSerial: value.isSerial
                });
            }
        }

        return deltas;
    }

    function updateSOs(lineDeltas, type) {
        function groupBy(objectArray, property) {
            return objectArray.reduce(function (acc, obj) {
                const key = obj[property];
                if (!acc[key]) {
                    acc[key] = [];
                }
                acc[key].push(obj);
                return acc;
            }, {});
        }

        const groupedSOs = groupBy(lineDeltas, 'soId');

        //log.debug({ title: `groupedSOs`, details: groupedSOs });

        let lineId, qtyDiff, osId, osTranId;

        for (let [key, value] of Object.entries(groupedSOs)) {
            let soId = key;

            let soRec = record.load({
                type: record.Type.SALES_ORDER,
                id: soId,
                isDynamic: false
            });

            let linesCount = soRec.getLineCount({ sublistId: 'item' });

            value.forEach(line => {
                lineId = line.lineId;
                qtyDiff = line.qtyDiff;
                osId = line.osId;
                osTranId = line.osTranId;

                for (let i = 0; i < linesCount; i++) {
                    let lineUniqueKey = soRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'lineuniquekey',
                        line: i
                    });

                    //log.debug({ title: `lineUniqueKey was `, details: lineUniqueKey });

                    if (parseInt(lineId) === parseInt(lineUniqueKey)) {
                        let origQtyOnShip = soRec.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_cp_outship_qtyonship',
                            line: i
                        });

                        //log.debug({ title: `origQtyOnShip was `, details: origQtyOnShip });

                        let newQtyOnShip = origQtyOnShip + qtyDiff;
                        if (newQtyOnShip < 0) {
                            newQtyOnShip = 0;
                        }

                        //log.debug({ title: `newQtyOnShip is `, details: newQtyOnShip });
                        //log.debug({ title: `i was`, details: i });

                        soRec.setSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_cp_outship_qtyonship',
                            line: i,
                            value: parseInt(newQtyOnShip)
                        });

                        //SET THE MULTI-SELECT FIELD FOR OUTBOUND SHIPMENTS LINKED TO THIS LINE

                        let fieldValue = soRec.getSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_cp_outship_ostran_so',
                            line: i
                        });

                        if (fieldValue) {
                            let currentOsValues = JSON.parse(fieldValue);
                            let indexOfCurrentOs = currentOsValues.findIndex(
                                current => parseInt(current.osId) === osId
                            );
                            if (type === 'delete') {
                                //IF FOUND REMOVE
                                if (indexOfCurrentOs) {
                                    currentOsValues.splice(indexOfCurrentOs, 1);
                                }
                            } else {
                                //THIS WILL BE AN EDIT IF NOT FOUND ADD
                                if (!indexOfCurrentOs) {
                                    let osValue = {
                                        osId,
                                        osTranId
                                    };
                                    currentOsValues.push(osValue);
                                }
                            }
                            //SET THE FIELD VALUE WITH THE NEW ARRAY
                            soRec.setSublistValue({
                                sublistId: 'item',
                                fieldId: 'custcol_cp_outship_ostran_so',
                                line: i,
                                value: JSON.stringify(currentOsValues)
                            });
                        } else {
                            let currentOsValue = [];
                            if (osId && osTranId) {
                                let currentOsValues = [];
                                let osValue = {
                                    osId,
                                    osTranId
                                };
                                currentOsValues.push(osValue);

                                //SET THE FIELD VALUE WITH THE NEW ARRAY
                                soRec.setSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'custcol_cp_outship_ostran_so',
                                    line: i,
                                    value: JSON.stringify(currentOsValues)
                                });
                            }
                        }
                    }
                }
            });

            try {
                let id = soRec.save();
                //log.debug({ title: `SO saved successfully`, details: id });
            } catch (e) {
                log.error({ title: 'SO failed to save. NetSuite said ', details: e.message });
            }
        }
    }

    function test() {
        let soId = 96819;
        let soLinesToFulfill = ['{"qty":1,"lineId":128480,"osId":96818}', '{"qty":11,"lineId":128583,"osId":96818}'];
        let soLineToFulfill = {};
        let soLinesToFulfill2 = [];

        let soRec = record.load({
            type: record.Type.SALES_ORDER,
            id: soId,
            isDynamic: false
        });
        let soLineCount = soRec.getLineCount({ sublistId: 'item' });

        //ITERATE THROUGH ARRAY OF OUTBOUND SHIPMENTS LINE OBJECTS TO AND RETRIEVE THE SALES ORDER LINE NUMBER ADDING IT TO A NEW OBJECT
        soLinesToFulfill.forEach(line => {
            //CONVERT JSON STRING TO OBJECT
            soLineToFulfill = JSON.parse(line);

            //log.debug({ title: `soLineToFulfill 154 was `, details: JSON.stringify(soLineToFulfill) });
            //ENRICH BY ADDING SO ORDERLINE NUMBER TO OBJECT FROM SO
            for (let i = 0; i < soLineCount; i++) {
                let lineUniqueKey = soRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'lineuniquekey',
                    line: i
                });

                //log.debug({ title: `Comparison was`, details: `${lineUniqueKey} vs. ${soLineToFulfill.lineId}` });

                if (parseInt(soLineToFulfill.lineId) === parseInt(lineUniqueKey)) {
                    //({ title: `Match on Line Id`, details: `${lineUniqueKey}` });
                    let soLine = soRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'line',
                        line: i
                    });
                    soLineToFulfill.soLine = soLine;
                    soLinesToFulfill2.push(soLineToFulfill);
                    //log.debug({ title: `soLinesToFulfill2 is now`, details: `${JSON.stringify(soLinesToFulfill2)}` });
                    //soLineToFulfill.soLine = soLine;
                }
            }

            //log.debug({ title: `Enriched soLineToFulfill was soLineToFulfill2`, details: soLineToFulfill2 });
        });
    }

    function createOutboundSerial(serialLine) {
        //log.debug({ title: `createOuboundSerial`, details: `create() Fired with ${JSON.stringify(serialLine)}` });
        let existingCount = suiteqlLib.lookupExistingOutboundSerialLines(serialLine.shipmentItemTran);

        //log.debug({title: `existingCount`, details: `${existingCount[0].count}`});
        //log.debug({title: `qty`, details: `${serialLine.qty}`});

        if (parseInt(existingCount[0].count) < parseInt(serialLine.qty)) {
            //log.debug({title: `Able To Added New Serials Lines`, details: ``});
            let outboundSerial_rec = record.create({
                type: 'customrecord_cp_outship_serials',
                isDynamic: false
            });

            outboundSerial_rec.setValue({
                fieldId: 'custrecord_cp_outship_linked_os',
                value: serialLine.osId
            });

            outboundSerial_rec.setValue({
                fieldId: 'custrecord_cp_outship_serial_item',
                value: serialLine.itemId
            });

            outboundSerial_rec.setValue({
                fieldId: 'custrecord_cp_outship_serial_location',
                value: serialLine.locationId
            });

            outboundSerial_rec.setValue({
                fieldId: 'custrecord_cp_outship_serial_shipitemtra',
                value: serialLine.shipmentItemTran
            });

            outboundSerial_rec.setValue({
                fieldId: 'custrecord_cp_outship_structure',
                value: serialLine.structureText || ''
            });

            try {
                outboundSerial_rec.save();
                //log.debug({title: `Outbound Shipment Serial saved SUCCESSFULLY`, details: ``});
            } catch (e) {
                log.error({ title: `Outbound Shipment Serial FAILED to save`, details: `NetSuite said ${e.message}` });
            }
        } else {
            log.debug({
                title: 'Serial record creation skipped - quota satisfied',
                details: `Item ${serialLine.itemId}, ShipItemTran ${serialLine.shipmentItemTran}:${existingCount[0].count}/${serialLine.qty} records exist`
            });

        }
    }

    //HOLDS A LOOKUP TABLE OF THE MOST COMMON TIMEZONE KEYS. IF THERE IS ANOTHER WAY I HAVEN'T FOUND IT YET
    function getNetSuiteTimeZoneKey(olsonTimeZone) {
        let olsonToNetSuiteTimeZone = {
            'America/Los_Angeles': 5, // PST
            'America/Denver': 7, // MST
            'America/Phoenix': 8, // AZ
            'America/Chicago': 10, // CST
            'America/New_York': 14, // EST
            'US/East-Indiana': 15 // INDIANA
        };

        return olsonToNetSuiteTimeZone[olsonTimeZone] || null; // Return null if not found
    }

    //DATATABLES SUBLIST VIEW FOR OUTBOUND SERIALS
    function outboundSerialTableGen(outboundSerials) {
        let styleSheetLocal = `
            <style>
            /* Styled Table */
			/* https://dev.to/dcodeyt/creating-beautiful-html-tables-with-css-428l */
	
			.styled-table {
				border-collapse: collapse;
				margin: 1px 0;
				/*font-size: 0.9em;*/
				/*font-family: sans-serif;*/
				min-width: 1520px; 
				/*width: 100%;*/
			}			
	
			/*.styled-table th,
			.styled-table td {
				padding: 6px;
			}*/
	
			.styled-table thead tr {
				background-color: #E0E0E0;
				color: #000000;
				text-align: left;
				font-family: Tahoma;
			}			
	
			.styled-table tbody tr {
			    white-space: nowrap;
			    text-align: left; 
				border-bottom: thin solid #dddddd;
				height: 30px;
				font-family: Tahoma;
			}

			.styled-table tbody tr:nth-of-type(even) {
				background-color: #f3f3f3;
			}
	
			.styled-table tbody tr:hover {
				background-color: #ffffe6;
			}
			
			.styled-table tbody tr:last-of-type{
			    border-bottom: thick solid #dddddd;
			}
			
			.button-link-add {
                display: inline-block;
                padding: 5px 11px;
                background-color: #2ACC14; /* NetSuite Green */
                color: white;
                text-decoration: none;
                border-radius: 4px;
                border: .25px solid darkgray; /* Grey border */
                font-weight: bold;
                transition: background-color 0.2s ease;
                font-family: Tahoma;
            }
            
            .button-link-delete {
                display: inline-block;
                padding: 5px 11px;
                background-color: #B33125; /* NetSuite Red */
                color: white;
                text-decoration: none;
                border-radius: 4px;
                border: .25px solid darkgray; /* Grey border */
                font-weight: bold;
                transition: background-color 0.2s ease;
                font-family: Tahoma;
            }

            .button-link-add:hover {
                color: lightgray;
            }
            
            .button-link-delete:hover {
                color: lightgray;
            }
			
            </style>`;
        let styleSheetsRemote = `
            <link rel="stylesheet" type="text/css" href="https://cdn.datatables.net/2.1.8/css/dataTables.dataTables.css">
            <link rel="stylesheet" type="text/css" href="https://cdn.datatables.net/searchpanes/2.3.3/css/searchPanes.dataTables.css">
            <link rel="stylesheet" type="text/css" href="https://cdn.datatables.net/select/2.1.0/css/select.dataTables.css">
        `;
        let scriptLocalSPButton = `
            <script>     
                new DataTable('#cpoutboundserial',{
                        pageLength: 25, 
                        lengthMenu: [ 25, 50, 75, 100 ],
                        order: [[0,'asc']],
                        layout: {
                            topStart: {
                                buttons: [
                                    {
                                        extend: 'searchPanes',
                                        text: 'Filters',
                                        show: true,
                                        config: {
                                            layout: 'columns-5',
                                            columns: [1,2,3,4,5],
                                            cascadePanes: true
                                       },
                                    }
                                ]
                            },
                            topEnd: {
                                search: {
                                    placeholder: 'Search here...'
                                }
                            }
                        },
                        columnDefs: [
                                {
                                    searchPanes: {
                                        show: true,
                                        collapse: true
                                    },
                                    targets: [1,2,3,4,5]
                                }
                            ]
                        }
                     );
                //Hide The Mandatory Field Label of th cust_page field
                $(document).ready(function() {
                     $("#custpage_suiteql_field_fs_lbl").hide();
                });
            </script>
        `;
        let scriptLocalAllButtons = `
            <script>     
                new DataTable('#cpoutboundserial',{
                        language: {
                            searchPanes: {
                                clearMessage: 'Obliterate Selections',
                                collapse: { 0: 'Search Options', _: 'Search Options (%d)' }
                            }
                        },
                        pageLength: 25, 
                        lengthMenu: [ 25, 50, 75, 100 ],
                        order: [[0,'asc']],
                        layout: {
                            topStart: {
                                buttons: [
                                     {
                                        extend: 'copy',
                                        exportOptions: {
                                            columns: ':visible'
                                        }
                                    },
                                     {
                                        extend: 'csvHtml5',
                                        exportOptions: {
                                            columns: ':visible'
                                        }
                                    },
                                    {
                                        extend: 'excelHtml5',
                                        exportOptions: {
                                            columns: ':visible'
                                        }
                                    },
                                    {
                                        extend: 'pdfHtml5',
                                        exportOptions: {
                                            columns: ':visible'
                                        }
                                    },
                                    {
                                        extend: 'print',
                                        exportOptions: {
                                            columns: ':visible'
                                        }
                                    },
                                    {
                                        extend: 'searchPanes',
                                        show: true,
                                        config: {
                                            layout: 'columns-5',
                                            columns: [1,2,3,4,5],
                                            cascadePanes: true
                                       }
                                    },
                                     'colvis','pageLength'
                                ]
                            },
                            topEnd: {
                                search: {
                                    placeholder: 'Search here...'
                                }
                            }
                        },
                        columnDefs: [
                                {
                                    searchPanes: {
                                        show: true,
                                        collapse: true
                                    },
                                    targets: [1,2,3,4,5]
                                }
                            ]
                        }
                     );
                //Hide The Mandatory Field Label of th cust_page field
                $(document).ready(function() {
                     $("#custpage_suiteql_field_fs_lbl").hide();
                });
            </script>
        `;
        let scriptLocalSublistMin = `
            <script>     
                new DataTable('#cpoutboundserial',{
                        pageLength: 100, 
                        lengthMenu: [ 25, 50, 75, 100 ],
                        order: [[0,'asc']],
                        layout: {
                            topStart: null,
                            topEnd: null
                            }
                        }
                     );
                //Hide The Mandatory Field Label of th cust_page field
                $(document).ready(function() {
                     $("#custpage_os_field_fs_lbl").hide();
                });
            </script>
        `;
        let scriptsRemote = `
            <script type="text/javascript" charset="utf8" src="https://code.jquery.com/jquery-3.7.1.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/2.1.7/js/dataTables.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/searchpanes/2.3.3/js/dataTables.searchPanes.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/searchpanes/2.3.3/js/searchPanes.dataTables.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/select/2.1.0/js/dataTables.select.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/select/2.1.0/js/select.dataTables.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/buttons/3.1.2/js/dataTables.buttons.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/buttons/3.1.2/js/buttons.dataTables.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/buttons/3.1.2/js/buttons.html5.min.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/buttons/3.1.2/js/buttons.print.min.js"></script>
            <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/buttons/3.1.2/js/buttons.colVis.min.js"></script>
`;
        let tableHeader = `
            <thead>
                <tr>
                    <th>ITEM</th>			
                    <th>SERIAL</th>
                    <th>STRUCTURE</th>
                    <th>ADD/CHANGE</th>
                    <th>DELETE</th>
                </tr>
            </thead>
        `;
        let tableBody = outboundSerialTableBodyGen(outboundSerials);
        let finishedTable = `
            <div style="margin-top: 5px; border: 1px solid #ccc; padding: 4px;">
                <table id="cpoutboundserial" class="styled-table" style="width: 100%;">
                    ${tableHeader}
                    ${tableBody}
                </table>
			</div>
        `;
        let finishedTableSublist = `
            <div style="margin-top: 1px; padding: 1px; table-layout:auto; ">
                <table id="cpoutboundserial" class="styled-table" style="width: 100%;">
                    ${tableHeader}
                    ${tableBody}
                </table>
			</div>
        `;

        //log.debug({ title: `styleSheetLocal`, details: styleSheetLocal });
        //log.debug({ title: `styleSheetsRemote`, details: styleSheetsRemote });
        //log.debug({ title: `scriptsRemote`, details: scriptsRemote });
        //log.debug({ title: `finishedTableSublist`, details: finishedTableSublist });
        //log.debug({ title: `scriptLocalSublistMin`, details: scriptLocalSublistMin });

        return `
            ${styleSheetLocal}
            ${styleSheetsRemote}
            ${scriptsRemote}
            ${finishedTableSublist}
            ${scriptLocalSublistMin}
        `;
    }

    function outboundSerialTableBodyGen(outboundSerials) {
        let tableBody = `<tbody>`;

        const height = 300;
        const width = 300;
        let screenWidth = 1920; //CAN'T READ FROM BROWSER IN UE SCRIPT SO ASSUME 1920 x 1080
        let screenHeight = 1080;
        let left = (screenWidth - width) / 2;
        let top = (screenHeight - height) / 2;

        outboundSerials.forEach(serial => {
            let addButtonURL = url.resolveScript({
                scriptId: 'customscript_cp_outship_serial_select_sl',
                deploymentId: 'customdeploy_cp_outship_serial_select_sl',
                params: {
                    itemId: serial.item_id,
                    locationId: serial.location_id,
                    shipmentItemTran: serial.shipment_item_tran,
                    internalid: serial.os_id
                }
            });

            let deleteButtonURL = url.resolveScript({
                scriptId: 'customscript_cp_outship_serial_select_sl',
                deploymentId: 'customdeploy_cp_outship_serial_select_sl',
                params: {
                    internalid: serial.os_id,
                    action: 'delete'
                }
            });

            //@TODO DO NOT DISPLAY THE ADD OR DELETE BUTTONS IF STATUS IS FULFILLED
            if (typeof serial.serial !== 'string') {
                //ENTRIES W/O SERIAL NUMBERS WILL DISPLAY WITH SERIAL OF NULL WITHOUT THIS
                tableBody += `
				<tr>			
					<td>${serial.item}</td>
					<td></td>
					<td>${serial.structure}</td>
					<td>  <a href="#" onclick="window.open('${addButtonURL}','selection','dependent=yes,height=${height},width=${width},left=${left},top=${top},scrollbars=no,statusbar=no,titlebar=no,menubar=no,resizeable=yes,location=no');" class="button-link-add"<a>Add/Change</a></td>
				    <td></td>
				</tr>`;
            } else {
                tableBody += `
				<tr>			
					<td>${serial.item}</td>
					<td>${serial.serial}</td>
					<td>${serial.structure}</td>
					<td>  <a href="#" onclick="window.open('${addButtonURL}','selection','dependent=yes,height=${height},width=${height},left=${left},top=${top},scrollbars=no,statusbar=no,titlebar=no,menubar=no,resizeable=yes,location=no');" class="button-link-add"<a>Add/Change</a></td>
					<td>  <a href="#" onclick="window.open('${deleteButtonURL}','selection','dependent=yes,height=${height},width=${height},left=${left},top=${top},scrollbars=no,statusbar=no,titlebar=no,menubar=no,resizeable=yes,location=no');" class="button-link-delete"<a>Delete</a></td>
				</tr>`;
            }
        });

        tableBody += '</tbody>';

        return tableBody;
    }

    function auditDeleteOperation(scriptContext) {
        try {
            const record = scriptContext.newRecord;
            const oldRecord = scriptContext.oldRecord;

            // Only proceed if this is a delete operation
            if (scriptContext.type !== scriptContext.UserEventType.DELETE) {
                return;
            }

            // Collect comprehensive audit data
            const auditData = {
                // Core operation details
                timestamp: new Date().toISOString(),
                operation: 'DELETE',
                recordType: record.type,
                recordId: record.id,

                // User context
                userId: scriptContext.currentRecord ? scriptContext.currentRecord.getValue('entity') : 'unknown',
                userRole: runtime.getCurrentUser().role,
                userEmail: runtime.getCurrentUser().email,

                // Record data (current state)
                //recordData: {},

                // Previous state (if available)
                //oldRecordData: {},

                // System context
                executionContext: scriptContext.type,
                triggeredBy: 'beforeSubmit',

                // Request details
                requestId: scriptContext.requestId || 'unknown',

                // Field-level changes
                //modifiedFields: [],

                // Additional metadata
                metadata: {
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    environment: runtime.envType
                }
            };

            /*// Capture all field values from current record
            const fieldIds = record.getFields();
            fieldIds.forEach(fieldId => {
                try {
                    const value = record.getValue(fieldId);
                    auditData.recordData[fieldId] = {
                        value: value,
                        text: record.getText ? record.getText(fieldId) : null,
                        type: typeof value
                    };
                } catch (e) {
                    auditData.recordData[fieldId] = { error: e.message };
                }
            });

            // Capture old record state if available
            if (oldRecord) {
                const oldFieldIds = oldRecord.getFields();
                oldFieldIds.forEach(fieldId => {
                    try {
                        const oldValue = oldRecord.getValue(fieldId);
                        auditData.oldRecordData[fieldId] = {
                            value: oldValue,
                            text: oldRecord.getText ? oldRecord.getText(fieldId) : null,
                            type: typeof oldValue
                        };

                        // Track what changed
                        const currentValue = record.getValue(fieldId);
                        if (currentValue !== oldValue) {
                            auditData.modifiedFields.push({
                                field: fieldId,
                                oldValue: oldValue,
                                newValue: currentValue
                            });
                        }
                    } catch (e) {
                        auditData.oldRecordData[fieldId] = { error: e.message };
                    }
                });
            }

            // Add any custom fields or relationships you're particularly interested in
            try {
                // Example: capture related records or parent/child relationships
                if (record.getValue('custbody_related_record')) {
                    auditData.relatedRecords = {
                        related_record: record.getValue('custbody_related_record')
                    };
                }
            } catch (e) {
                // Ignore if custom fields don't exist
            }*/

            // Convert to JSON string for logging
            const auditString = JSON.stringify(auditData, null, 2);

            // Write to system log
            log.audit({
                title: `DELETE_AUDIT_${record.type}_${record.id}`,
                details: auditString
            });

            // Also log a summary for quick scanning
            log.audit({
                title: 'DELETE_SUMMARY',
                details: `User ${auditData.userEmail} deleting ${record.type} ID:${record.id} at ${auditData.timestamp}`
            });
        } catch (error) {
            // Ensure audit logging doesn't break the operation
            log.error({
                title: 'DELETE_AUDIT_ERROR',
                details: `Failed to audit delete operation: ${error.message}`
            });
        }
    }

    function toNumberOrNull(v) {
        if (v === '' || v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null; // handles strings like "123.45" and numbers
    }

    function fmt(n) {
        // nice-but-safe formatting; skip if null
        return n == null ? '' : n.toLocaleString(undefined, { maximumFractionDigits: 3 });
    }

    function isUserAllowed(userRole, allowedRoles) {
        // normalize user role to a finite number
        const u = Number(userRole);
        if (!Number.isFinite(u)) return false;

        // normalize allowed roles to finite numbers and build a Set for O(1) lookup
        const allowedSet = new Set((allowedRoles || []).map(r => Number(r)).filter(Number.isFinite));

        return allowedSet.has(u);
    }

    return { beforeLoad, beforeSubmit, afterSubmit };
});
