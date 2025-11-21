/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define([
    'N/currentRecord',
    'N/runtime',
    'N/url',
    'N/ui/dialog',
    'N/record',
    'N/ui/message',
    '../lib/CP_outship_verifyFulfill_lib.js',
    '../lib/CP_outship_suiteql_lib.js'
] /**
 * @param{currentRecord} currentRecord
 * @param{runtime} runtime
 * @param{url} url
 * @param{dialog} dialog
 * @param{record} record
 * @param{verifyLib} verifyLib
 * @param{suiteqlLib} suiteqlLib
 *
 */, function (currentRecord, runtime, url, dialog, record, message, verifyLib, suiteqlLib) {
    //!!!COMMENT OUT THIS SECTION WHEN CREATING THE SCRIPT RECORD OR IT WILL FAIL
    //!!ERROR WILL BE SuiteScript 2.1 entry point scripts must implement one script type function.
    //REMOVE COMMENTS AFTER SCRIPT RECORD CREATION
    //NECESSARY IN ORDER TO GET PAGE INIT TO RUN IN VIEW MODE WHEN IT OTHERWISE WOULD NOT
    jQuery(document).ready(function () {
        pageInit();
    });

    /**
     * Function to be executed after page is initialized.
     *
     * @param {Object} scriptContext
     * @param {Record} scriptContext.currentRecord - Current form record
     * @param {string} scriptContext.mode - The mode in which the record is being accessed (create, copy, or edit)
     *
     * @since 2015.2
     */
    function pageInit(scriptContext) {
        console.log('pageInit ran');

        // Hide the glimpact tab element
        const glimpactElement = document.getElementById('glimpacttablnk');
        if (glimpactElement) {
            glimpactElement.style.display = 'none';
        }

        let currentURL = window.location.href;

        console.log(currentURL);

        let success = new URL(currentURL).searchParams.get('result') === 'success';
        let error = new URL(currentURL).searchParams.get('result') === 'error';
        let blocked = new URL(currentURL).searchParams.get('custparam_editblocked') === 'T';
        //console.log(hasSuccessResult); // true

        if (success) {
            let myMsg = message.create({
                title: 'Success',
                message: 'Outbound Serial Operation Successful',
                type: message.Type.CONFIRMATION
            });
            myMsg.show({ duration: 3000 });

            const newUrl = removeParam(currentURL, 'result');
            redirectAfter(newUrl, 3000); // <-- 2s delay
        } else if (error) {
            let myMsg = message.create({
                title: 'Error',
                message: 'Outbound Serial Operation Failed',
                type: message.Type.ERROR
            });
            myMsg.show({ duration: 3000 });

            const newUrl = removeParam(currentURL, 'result');
            redirectAfter(newUrl, 3000);
        } else if (blocked) {
            let myMsg = message.create({
                title: 'Edit Not Allowed',
                message: 'This fulfilled record cannot be edited by your role.',
                type: message.Type.ERROR
            });
            myMsg.show({ duration: 3000 });

            const newUrl = removeParam(currentURL, 'custparam_editblocked');
            redirectAfter(newUrl, 3000);
        }

        let rec = scriptContext.currentRecord;

        // Check if edit is blocked
        let blockEdit = rec.getValue({
            fieldId: 'custpage_block_edit'
        });

        if (blockEdit === 'true') {
            // Redirect immediately with parameter
            let recordId = rec.id;
            let recordType = rec.type;

            let viewUrl = url.resolveRecord({
                recordType: recordType,
                recordId: recordId,
                isEditMode: false
            });

            // Add custom parameter and redirect
            window.location.href = viewUrl + '&custparam_editblocked=T';
        }
    }

    /**
     * Function to be executed when field is changed.
     *
     * @param {Object} scriptContext
     * @param {Record} scriptContext.currentRecord - Current form record
     * @param {string} scriptContext.sublistId - Sublist name
     * @param {string} scriptContext.fieldId - Field name
     * @param {number} scriptContext.lineNum - Line number. Will be undefined if not a sublist or matrix field
     * @param {number} scriptContext.columnNum - Line number. Will be undefined if not a matrix field
     *
     * @since 2015.2
     */
    function fieldChanged(scriptContext) {
        const currentRec = scriptContext.currentRecord;
        const sublistId = scriptContext.sublistId;
        const fieldId = scriptContext.fieldId;
        const userObj = runtime.getCurrentUser();
        const cogsAccount = userObj.getPreference({
            name: 'COGSACCOUNT'
        });
        //console.log('cogsAccount is ' + cogsAccount);
        const projectId = currentRec.getValue({ fieldId: 'custbody_cp_outship_project' });
        //console.log('projectId is ' + projectId);

        if (sublistId === 'line') {
            if (fieldId === 'custcol_cp_outship_sotran') {
                if (projectId) {
                    currentRec.setCurrentSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_cp_outship_projectid',
                        value: projectId,
                        ignoreFieldChange: true
                    });

                    let sublistObj = currentRec.getSublist({
                        sublistId: sublistId
                    });

                    let columnObj = sublistObj.getColumn({
                        fieldId: 'custcol_cp_outship_projectid'
                    });

                    //columnObj.isDisabled = true;
                }

                if (cogsAccount) {
                    currentRec.setCurrentSublistValue({
                        sublistId: 'line',
                        fieldId: 'account',
                        value: cogsAccount,
                        ignoreFieldChange: true
                    });

                    let sublistObj = currentRec.getSublist({
                        sublistId: sublistId
                    });

                    let columnObj = sublistObj.getColumn({
                        fieldId: 'account'
                    });

                    columnObj.isDisabled = true;
                    columnObj.isDisplay = false;

                    columnObj = sublistObj.getColumn({
                        fieldId: 'amount'
                    });

                    columnObj.isDisabled = true;
                }
            }

            if (fieldId === 'custcol_cp_outship_selectitem') {
                const lineSelectorValue = currentRec.getCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_selectitem'
                });

                if (lineSelectorValue) {
                    openLineSelector(currentRec);
                }
            }
        }
    }

    function validateLine(scriptContext) {
        const currentRec = scriptContext.currentRecord;
        const sublistId = scriptContext.sublistId;

        //CALCULATE TOTAL LINE ITEM WEIGHT UPON LINE ADD
        if (sublistId === 'line') {
            let qty = currentRec.getCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'custcol_cp_outship_qtytofulfill'
            });

            let isSerial = currentRec.getCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'custcol_cp_outship_isserial'
            });

            console.log(isSerial);

            if (!isSerial) {
                console.log('isSeiral condition met');
                currentRec.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_wo',
                    value: null,
                    ignoreFieldChange: true
                });
            }

            let itemWeight = currentRec.getCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'custcol_cp_outship_item_weight'
            });

            let lineWeight = qty * itemWeight;

            currentRec.setCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'custcol_cp_outship_line_weight',
                value: lineWeight,
                ignoreFieldChange: true
            });
        }

        return true;
    }

    /**
     * Function to write or append a string value when a line is removed from the Outbound Shipment
     * Value will be picked up and reconciled to the Sales Order upon save
     */
    function validateDelete(scriptContext) {
        const currentRec = scriptContext.currentRecord;
        const sublistId = scriptContext.sublistId;

        return true;
    }

    function openLineSelector(recordObj) {
        let soId = recordObj.getCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_sotran'
        });

        let location = recordObj.getValue({ fieldId: 'location' });

        let linesCount = recordObj.getLineCount({ sublistId: 'line' });

        let soLinesPresent = [];

        for (let x = 0; x < linesCount; x++) {
            let soLine = recordObj.getSublistValue({
                sublistId: 'line',
                fieldId: 'custcol_cp_outship_shipitemtran',
                line: x
            });
            if (typeof soLine === 'number') {
                soLinesPresent.push(soLine);
            }
        }

        let soLinesPresentJSON = JSON.stringify(soLinesPresent);

        console.log('openLineSelector ran');
        console.log(soId);
        console.log(location);
        console.log(soLinesPresentJSON);

        const height = 300;
        const width = 400;
        const leftPosition = window.screen.width / 2 - (width / 2 + 10);
        const topPosition = window.screen.height / 2 - (height / 2 + 50);
        const lineSelectorUrl = url.resolveScript({
            scriptId: 'customscript_cp_outship_lineselector_sl',
            deploymentId: 'customdeploy_cp_outship_lineselector_sl',
            params: {
                soId,
                location,
                soLinesPresentJSON
            }
        });

        // console.log(parentSelectorUrl);

        window.open(
            lineSelectorUrl,
            'Lines',
            `width=${width},height=${height},left=${leftPosition},top=${topPosition},status=no,location=no,resizable=no`
        );
    }

    function setLineFieldValues(
        soLine,
        item,
        itemDesc,
        uom,
        qtyToFulfill,
        rate,
        amount,
        wo,
        serial,
        structure,
        customer,
        itemtype,
        freightcharge
    ) {
        console.log('setLineFieldValues rate was ' + rate);
        let currentRecordObj = currentRecord.get();

        //CUSTOM TRANSACTION DOESN'T ALLOW $0 LINE AMOUNTS - SETTING TO 0.01 AS WORKAROUND
        //@TODO INVESTIGATE FURTHER
        if (rate === 0) {
            rate = 0.01;
            amount = qtyToFulfill * rate;
        }

        //SHIPMENT ITEM TRANSACTION
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_shipitemtran',
            value: parseInt(soLine)
        });

        //SHIPMENT ITEM
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_item',
            value: parseInt(item)
        });

        //STRUCTURE
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_bpm_structure_type',
            value: structure
        });

        //ITEM DESCRIPTION
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_itemdesc',
            value: itemDesc
        });

        //UOM
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_uom',
            value: parseInt(uom)
        });

        //QUANTITY TO FULFILL
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_qtytofulfill',
            value: parseInt(qtyToFulfill)
        });

        //SO RATE
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_sorate',
            value: rate
        });

        //AMOUNT
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'amount',
            value: amount
        });

        //QTY FULFILLED
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_qty_fulfilled',
            value: 0
        });

        //QTY REMAINING
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_qtyremaining',
            value: parseInt(qtyToFulfill)
        });

        //WO  - VALUE IS ZERO IF THERE IS NO WO BECAUSE THE SCRIPT PARMS DONT LIKE NULLS
        if (parseInt(wo) > 0) {
            currentRecordObj.setCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'custcol_cp_outship_wo',
                value: parseInt(wo)
            });
        }

        //IS SERIAL EVAL
        let isserial = false;
        if (serial === 'T') {
            isserial = true;
        }

        //IS SERIAL WRITE
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_isserial',
            value: isserial
        });

        //CUSTOMER
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_cust',
            value: parseInt(customer)
        });

        //ITEM TYPE
        /* currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_itemtype',
            value: itemtype
        });*/

        //SHIPPABLE TRUE IF NON INVENTORY ITEM
        if ((itemtype = 'NonInvtPart')) {
            currentRecordObj.setCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'custcol_cp_outship_shippable',
                value: true
            });
        }

        //FREIGHT CHARGE EVAL
        let isFreightCharge = false;
        if (freightcharge === 'T') {
            isFreightCharge = true;
        }

        //FREIGHT CHARGE WRITE
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_freightcharge',
            value: isFreightCharge
        });

        //ITEM SELECTOR
        currentRecordObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_cp_outship_selectitem',
            value: false
        });
    }

    function fulfillAll() {
        console.log('fulfillAll ran');

        let newRecord = currentRecord.get();

        //PERFORM THE FINAL SHIPABILITY CHECK ON THIS OS
        //LOAD THE QUERY
        let lines = suiteqlLib.lookupShippableLinesSingleOS(newRecord.id);

        //TAKE THE RESULTS AND PASS THEM TO THE VERIFY FUNCTION
        let shippable = true; //DEFAULT TO TRUE BUT SET TO FALSE THE FIRST FALSE LINE RETURNED
        let qtyToFulfill, qtyCommitted, qtyOnHand, qtyAvailable;
        let instructionSet = [];
        for (const line of lines) {
            //CANT USE FOR EACH LOOP HERE BECAUSE OF THE BREAK required
            let canShipParams = {
                qtyToFulfill: line.ostl_qtyremaining,
                qtyCommitted: line.sotl_qtycommited,
                qtyOnHand: line.iil_qtyonhand,
                qtyAvailable: line.iil_qtyavailable
            };
            shippable = verifyLib.canShip(canShipParams);
            if (!shippable) break; //EXIT EARLY IF EVEN ONE LINE IS NOT SHIPPABLE
        }

        console.log(shippable);

        //WE BELIEVE THE FULFILLMENT WILL SUCCEED IF ATTEMPTED
        if (shippable) {
            //GET THE TOTAL QUANTITY OF SERIAL NUMBERS REQUIRED BEFORE FULFILLMENT CAN BE ATTEMPTED
            let linesCount = newRecord.getLineCount({ sublistId: 'line' });
            let serialNumbersRequired = 0;
            let serialNumbersAssigned = 0;
            for (let i = 0; i < linesCount; i++) {
                let isSerial = newRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_isserial',
                    line: i
                });
                if (isSerial) {
                    let serialQty = newRecord.getSublistValue({
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
                serialNumbersAssigned = suiteqlLib.lookupAssignedSerials(newRecord.id)[0]?.serial_count;
            }

            //DETERMINE THE NUMBER OF SERIAL NUMBERS REMAINING TO BE ASSIGNED BEFORE ATTEMPTING FULFILLMENT
            let serialNumbersRemaining = serialNumbersRequired - serialNumbersAssigned;

            if (parseInt(serialNumbersRemaining) === 0) {
                //GET THE URL OF THE LINE SELECTOR SUITELET WHOSE POST FUNCTION CALLS THE MR SCRIPT THAT FULFILLS
                let fulfillAllUrl = url.resolveScript({
                    scriptId: 'customscript_cp_outship_lineselector_sl',
                    deploymentId: 'customdeploy_cp_outship_lineselector_sl'
                });

                //console.log('URL was ' + fulfillAllUrl);

                //APPEND A PARAMETER TO THIS SO THAT THIS POST REQUEST TRIGGERS THE FULFILLMENT URL
                fulfillAllUrl = fulfillAllUrl + `&action=mr&id=${newRecord.id}`;

                //BUILD THE REQUEST
                const request1 = new Request(fulfillAllUrl, {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                //POST THE REQUEST AND SHOW SUCCESS OR FAILURE MESSAGE
                try {
                    post(request1);
                    let myMsg = message.create({
                        title: 'Success',
                        message: 'Item Fulfillment Request Successfully Submitted',
                        type: message.Type.CONFIRMATION
                    });
                    myMsg.show();
                } catch (e) {
                    let myMsg = message.create({
                        title: 'Error',
                        message: 'IF_Tran Request Failed To Submit',
                        type: message.Type.ERROR
                    });
                    myMsg.show();
                }
            } else {
                let myMsg = message.create({
                    title: 'Error',
                    message: 'Not All Required Serial Numbers Present.',
                    type: message.Type.ERROR
                });
                myMsg.show();
            }
        } else {
            //WE BELIEVE THE FULFILLMENT WOULD FAIL
            let myMsg = message.create({
                title: 'Error',
                message: 'All Lines Were Not Shippable. IF_Tran NOT Submitted.',
                type: message.Type.ERROR
            });
            myMsg.show();

            //UPON FAIL RUN A MANUAL INSTANCE OF THE SHIPPABLE MR SCRIPT TO UPDATE ALL ORDERS FOR BETTER UX
            checkShippable();
        }

        return true;
    }

    function checkShippable() {
        console.log('checkShippable ran');

        // Display informational banner
        let myMsg = message.create({
            title: 'Shippable Check Initiated',
            message: 'Checking inventory availability for all lines. The page will automatically refresh in 10 seconds to show updated shippable status.',
            type: message.Type.INFORMATION
        });
        myMsg.show({ duration: 10000 }); // Show for 10 seconds

        // Auto-refresh page after 10 seconds
        setTimeout(function() {
            window.location.reload();
        }, 10000);

        let newRecord = currentRecord.get();

        //GET THE URL OF THE LINE SELECTOR SUITELET WHOSE POST FUNCTION CALLS THE MR SCRIPT THAT FULFILLS
        let shippableMRUrl = url.resolveScript({
            scriptId: 'customscript_cp_outship_lineselector_sl',
            deploymentId: 'customdeploy_cp_outship_lineselector_sl'
        });

        //APPEND A PARAMETER TO THIS SO THAT THIS POST REQUEST TRIGGERS THE FULFILLMENT URL
        shippableMRUrl = shippableMRUrl + `&action=shippable&id=${newRecord.id}`;

        //BUILD THE REQUEST
        const request1 = new Request(shippableMRUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        //POST THE REQUEST
        try {
            post(request1);
        } catch (e) {
            //NO ACTION NEEDED
        }
    }

    function woSync() {
        console.log('woSync ran');

        // Display informational banner
        let myMsg = message.create({
            title: 'Work Order Sync Initiated',
            message: 'Syncing work order data. The page will automatically refresh in 10 seconds to show updated weights and statuses.',
            type: message.Type.INFORMATION
        });
        myMsg.show({ duration: 10000 }); // Show for 10 seconds

        // Auto-refresh page after 10 seconds
        setTimeout(function() {
            window.location.reload();
        }, 10000);

        let newRecord = currentRecord.get();

        log.debug({ title: `newRecord id was`, details: newRecord.id });

        //GET THE URL OF THE ITEM SELECTOR SUITELET WHOSE POST FUNCTION CALLS THE MR SCRIPT TO SYNC WOs
        let wosyncMRUrl = url.resolveScript({
            scriptId: 'customscript_cp_outship_lineselector_sl',
            deploymentId: 'customdeploy_cp_outship_lineselector_sl'
        });

        //APPEND A PARAMETER TO THIS SO THAT THIS POST REQUEST TRIGGERS THE WO sync
        wosyncMRUrl = wosyncMRUrl + `&action=wosync&id=${newRecord.id}`;

        log.debug({ title: `wosyncMRUrl was`, details: wosyncMRUrl });

        //BUILD THE REQUEST
        const request1 = new Request(wosyncMRUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        //POST THE REQUEST
        try {
            post(request1);
        } catch (e) {
            //NO ACTION NEEDED
        }
    }

    function getScreenInfo() {
        const leftPosition = window.screen.width / 2 - (width / 2 + 10);
        const topPosition = window.screen.height / 2 - (height / 2 + 50);
        return { left: leftPosition, top: topPosition };
    }

    async function post(request) {
        try {
            const response = await fetch(request);
            console.log('Response was ' + JSON.stringify(response));
            const result = await response.json();
            console.log('Success:', result);
        } catch (error) {
            console.error('Error:', error);
        }
    }

    function redirectAfter(url, ms = 2000, useReplace = true) {
        setTimeout(() => {
            if (useReplace) window.location.replace(url);
            else window.location.href = url;
        }, ms);
    }

    function removeParam(urlStr, key) {
        const u = new URL(urlStr, window.location.origin);
        u.searchParams.delete(key);
        return u.toString();
    }

    function lineInit(scriptContext) {
        const sublistId = scriptContext.sublistId;

        if (sublistId === 'line') {
            // Using jQuery (since you already have it in your code)
            jQuery('#line_copy').hide();

            // OR using vanilla JavaScript
            // let copyButton = document.getElementById('line_copy');
            // if (copyButton) {
            //     copyButton.style.display = 'none';
            // }
        }

        return true;
    }

    return {
        pageInit: pageInit,
        validateLine: validateLine,
        validateDelete: validateDelete,
        fieldChanged: fieldChanged,
        setLineFieldValues: setLineFieldValues,
        fulfillAll: fulfillAll,
        checkShippable: checkShippable,
        woSync: woSync,
        getScreenInfo: getScreenInfo,
        lineInit: lineInit
    };
});
