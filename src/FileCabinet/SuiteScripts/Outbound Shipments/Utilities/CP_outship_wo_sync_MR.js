/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/record', 'N/runtime', '../lib/CP_outship_suiteql_lib.js'] /**
 * @param{record} record
 * @param{runtime} runtime
 * @param{suiteqlLib} suiteqlLib
 */, (record, runtime, suiteqlLib) => {

    /**
     * CLEANUP UTILITY: Syncs newly created Work Orders to Outbound Shipments
     *
     * This function handles a timing edge case where a Work Order is created
     * after an Outbound Shipment line was added. When this occurs, the WO ID
     * needs to be retroactively linked to the correct OS line by matching on
     * the shipmentitemtran key.
     *
     * This cleanup runs before the main map/reduce processing begins.
     *
     */
    const syncNewlyCreatedWorkOrders = () => {
        const newWOs = suiteqlLib.lookupNewlyCreatedLinkedWOs();

        log.audit({
            title: 'Cleanup: Newly created linked WOs found',
            details: `Count: ${newWOs.length}`
        });

        if (newWOs.length === 0) {
            return;
        }

        let linkedCount = 0;

        newWOs.forEach(newWO => {
            const osId = newWO.t_id;
            const osShipmentItemTran = newWO.tl_shipitemtran;
            const woId = newWO.sotl_wo;

            log.debug({
                title: 'Cleanup: Processing newly created WO',
                details: `Linking WO ${woId} to OS ${osId}`
            });

            const osRec = record.load({
                type: 'customtransaction_cp_outship',
                id: osId,
                isDynamic: false
            });

            const linesCount = osRec.getLineCount({ sublistId: 'line' });

            // Find matching line by shipmentitemtran key and update WO ID
            for (let i = 0; i < linesCount; i++) {
                const lineShipItemTran = osRec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cp_outship_shipitemtran',
                    line: i
                });

                if (parseInt(lineShipItemTran) === parseInt(osShipmentItemTran)) {
                    osRec.setSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_cp_outship_wo',
                        line: i,
                        value: woId
                    });
                    break;
                }
            }

            try {
                osRec.save();
                linkedCount++;
                log.debug({
                    title: 'Cleanup: OS updated successfully',
                    details: `OS ${osId} linked to WO ${woId}`
                });
            } catch (e) {
                log.error({
                    title: 'Cleanup: Failed to update OS',
                    details: `OS ${osId}, Error: ${e.message}`
                });
            }
        });

        log.audit({
            title: 'Cleanup complete',
            details: `Successfully linked ${linkedCount} Work Orders to Outbound Shipments`
        });
    };

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
        log.audit({
            title: '=== ENTERING GETINPUTDATA STAGE ===',
            details: 'Beginning map/reduce input data collection'
        });

        let mrScript = runtime.getCurrentScript();
        let osId = JSON.parse(mrScript.getParameter({ name: 'custscript_cp_outhship_wo_mr_osid' }));

        // Run cleanup utility to sync newly created WOs before main processing
        syncNewlyCreatedWorkOrders();

        let instructionSet = [];

        //IF SINGLE OS SPECIFIED BUILD INSTRUCTION SET FOR ONE OS - ELSE BUILD FOR ALL
        if(osId){
            log.debug({title: `Single OS ${osId} specified`, details: `Focussing run on OS ${osId}`});

            let openWoLines = suiteqlLib.lookupOpenWoLinesSingleOS(osId);
            log.audit({
                title: 'Open WO lines retrieved',
                details: `Count: ${openWoLines.length}`
            });

            // First, collect all unique woIds
            let uniqueWoIds = [];
            let woIdSet = new Set();

            openWoLines.forEach(line => {
                if (line.tl_wo && !woIdSet.has(line.tl_wo)) {
                    uniqueWoIds.push(line.tl_wo);
                    woIdSet.add(line.tl_wo);
                }
            });

            log.audit({
                title: 'Unique WO IDs collected for batch lookup',
                details: `Count: ${uniqueWoIds.length}`
            });

            // Query poured weights for all unique WOs using batch lookup
            let woWeightsMap = {};
            if (uniqueWoIds.length > 0) {
                const batchResults = suiteqlLib.lookupWoWeightsBatch(
                    uniqueWoIds
                );
                batchResults.forEach(result => {
                    woWeightsMap[result.wo_id] = result.per_unit_weight || 0;
                });
                log.audit({
                    title: 'Batch WO weights retrieved',
                    details: `Retrieved weights for ${batchResults.length} work orders`
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
        }else {
            log.debug({title: `No OS specified`, details: `Global Run`});
            let openWoLines = suiteqlLib.lookupOpenWoLines();
            log.audit({
                title: 'Open WO lines retrieved',
                details: `Count: ${openWoLines.length}`
            });

            // First, collect all unique woIds
            let uniqueWoIds = [];
            let woIdSet = new Set();

            openWoLines.forEach(line => {
                if (line.tl_wo && !woIdSet.has(line.tl_wo)) {
                    uniqueWoIds.push(line.tl_wo);
                    woIdSet.add(line.tl_wo);
                }
            });

            log.audit({
                title: 'Unique WO IDs collected for batch lookup',
                details: `Count: ${uniqueWoIds.length}`
            });

            // Query poured weights for all unique WOs using batch lookup
            let woWeightsMap = {};
            if (uniqueWoIds.length > 0) {
                const batchResults = suiteqlLib.lookupWoWeightsBatch(
                    uniqueWoIds
                );
                batchResults.forEach(result => {
                    woWeightsMap[result.wo_id] = result.per_unit_weight || 0;
                });
                log.audit({
                    title: 'Batch WO weights retrieved',
                    details: `Retrieved weights for ${batchResults.length} work orders`
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
        }



        log.audit({
            title: 'GETINPUTDATA STAGE COMPLETE',
            details: `Returning ${instructionSet.length} instructions to MAP stage`
        });

        log.audit({
            title: '=== ENTERING MAP STAGE ===',
            details: 'Processing instructions and grouping by Outbound Shipment'
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

        let result = JSON.parse(mapContext.value);

        let myValue = {
            lineId: result.lineId,
            woId: result.woId,
            woStatus: result.woStatus,
            pouredWeight: result.pouredWeight
        };


/*        if(result.osId === 100251)
            log.debug({
                title: 'Mapping instruction to OS',
                details: `OS ${result.osId}: WO ${result.woId} (${result.woStatus}), Weight: ${result.pouredWeight}`
            })*/


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
        if (reduceContext.executionNo === 0) {
            log.audit({
                title: '=== ENTERING REDUCE STAGE ===',
                details: 'Processing grouped instructions and updating Outbound Shipments'
            });
        }

        let myKey = reduceContext.key;
        let myValues = reduceContext.values;

        log.audit({
            title: `Evaluating Outbound Shipment: ${myKey} - No Further Log Entries If No Changes Detected`,
            details: `OS ID: ${myKey}, Instructions: ${myValues.length}`
        });

        // LOAD EACH OUTBOUND SHIPMENT

        let osRec = record.load({
            type: 'customtransaction_cp_outship',
            id: myKey,
            isDynamic: false
        });

        let originalGlobalAllWoBegun = osRec.getValue({fieldId:'custbody_cp_outship_allwo_begun'});
        let osChanged = false;
        let linesCount = osRec.getLineCount({ sublistId: 'line' });

        // Track changes for summary logging
        let changesCount = {
            woBegun: 0,
            woStatus: 0,
            weight: 0
        };

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
                        log.debug({
                            title: 'WO Begun changed',
                            details: `OS ${myKey} WO Begun value for line with WO ${woId} will be updated. Old: ${originalWoBegun}, New: ${woBegun}`
                        });

                        osRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_cp_outship_wo_begun',
                            line: i,
                            value: woBegun
                        });
                        osChanged = true; // FLAG THAT A CHANGE HAS BEEN MADE TO THE OS SO SAVE WILL OCCUR
                        changesCount.woBegun++;
                    }

                    // RECORD THE WORK ORDER STATUS BEFORE ANY MODIFICATION
                    let originalWoStatus = osRec.getSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_cp_outship_wo_status',
                        line: i
                    });

                    // CHANGE WO_STATUS COLUMN FIELD IF THE DATASET VALUE IS DIFFERENT FROM THE CURRENT LINE VALUE
                    if(originalWoStatus !== woStatus){
                        log.debug({
                            title: 'WO status changed',
                            details: `OS ${myKey} will be updated with new status for WO ${woId}. Old: ${originalWoStatus}, New: ${woStatus}`
                        });

                        osRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_cp_outship_wo_status',
                            line: i,
                            value: woStatus
                        });
                        osChanged = true; // FLAG THAT A CHANGE HAS BEEN MADE TO THE OS SO SAVE WILL OCCUR
                        changesCount.woStatus++;
                    }

                    // RECORD THE OS LINE ITEM WEIGHT BEFORE ANY MODIFICATION
                    let originalWeight = osRec.getSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_cp_outship_item_weight',
                        line: i
                    });

                    // CHANGE ITEM WEIGHT COLUMN FIELD IF THE POURED WEIGHT VALUE FROM THE DATASET IS DIFFERENT FROM THE CURRENT LINE VALUE
                    if(parseInt(originalWeight) !== parseInt(pouredWeight)){
                        log.debug({
                          title: 'WO weight changed',
                          details: `OS ${myKey} will be updated with new weight for WO ${woId}. Old: ${originalWeight}, New: ${pouredWeight}`
                        });
                        osRec.setSublistValue({
                            sublistId: 'line',
                            fieldId: 'custcol_cp_outship_item_weight',
                            line: i,
                            value: pouredWeight
                        });

                        osChanged = true; // FLAG THAT A CHANGE HAS BEEN MADE TO THE OS SO SAVE WILL OCCUR
                        changesCount.weight++;
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
            log.debug({
                title: 'Global WO Begun flag changed',
                details: `OS ${myKey}: ${originalGlobalAllWoBegun} -> ${newGlobalWoBegun}`
            });
        }

        // Log summary of changes
        if (osChanged) {
            log.audit({
                title: 'OS changes summary',
                details: `OS ${myKey}: WO Begun: ${changesCount.woBegun}, Status: ${changesCount.woStatus}, Weight: ${changesCount.weight} lines changed`
            });
        } else {
/*            log.debug({
                title: 'No changes needed',
                details: `OS ${myKey}: All data already up to date`
            });*/
        }

        //ONLY SAVE THE OS RECORD AND CONSUME USAGE IF IT HAS CHANGED
        if(osChanged){
            try {
                let id = osRec.save();
                log.debug({ title: `OS saved successfully`, details: id });
                reduceContext.write({
                    key: myKey,
                    value: 'saved'
                });
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
            title: '=== ENTERING SUMMARIZE STAGE ===',
            details: 'Generating execution summary and statistics'
        });

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

        // Count how many Outbound Shipments were actually saved
        let savedCount = 0;
        summaryContext.output.iterator().each(function(key, value) {
            savedCount++;
            return true;
        });

        log.audit({
            title: 'Outbound Shipments saved',
            details: `${savedCount} / ${reduceKeysProcessed} Outbound Shipments were updated and saved`
        });

        log.audit({
            title: '=== MAP/REDUCE EXECUTION COMPLETE ===',
            details: `Total Outbound Shipments processed: ${reduceKeysProcessed}, Saved: ${savedCount}, Errors: Map ${mapErrorCount}, Reduce ${reduceErrorCount}`
        });
    };

    return { getInputData, map, reduce, summarize };
});
