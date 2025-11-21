/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * When the Actual Poured Weight value is manually edited, set the weight override flag to true.
 * This will prevent the weight calculation logic from running and the weight value will be left alone.
 * If a NULL value is entered, the weight override flag will be cleared.
 */
define(['N/record', 'N/runtime', './lib/cp_wo_weights_suiteql_lib.js'],
    /**
 * @param{record} record
 * param{runtime} runtime
 * param{suiteqlLib} suiteqlLib
 */
    (record, runtime, suiteqlLib) => {
        const beforeSubmit = (scriptContext) => {
            let oldRecord = scriptContext.oldRecord;
            let newRecord = scriptContext.newRecord;

            let exec = runtime.executionContext;

            if (exec !== runtime.ContextType.USER_INTERFACE) {
                return; // Skip script logic for non-UI changes
            }

            // Skip for CREATE events - no old record to compare against
            if (!oldRecord) {
                return;
            }

            let oldWeight = oldRecord.getValue({fieldId: 'custbody_pour_weight'});
            let newWeight = newRecord.getValue({fieldId: 'custbody_pour_weight'});

            log.debug({
                title: 'Weight override check',
                details: `Old: ${oldWeight} (${typeof oldWeight}), New: ${newWeight} (${typeof newWeight})`
            });

            // Check if value is empty (null, undefined, empty string, or 0)
            const isEmpty = (val) => val === null || val === undefined || val === '' || val === 0;
            const hasValue = (val) => !isEmpty(val);

            // USER HAS MANUALLY CLEARED THE CONTENTS OF THE ACTUAL POURED WEIGHT FIELD
            if (isEmpty(newWeight) && hasValue(oldWeight)) {
                newRecord.setValue({fieldId: 'custbody_cp_weight_override', value: false});
                newRecord.setValue({fieldId: 'custbody_cp_pour_weight_per_unit', value: null});
                log.debug({
                    title: 'Manual weight override flag cleared',
                    details: `Weight cleared from ${oldWeight} to ${newWeight}`
                });
            }

            // USER HAS MANUALLY ENTERED A VALUE IN THE CONTENTS OF THE ACTUAL POURED WEIGHT FIELD
            if (hasValue(newWeight) && oldWeight !== newWeight) {
                let woContext = suiteqlLib.lookupWO(newRecord.id);
                let quantityBuilt = woContext[0].built;
                log.debug({title: `quantityBuilt was`, details: quantityBuilt});
                let pouredWeightPerUnit = quantityBuilt > 0 ? Math.round(newWeight / quantityBuilt) : 0;
                newRecord.setValue({fieldId: 'custbody_cp_weight_override', value: true});
                newRecord.setValue({fieldId: 'custbody_cp_pour_weight_per_unit', value: pouredWeightPerUnit});
                log.debug({
                    title: 'Manual weight override flag set',
                    details: `Weight changed from ${oldWeight} to ${newWeight}, per unit: ${pouredWeightPerUnit}`
                });
            }

        }



        return {beforeSubmit}

    });
