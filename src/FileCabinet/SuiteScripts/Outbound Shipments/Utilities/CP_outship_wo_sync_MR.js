/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/record', '../lib/CP_outship_suiteql_lib.js'] /**
 * @param{record} record
 * @param{suiteqlLib} suiteqlLib
 */, (record, suiteqlLib) => {
    /**
     * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
     * @param {Object} inputContext
     * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
     *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
     * @param {Object} inputContext.ObjectRef - Object that references the input data
     * @typedef {Object} ObjectRef
     * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
     * @property {string} ObjectRef.type - Type of the record instance that contains the input data
     * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
     * @since 2015.2
     */

    const getInputData = inputContext => {
        //LOOK FOR LINES WHERE THE LINKED WO WAS CREATED AFTER THE LINE WAS ADDED TO THE OS AND CORRECT IF FOUND
        let newWOs = suiteqlLib.lookupNewlyCreatedLinkedWOs();

        //ITERATE THROUGH RESULTS IF ANY ARE FOUND
        newWOs.forEach(newWO => {
            log.debug({title: `Newly Created WO Found`, details: ``});
            let osId = newWO.t_id;
            let osShipmentItemTran = newWO.tl_shipitemtran;
            let woId = newWO.sotl_wo;

            //LOAD THE OS
            let osRec = record.load({
                type: 'customtransaction_cp_outship',
                id: osId,
                isDynamic: false
            });

            let linesCount = osRec.getLineCount({ sublistId: 'line' });

            //ITERATE THROUGH LINES
            for (let i = 0; i < linesCount; i++) {
                let lineShipItemTran = osRec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_shipitemtran',
                    line: i
                });

                //log.debug({title: `lineShipItemTran was`, details: lineShipItemTran});
                //log.debug({title: `osShipmentItemTran was`, details: osShipmentItemTran});

                //SET THE NEW WO ID TO THE COLUMN IT BELONGS IN MATCHING BY THE SHIPMENTITEMTRAN KEY
                if (parseInt(lineShipItemTran) === parseInt(osShipmentItemTran)) {
                    osRec.setSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_cp_outship_wo',
                        line: i,
                        value: woId
                    });
                }
            }

            //SAVE THE OS
            try {
                let id = osRec.save();
                //log.debug({ title: `OS saved successfully with new WO information`, details: id });
            } catch (e) {
                //log.error({ title: 'OS FAILED to save with new WO information. NetSuite said ', details: e.message });
            }
        });

        let openWoLines = suiteqlLib.lookupOpenWoLines();
        let instructionSet = [];

        // First, collect all unique woIds
        let uniqueWoIds = [];
        let woIdSet = new Set();

        openWoLines.forEach(line => {
            if (line.tl_wo && !woIdSet.has(line.tl_wo)) {
                uniqueWoIds.push(line.tl_wo);
                woIdSet.add(line.tl_wo);
            }
        });

        // Query poured weights for all unique WOs using batch lookup
        let woWeightsMap = {};
        if (uniqueWoIds.length > 0) {
            const batchResults = suiteqlLib.lookupWoWeightsBatch(
              uniqueWoIds
            );
            batchResults.forEach(result => {
                woWeightsMap[result.wo_id] = result.poured_weight || 0;
            });
        }

        // Now build instructionSet with the cached weights
        openWoLines.forEach(line => {
            let instruction = {
                osId: line.t_id,
                lineId: line.tl_id,
                woId: line.tl_wo,
                woStatus: line.wo_status,
                pouredWeight: woWeightsMap[line.tl_wo] || 0
            };

            instructionSet.push(instruction);
        });


        return instructionSet;
    };

    /**
     * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
     * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
     * context.
     * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
     *     is provided automatically based on the results of the getInputData stage.
     * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
     *     function on the current key-value pair
     * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
     *     pair
     * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
     *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
     * @param {string} mapContext.key - Key to be processed during the map stage
     * @param {string} mapContext.value - Value to be processed during the map stage
     * @since 2015.2
     */

    const map = mapContext => {
        //GROUP EVERYTHING BY OUTBOUND SHIPMENT

        //log.debug({ title: `**Entering MAP Stage**`, details: JSON.stringify(mapContext) });
        let result = JSON.parse(mapContext.value);
        //log.debug({ title: `result in Map was `, details: JSON.stringify(result) });

        let myValue = {
            lineId: result.lineId,
            woId: result.woId,
            woStatus: result.woStatus,
            pouredWeight: result.pouredWeight
        };

        //log.debug({ title: `myValue was`, details: myValue });

        mapContext.write({
            key: result.osId,
            value: myValue
        });
    };

    /**
     * Defines the function that is executed when the reduce entry point is triggered. This entry point is triggered
     * automatically when the associated map stage is complete. This function is applied to each group in the provided context.
     * @param {Object} reduceContext - Data collection containing the groups to process in the reduce stage. This parameter is
     *     provided automatically based on the results of the map stage.
     * @param {Iterator} reduceContext.errors - Serialized errors that were thrown during previous attempts to execute the
     *     reduce function on the current group
     * @param {number} reduceContext.executionNo - Number of times the reduce function has been executed on the current group
     * @param {boolean} reduceContext.isRestarted - Indicates whether the current invocation of this function is the first
     *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
     * @param {string} reduceContext.key - Key to be processed during the reduce stage
     * @param {List<String>} reduceContext.values - All values associated with a unique key that was passed to the reduce stage
     *     for processing
     * @since 2015.2
     */
    const reduce = reduceContext => {
        //log.debug({ title: `**Entering REDUCE Stage**`, details: JSON.stringify(reduceContext) });
        let myKey = reduceContext.key;
        let myValues = reduceContext.values;
        //log.debug({ title: `key and values were`, details: `Key: ${myKey} Values: ${myValues}` });

        // LOAD EACH OUTBOUND SHIPMENT

        let osRec = record.load({
            type: 'customtransaction_cp_outship',
            id: myKey,
            isDynamic: false
        });

        let originalGlobalAllWoBegun = osRec.getValue({fieldId:'custbody_cp_outship_allwo_begun'});
        let osChanged = false;
        let linesCount = osRec.getLineCount({ sublistId: 'line' });

        myValues.forEach(value => {
            let parsedValue = JSON.parse(value);
            let lineId = parsedValue.lineId;
            let woStatus = parsedValue.woStatus;
            let woId = parsedValue.woId;
            let pouredWeight = parsedValue.pouredWeight;

            // woBEGUN FALSE UNLESS IN PROECCESS, CLOSED OR BUILT THEW woBEGUN TRUE
            let woBegun = false;

            switch (woStatus) {
                case 'In Process': {
                    woBegun = true;
                    break;
                }
                case 'Closed': {
                    woBegun = true;
                    break;
                }
                case 'Built': {
                    woBegun = true;
                    break;
                }
            }

            // ITERATE THROUGH THE LINE ITEMS
            for (let i = 0; i < linesCount; i++) {
                let line = osRec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'line',
                    line: i
                });

                // WHEN A TRANSACTION LINE MATCHING A LINE NUMBER FROM OUR DATASET IS FOUND
                if (parseInt(lineId) === parseInt(line)) {
                    // RECORD THE WORK ORDER BEGUN VALUE BEFORE ANY MODIFICATION
                    let originalWoBegun = osRec.getSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_cp_outship_wo_begun',
                        line: i
                    });

                    // CHANGE WO_BEGUN COLUMN FIELD IF THE DATASET VALUE IS DIFFERENT FROM THE CURRENT LINE VALUE
                    if(originalWoBegun !== woBegun){
                        osRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_cp_outship_wo_begun',
                            line: i,
                            value: woBegun
                        });
                        osChanged = true; // FLAG THAT A CHANGE HAS BEEN MADE TO THE OS SO SAVE WILL OCCUR
                    }

                    // RECORD THE WORK ORDER STATUS BEFORE ANY MODIFICATION
                    let originalWoStatus = osRec.getSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_cp_outship_wo_status',
                        line: i
                    });

                    // CHANGE WO_STATUS COLUMN FIELD IF THE DATASET VALUE IS DIFFERENT FROM THE CURRENT LINE VALUE
                    if(originalWoStatus !== woStatus){
                        osRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_cp_outship_wo_status',
                            line: i,
                            value: woStatus
                        });
                        osChanged = true; // FLAG THAT A CHANGE HAS BEEN MADE TO THE OS SO SAVE WILL OCCUR
                    }

                    // RECORD THE OS LINE ITEM WEIGHT BEFORE ANY MODIFICATION
                    let originalWeight = osRec.getSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_cp_outship_item_weight',
                        line: i
                    });

                    // CHANGE ITEM WEIGHT COLUMN FIELD IF THE POURED WEIGHT VALUE FROM THE DATASET IS DIFFERENT FROM THE CURRENT LINE VALUE
                    if(originalWeight !== pouredWeight){
                        osRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_cp_outship_item_weight',
                            line: i,
                            value: pouredWeight
                        });

                        // // UPDATE ACTUAL POURED WEIGHT ON WORK ORDER HEADER
                        // let id = record.submitFields({
                        //     type: 'workorder',
                        //     id: woId,
                        //     values: {
                        //         custbody_pour_weight : pouredWeight
                        //     }
                        // })

                        osChanged = true; // FLAG THAT A CHANGE HAS BEEN MADE TO THE OS SO SAVE WILL OCCUR
                    }
                }
            }
        });

        //SET THE OS HEADER ALL WORK ORDERS BEGUN FLAG TO TRUE ONLY IF ALL LINES WITH WOS HAVE IN PROCESS WOS
        let newGlobalWoBegun = true;
        for (let i = 0; i < linesCount; i++) {
            let woBegun = osRec.getSublistValue({
                sublistId: 'line',
                fieldId: 'custcol_cp_outship_wo_begun',
                line: i
            });

            let wo = osRec.getSublistValue({
                sublistId: 'line',
                fieldId: 'custcol_cp_outship_wo',
                line: i
            });

            if (woBegun === false && parseInt(wo) > 0) newGlobalWoBegun = false;
        }

        //ONLY WRITE IF CHANGED
        if(originalGlobalAllWoBegun !== newGlobalWoBegun) {
            osRec.setValue({ fieldId: 'custbody_cp_outship_allwo_begun', value: newGlobalWoBegun });
            osChanged = true; // FLAG THAT A CHANGE HAS BEEN MADE TO THE OS SO SAVE WILL OCCUR
        }

        //ONLY SAVE THE OS RECORD AND CONSUME USAGE IF IT HAS CHANGED
        if(osChanged){
            try {
                let id = osRec.save();
                log.debug({ title: `OS saved successfully`, details: id });
            } catch (e) {
                log.error({ title: 'OS failed to save. NetSuite said ', details: e.message });
            }
        }
    };

    /**
     * Defines the function that is executed when the summarize entry point is triggered. This entry point is triggered
     * automatically when the associated reduce stage is complete. This function is applied to the entire result set.
     * @param {Object} summaryContext - Statistics about the execution of a map/reduce script
     * @param {number} summaryContext.concurrency - Maximum concurrency number when executing parallel tasks for the map/reduce
     *     script
     * @param {Date} summaryContext.dateCreated - The date and time when the map/reduce script began running
     * @param {boolean} summaryContext.isRestarted - Indicates whether the current invocation of this function is the first
     *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
     * @param {Iterator} summaryContext.output - Serialized keys and values that were saved as output during the reduce stage
     * @param {number} summaryContext.seconds - Total seconds elapsed when running the map/reduce script
     * @param {number} summaryContext.usage - Total number of governance usage units consumed when running the map/reduce
     *     script
     * @param {number} summaryContext.yields - Total number of yields when running the map/reduce script
     * @param {Object} summaryContext.inputSummary - Statistics about the input stage
     * @param {Object} summaryContext.mapSummary - Statistics about the map stage
     * @param {Object} summaryContext.reduceSummary - Statistics about the reduce stage
     * @since 2015.2
     */
    const summarize = summaryContext => {
        log.audit({
            title: 'Usage units consumed',
            details: summaryContext.usage
        });
        log.audit({
            title: 'Concurrency',
            details: summaryContext.concurrency
        });
        log.audit({
            title: 'Number of yields',
            details: summaryContext.yields
        });

        //const logMRQueuesInSummary = (summaryContext) => {
        if (summaryContext.inputSummary.error) {
            let inputError = JSON.parse(summaryContext.inputSummary.error);
            log.debug({ title: 'Input Error', details: summaryContext.inputSummary.error });
        }
        let mapKeysProcessed = 0;
        let mapKeysProcessedSuccessfully = 0;
        let reduceKeysProcessed = 0;
        let reduceKeysProcessedSuccessfully = 0;
        let mapErrorCount = 0;
        let reduceErrorCount = 0;
        summaryContext.mapSummary.errors.iterator().each(function () {
            mapErrorCount++;
            // formattedErrorFormat(error, key, 'Map');
            return true;
        });
        summaryContext.mapSummary.keys.iterator().each(function (key, executionCount, completionState) {
            if (completionState === 'COMPLETE') {
                mapKeysProcessedSuccessfully++;
            }
            mapKeysProcessed++;
            return true;
        });
        summaryContext.reduceSummary.errors.iterator().each(function (key, error) {
            reduceErrorCount++;
            // formattedErrorFormat(error, key, 'Reduce');
            return true;
        });
        summaryContext.reduceSummary.keys.iterator().each(function (key, executionCount, completionState) {
            if (completionState === 'COMPLETE') {
                reduceKeysProcessedSuccessfully++;
            }
            reduceKeysProcessed++;
            return true;
        });
        if (mapErrorCount > 0) {
            log.error({
                title: 'Map stage errors',
                details: 'Total number of errors: ' + mapErrorCount
            });
        }

        log.audit({
            title: 'Map statistics',
            details: `${mapKeysProcessedSuccessfully} / ${mapKeysProcessed} completed.`
        });
        if (reduceErrorCount > 0) {
            log.error({
                title: 'Reduce stage errors',
                details: 'Total number of errors: ' + reduceErrorCount
            });
        }
        log.audit({
            title: 'Reduce statistics',
            details: `${reduceKeysProcessedSuccessfully} / ${reduceKeysProcessed} completed.`
        });
    };

    return { getInputData, map, reduce, summarize };
});
