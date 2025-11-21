/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * User Event Script to calculate the actual poured weight of a work order.
 * Designed to run and be deployed to BOTH Work Order Completion AND Work Order Issue transacitons.
 * Calculated value is written back to the Actual Poured Weight field of the Work Order header.
 * Create Event writes the new value to the header of the Work Order.
 * Edit and Delete events clear the weight value from the Work Order header and rewrite using the Create event logic.
 * There is a manual override flag on the Work Order header that will be set to true if the weight is manually entered.
 * If the manual override flag is set to true, the weight value will not be recalculated.
 * Weight calculation logic is in the linked suiteql library.
 */
define(['N/query', 'N/record',  './lib/cp_wo_weights_suiteql_lib.js'],
    /**
 * @param{query} query
 * @param{record} record
 * @param{suiteqlLib} suiteqlLib
 */
    (query, record, suiteqlLib) => {

        const afterSubmit = (scriptContext) => {
            const eventType = scriptContext.type;
            const wocId = scriptContext.newRecord.id;

            log.audit({
                title: 'afterSubmit: Entry',
                details: `WOC ID: ${wocId}, Event: ${eventType}`
            });

            // Route to appropriate handler based on event type
            switch (eventType) {
                case scriptContext.UserEventType.CREATE:
                    log.debug({
                        title: 'afterSubmit: CREATE event',
                        details: `Adding weight to WO for new WOC ${wocId}`
                    });
                    addWeight(scriptContext);
                    break;
                case scriptContext.UserEventType.EDIT:
                    log.debug({
                        title: 'afterSubmit: EDIT event',
                        details: `Resetting and recalculating weight for WOC ${wocId}`
                    });
                    initializeWeight(scriptContext);
                    addWeight(scriptContext);
                    break;
                case scriptContext.UserEventType.DELETE:
                    log.debug({
                        title: 'afterSubmit: DELETE event',
                        details: `Resetting and recalculating weight after WOC ${wocId} deletion`
                    });
                    initializeWeight(scriptContext);
                    addWeight(scriptContext);
                    break;
            }

            log.audit({
                title: 'afterSubmit: Complete',
                details: `WOC ${wocId} processing finished`
            });
        }

        const addWeight = (scriptContext) => {
            let wocRec = scriptContext.newRecord;
            let wocId = wocRec.id;
            let woId = wocRec.getValue({ fieldId: 'createdfrom' });

            log.debug({
                title: 'addWeight: Entry',
                details: `WOC ${wocId}, WO ${woId}`
            });

            // RETRIEVE WORK ORDER WEIGHT CONTEXT
            let woContext = suiteqlLib.lookupWO(woId);

            if (!woContext || woContext.length === 0) {
                log.debug({
                    title: 'addWeight: No context found',
                    details: `No work order context found for WO ${woId}, skipping weight calculation`
                });
                return;
            }

            // ASSIGN RETRIEVED VALUES TO LOCAL VARIABLES
            let woQuantity = woContext[0].quantity;
            let woBuiltQuantity = woContext[0].built;
            let woWeightOverride = woContext[0].weight_override;

            log.debug({
                title: 'addWeight: WO context retrieved',
                details: `WO ${woId} - Qty: ${woQuantity}, Built: ${woBuiltQuantity}, Override: ${woWeightOverride}`
            });

            // DETERMINE IF ACTUAL POURED WEIGHT MUST BE CALCULATED
            if (!woBuiltQuantity || woBuiltQuantity <= 0 || !woQuantity || woQuantity <= 0) {
                log.debug({
                    title: 'addWeight: Skipped - invalid quantity',
                    details: `WO ${woId} has invalid quantity or built value, skipping calculation`
                });
                return;
            }

            if (woBuiltQuantity < woQuantity) {
                log.debug({
                    title: 'addWeight: Skipped - not fully built',
                    details: `WO ${woId} built ${woBuiltQuantity} of ${woQuantity}, waiting for completion`
                });
                return;
            }

            if (woWeightOverride === 'T') {
                log.debug({
                    title: 'addWeight: Skipped - manual override',
                    details: `WO ${woId} has manual weight override flag set, skipping auto-calculation`
                });
                return;
            }

            // CALCULATE ACTUAL POURED WEIGHT IF STILL RUNNING
            log.debug({
                title: 'addWeight: Calculating poured weight',
                details: `WO ${woId} is fully built and no override, calculating weight`
            });

            const pouredWeightResult = suiteqlLib.lookupActualPouredWeight(woId);
            const pouredWeight = Math.round(pouredWeightResult[0]?.poured_weight || 0);

            log.debug({
                title: 'addWeight: Weight calculated',
                details: `WO ${woId} calculated poured weight: ${pouredWeight}`
            });

            // IF THE POURED WEIGHT VALUE HAS CHANGED UPDATE THE WORK ORDER ACTUAL POURED WEIGHT FIELD
            if (pouredWeight > 0 ) {
                // DETERMINE POURED WEIGHT PER UNIT BUILT
                let pouredWeightPerUnit = Math.round(pouredWeight / woBuiltQuantity);

                record.submitFields({
                    type: record.Type.WORK_ORDER,
                    id: woId,
                    values: {
                        'custbody_pour_weight': pouredWeight,
                        'custbody_cp_pour_weight_per_unit': pouredWeightPerUnit
                    }
                });

                log.debug({
                    title: 'addWeight: WO weight updated',
                    details: `WO ${woId} poured weight set to ${pouredWeight}. Poured weight per unit set to: ${pouredWeightPerUnit}`
                });
            } else {
                log.debug({
                    title: 'addWeight: No weight to update',
                    details: `WO ${woId} calculated weight is 0, no update needed`
                });
            }
        }

        const initializeWeight = (scriptContext) => {
            let wocRec = scriptContext.newRecord;
            let wocId = wocRec.id;
            let woId = wocRec.getValue({ fieldId: 'createdfrom' });

            log.debug({
                title: 'initializeWeight: Entry',
                details: `WOC ${wocId}, WO ${woId} - resetting weight to recalculate`
            });

            let id = record.submitFields({
                type: record.Type.WORK_ORDER,
                id: woId,
                values: {'custbody_pour_weight': 0}
            });

            log.debug({
                title: 'initializeWeight: Weight reset',
                details: `WO ${woId} poured weight reset to 0, ready for recalculation`
            });
        }

        return {afterSubmit}
    });
