/**
 * cp_wo_weights_suiteql_lib.js
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 *.
 * Contains all SuiteQL queries used by the application to be used as a common library and to encapsulate the logic
 * called as 'suiteqlLib'
 *
 */

define(['N/query'] /**
 * @param{query} query
 *
 */, (query) => {
    //---------------------------SUITEQL LOOKUPS--------------------------------------------------------------------------------

    // RETRIEVES WEIGHT CONTEXT FROM WO HEADER
    function lookupWO(woId){
        let sqlQuery = `
            SELECT tl.quantity,
                   tl.quantityshiprecv           AS built,
                   t.custbody_cp_weight_calc     AS weight_calc,
                   t.custbody_cp_weight_override AS weight_override
            FROM transaction as t
                INNER JOIN TransactionLine as tl ON
                (tl.Transaction = t.ID)
            WHERE t.id = ${woId}
              AND tl.lineSequenceNumber = 0 
        `

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        log.debug({
            title: 'lookupWO results',
            details: `Returned ${allResults.length} work order weights`
        });

        return allResults;
    }

    // CALCULATE ACTUAL POURED WEIGHTS
    function lookupActualPouredWeight(woId){
        let sqlQuery = `
            SELECT
                ROUND(SUM(quantity)) AS poured_weight
            FROM
                transactionline
            WHERE
                createdfrom = ${woId}
                AND units = 1
                AND quantity > 0
        `

        /*
        •	The items that are material to the Actual Poured Weight calculation have a Unit of Measure of Pounds.
            Therefore, the sum of the QUANTITY of the items will yield an Actual Poured Weight value that is accurate
            enough for the client’s use case.

        •	It is acknowledged that there are items on Work Orders whose Unit Of Measure is NOT pounds. However,
            the client has confirmed that the weight of these items is immaterial to the calculation and need not be
            considered.
         */

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        log.debug({
            title: 'lookupActualPouredWeight results',
            details: `Returned ${allResults.length} work order weights`
        });

        return allResults;
    }

    return {
        lookupWO : lookupWO,
        lookupActualPouredWeight : lookupActualPouredWeight
    };
});
