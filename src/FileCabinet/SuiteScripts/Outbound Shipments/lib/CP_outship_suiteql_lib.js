/**
 * CP_outship_suiteql_lib.js
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 *.
 * Contains all SuiteQL queries used by the application to be used as a common library and to encapsulate the logic
 * @TODO REMOVE THE NVL(tl.units,2) AND REPLACE WITH tl.units IN lookupFulfillableLines IF DEPLOYING OUTSIDE ARMOROCK
 * called as 'suiteqlLib'
 *
 */

define(['N/query'] /**
 * @param{query} query
 *
 */, (query) => {
    //---------------------------SUITEQL LOOKUPS--------------------------------------------------------------------------------
    function lookupFulfillableLines(soId, location, soLinesPresentJSON) {
        //Looks up all line items that are fulfillable on a given sales order for a given location
        //@TODO REMOVE THE NVL(tl.units,2) AND REPLACE WITH tl.units IF DEPLOYING OUTSIDE ARMOROCK

        let soLinesPresent = JSON.parse(soLinesPresentJSON);
        let soLinesPresentLength = Object.keys(soLinesPresent).length;
        let sqlSuffix = '';
        let sqlSuffix2 = ')';

        if (soLinesPresentLength > 0) {
            sqlSuffix = `AND tl.uniquekey NOT IN ( `;

            for (let i = 0; i < soLinesPresentLength; i++) {
                if (soLinesPresentLength - i === 1) {
                    //last value
                    sqlSuffix += "'" + soLinesPresent[i] + "'";
                } else {
                    sqlSuffix += "'" + soLinesPresent[i] + "',";
                }
            }
            sqlSuffix += sqlSuffix2;
        }

        let sqlQuery = `
            SELECT
                tl.uniquekey                                AS tl_lineuniquekey,
                tl.item                                     AS tl_item,
                NVL(tl.units, 2)                            AS tl_units,
                i.itemid                                    AS i_description,
                i.displayname                               AS i_displayname,
                NVL(i.weight, 0)                            AS i_weight,
                NVL(BUILTIN.DF(i.weightunit), 'lb')         AS i_weightunit,
                tl.location                                 AS tl_location,
                NVL(tl.rate, 0)                             AS tl_rate,
                ABS(tl.quantity)                            AS tl_qty,
                (ABS(tl.quantity) - ABS(tl.quantityshiprecv) - NVL(oslines.sum_qtyremaining, 0))    AS tl_qtyfulfillable,
                (i.itemid || ' - ' || tl.custcol_bpm_structure_type) AS display,
                tl.createdpo                                AS tl_wo,
                i.isSerialItem                              AS i_isserial,
                tl.custcol_bpm_structure_type               AS tl_structure,
                t.entity                                    AS t_customer,
                i.itemType                                  AS i_itemtype,
                i.custitem_cp_outship_freight_charge        AS i_freightcharge
            FROM
                transactionline tl
                    INNER JOIN item i ON tl.item = i.id
                    INNER JOIN transaction t ON tl.transaction = t.id
                    LEFT JOIN transaction linked_t ON tl.createdpo = linked_t.id
                    LEFT JOIN (
                    SELECT
                        custcol_cp_outship_shipitemtran             AS ref_uniquekey,
                        SUM(ABS(custcol_cp_outship_qtyremaining))   AS sum_qtyremaining
                    FROM
                        transactionline
                    GROUP BY
                        custcol_cp_outship_shipitemtran
                ) oslines ON oslines.ref_uniquekey = tl.uniquekey
            WHERE
                tl.transaction = ${soId}
              AND tl.location = ${location}
              AND tl.fulfillable = 'T'
              AND tl.assemblycomponent = 'F'
              AND (tl.itemsource = 'WORK_ORDER' OR tl.itemsource IS NULL)
              AND ABS(tl.quantity) - ABS(tl.quantityshiprecv) > 0
              AND (linked_t.type != 'PurchOrd' OR linked_t.type IS NULL OR linked_t.type = 'WorkOrd')
              AND (ABS(tl.quantity) - ABS(tl.quantityshiprecv) - NVL(oslines.sum_qtyremaining, 0)) > 0
                ${sqlSuffix}
        `;

        log.debug({ title: `sqlQuery lookupFulfillableLines was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        //log.debug({title: `allResults was`, details: JSON.stringify(allResults)})

        let fulfillableLines = {};

        allResults.forEach(result => {
            fulfillableLines[result.tl_lineuniquekey] = {
                display: result.display,
                qtyfulfillable: result.tl_qtyfulfillable,
                itemdesc: result.i_description,
                itemdisplayname: result.i_displayname,
                itemweight: result.i_weight,
                itemweightunit: result.i_weightunit,
                uom: result.tl_units,
                rate: result.tl_rate,
                item: result.tl_item,
                wo: result.tl_wo,
                isserial: result.i_isserial,
                structure: result.tl_structure,
                customer: result.t_customer,
                itemtype: result.i_itemtype,
                freightcharge: result.i_freightcharge,
            };
        });

        log.debug({ title: 'fulfillableLines was ', details: JSON.stringify(fulfillableLines) });

        return fulfillableLines;
    }

    function lookupAddableSoLines(soId, location, soLinesPresentJSON) {
        //Looks up all line items that are fulfillable on a given sales order for a given location

        let soLinesPresent = JSON.parse(soLinesPresentJSON);
        let soLinesPresentLength = Object.keys(soLinesPresent).length;
        let sqlSuffix = '';
        let sqlSuffix2 = ')';

        if (soLinesPresentLength > 0) {
            sqlSuffix = `AND tl.uniquekey NOT IN ( `;

            for (let i = 0; i < soLinesPresentLength; i++) {
                if (soLinesPresentLength - i === 1) {
                    //last value
                    sqlSuffix += "'" + soLinesPresent[i] + "'";
                } else {
                    sqlSuffix += "'" + soLinesPresent[i] + "',";
                }
            }
            sqlSuffix += sqlSuffix2;
        }

        let sqlQuery = `
            SELECT
              tl.uniquekey              AS tl_lineuniquekey,
              tl.item                   AS tl_item,
              tl.units                  AS tl_units,
              i.itemid                  AS i_description,
              tl.location               AS tl_location,
              tl.rate                   AS tl_rate,
              ABS(tl.quantity)          AS tl_qty,
              tl.quantityCommitted      AS tl_qty_available,
              tl.quantityshiprecv       AS tl_qty_fulfilled,
              NVL (custcol_cp_outship_qtyonship, 0) AS tl_qty_onshipment,
              (ABS(tl.quantity) - ABS(tl.quantityshiprecv)) AS tl_qty_remaining,
              ('Line ' || ROWNUM || ' - ' || i.itemid)  AS display,
              tl.createdpo              AS tl_wo,
              i.isSerialItem            AS i_isserial
            FROM
              transactionline AS tl
              INNER JOIN item AS i ON (tl.item = i.id)
            WHERE
              tl.transaction = ${soId}
              AND tl.location = ${location}
              AND tl.fulfillable = 'T'
              AND tl.assemblycomponent = 'F'
              AND (
                tl.itemsource = 'WORK_ORDER'
                OR tl.itemsource IS NULL
              )
            ${sqlSuffix}
                
        `;
        log.debug({ title: `sqlQuery lookupAddableSoLines was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        //log.debug({title: `allResults was`, details: JSON.stringify(allResults)})

        let addableLines = {};

        allResults.forEach(result => {
            addableLines[result.tl_lineuniquekey] = {
                display: result.display,
                quantity: result.tl_qty,
                quantityAvailable: result.tl_qty_available,
                quantityFulfilled: result.tl_qty_fulfilled,
                quantityOnShipment: result.tl_qty_onshipment,
                quantityRemaining: result.tl_qty_remaining,
                itemdesc: result.i_description,
                uom: result.tl_units,
                rate: result.tl_rate,
                item: result.tl_item,
                wo: result.tl_wo,
                isserial: result.i_isserial
            };
        });

        log.debug({ title: 'addableLines was ', details: JSON.stringify(addableLines) });

        return addableLines;
    }

    function lookupShippableLines() {
        //Looks up data to determine which Outbound Shipment lines are Shippable
        let sqlQuery = `
            SELECT
                t.id AS osid,
                tl.lineSequenceNumber AS ostl_line,
                tl.custcol_cp_outship_item,
                MAX(i.itemid) AS item_name,
                NVL(MAX(tl.custcol_cp_outship_shipitemtran), 0) AS ostl_shipitemtran,
                NVL(MAX(tl.custcol_cp_outship_qtyremaining), 0) AS ostl_qtyremaining,
                NVL(MAX(sotl.quantityCommitted), 0) AS sotl_qtycommited,
                NVL(MAX(iil.quantityCommitted), 0) AS iil_qtycommited,
                NVL(SUM(iil.quantityonhand), 0) AS iil_qtyonhand,
                NVL(SUM(iil.quantityavailable), 0) AS iil_qtyavailable
            FROM
                transaction AS t
                    INNER JOIN transactionline AS tl
                               ON tl.transaction = t.ID
                    INNER JOIN transactionline AS sotl
                               ON sotl.uniquekey = tl.custcol_cp_outship_shipitemtran
                    INNER JOIN item AS i
                               ON sotl.item = i.id
                    INNER JOIN inventoryItemLocations AS iil
                               ON tl.custcol_cp_outship_item = iil.item
                                   AND tl.location = iil.location
            WHERE
                t.recordtype = 'customtransaction_cp_outship'
              AND (t.status LIKE '%E%' OR t.status LIKE '%A%')
              AND (tl.custcol_cp_outship_qtytofulfill - tl.custcol_cp_qty_fulfilled) > 0
            GROUP BY
                t.id,
                tl.custcol_cp_outship_item,
                tl.lineSequenceNumber
        `;

        log.debug({ title: `sqlQuery lookupShippableLines was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupShippableLinesSingleOS(osId) {
        //Looks up data to determine which Outbound Shipment lines are Shippable
        let sqlQuery = `
            SELECT
                t.id AS osid,
                tl.lineSequenceNumber AS ostl_line,
                tl.custcol_cp_outship_item,
                MAX(i.itemid) AS item_name,
                NVL(MAX(tl.custcol_cp_outship_shipitemtran), 0) AS ostl_shipitemtran,
                NVL(MAX(tl.custcol_cp_outship_qtyremaining), 0) AS ostl_qtyremaining,
                NVL(MAX(sotl.quantityCommitted), 0) AS sotl_qtycommited,
                NVL(MAX(iil.quantityCommitted), 0) AS iil_qtycommited,
                NVL(SUM(iil.quantityonhand), 0) AS iil_qtyonhand,
                NVL(SUM(iil.quantityavailable), 0) AS iil_qtyavailable
            FROM
                transaction AS t
                    INNER JOIN transactionline AS tl
                               ON tl.transaction = t.ID
                    INNER JOIN transactionline AS sotl
                               ON sotl.uniquekey = tl.custcol_cp_outship_shipitemtran
                    INNER JOIN item AS i
                               ON sotl.item = i.id
                    INNER JOIN inventoryItemLocations AS iil
                               ON tl.custcol_cp_outship_item = iil.item
                                   AND tl.location = iil.location
            WHERE
                t.recordtype = 'customtransaction_cp_outship'
              AND (t.status LIKE '%E%' OR t.status LIKE '%A%')
              AND (tl.custcol_cp_outship_qtytofulfill - tl.custcol_cp_qty_fulfilled) > 0
              AND t.id = ${osId}
            GROUP BY
                t.id,
                tl.custcol_cp_outship_item,
                tl.lineSequenceNumber
        `;

        log.debug({ title: `sqlQuery lookupShippableLinesSingleOS was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupOpenWoLines() {
        //Looks up data to determine information about lines on outstanding Outbound Shipments with linked Work Orders

        let sqlQuery = `
            SELECT
                t.id                         AS t_id,
                tl.id                        AS tl_id,
                tl.custcol_cp_outship_wo     AS tl_wo,
                SUBSTR(BUILTIN.DF(wo.status), (INSTR(BUILTIN.DF(wo.status), ':', -1) + 2)) AS wo_status,
                wo.type
            FROM
                transaction                  AS t
                    INNER JOIN transactionline   AS tl ON (tl.transaction = t.id)
                    INNER JOIN transaction       AS wo ON (wo.id = tl.custcol_cp_outship_wo)
            WHERE
                t.recordtype = 'customtransaction_cp_outship'
              AND BUILTIN.DF(t.status) IN (
                                           'Outbound Shipment : To Be Fulfilled',
                                           'Outbound Shipment : Partially Fulfilled'
                )
              AND tl.custcol_cp_outship_qtyremaining > 0
              AND tl.custcol_cp_outship_wo IS NOT NULL
              AND wo.type <> 'PurchOrd'
        `;

        log.debug({ title: `sqlQuery lookupOpenWoLines was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupExistingOutboundSerialLines(key) {
        //Looks up a Shipment Item Transaction Line Key to avoid duplicate creation

        let sqlQuery = `
            SELECT
                COUNT(*)    AS   count
            FROM
                customrecord_cp_outship_serials
            WHERE
                custrecord_cp_outship_serial_shipitemtra = ${key}
        `;

        log.debug({ title: `sqlQuery lookupExistingOutboundSerialLines was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupExistingOutboundSerialLineIds(key) {
        //Looks up a Shipment Item Transaction Line Key to avoid duplicate creation

        let sqlQuery = `
            SELECT
                id
            FROM
                customrecord_cp_outship_serials
            WHERE
                custrecord_cp_outship_serial_shipitemtra = ${key}
        `;

        log.debug({ title: `sqlQuery lookupExistingOutboundSerialLineIds was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupOnhandSerials(item,location) {
        //Looks up a Shipment Item Transaction Line Key to avoid duplicate creation

        let sqlQuery = `
            SELECT
                inventorynumber.id              AS serial_id,
                inventorynumber.inventorynumber AS serial
            FROM
                inventorybalance
                    LEFT JOIN inventorynumber ON (
                    inventorybalance.inventorynumber = inventorynumber.id
                    )
            WHERE
                inventorybalance.item = ${item}
              AND inventorybalance.location = ${location}
              AND inventorybalance.quantityOnHand > 0
              AND inventorynumber.id NOT IN (
                SELECT
                    custrecord_cp_outship_serial_id
                FROM
                    customrecord_cp_outship_serials
                WHERE 
                    custrecord_cp_outship_serial_id IS NOT NULL
            )
        `;

        log.debug({ title: `sqlQuery lookupOnhandSerials was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupLineSerials(line) {
        //Looks up all Serials Associated to a Shipment Item Transaction Line Key

        let sqlQuery = `
            SELECT
                custrecord_cp_outship_serial_id     AS  serial_id
            FROM
                customrecord_cp_outship_serials
            WHERE
                custrecord_cp_outship_serial_shipitemtra = ${line}
        `;

        log.debug({ title: `sqlQuery lookupLineSerials was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupAssignedSerials(osId) {
        //RETURNS THE COUNT OF SERIAL NUMBERS ASSIGNED TO A GIVEN OS

        let sqlQuery = `
            SELECT
                COUNT(*)    AS   serial_count
            FROM
                customrecord_cp_outship_serials
            WHERE
                custrecord_cp_outship_linked_os = ${osId}
              AND
                custrecord_cp_outship_serial_id IS NOT NULL
        `;

        log.debug({ title: `sqlQuery lookupAssignedSerials was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupLinkedOutboundSerials(osId) {
        //RETURNS THE OUTBOUND SERIAL RECORDS LINKED TO A GIVEN OUTBOUND SHIPMENT RECORD
        //USED BY DATATABLES VIEW ON OS RECORD

        let sqlQuery = `
            SELECT
                os.id								        AS		os_id,
                os.custrecord_cp_outship_serial_id		    AS		serial_id,
                in.inventorynumber 					        AS 		serial,
                os.custrecord_cp_outship_serial_item        AS      item_id,
                i.itemid							        AS		item,
                os.custrecord_cp_outship_serial_location    AS      location_id,
                os.custrecord_cp_outship_serial_shipitemtra AS      shipment_item_tran,
                os.custrecord_cp_outship_structure          AS      structure
            FROM
                customrecord_cp_outship_serials	            AS      os
                    INNER JOIN item                         AS	    i	ON
                    (os.custrecord_cp_outship_serial_item = i.id)
                    LEFT OUTER JOIN inventorynumber         AS      in  ON
                (os.custrecord_cp_outship_serial_id = in.id)
            WHERE
                custrecord_cp_outship_linked_os = ${osId}
        `;

        log.debug({ title: `sqlQuery lookupLinkedOutboundSerials was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupOrphanedOutboundSerials() {
        //RETURNS THE OUTBOUND SERIAL RECORDS LINKED TO A GIVEN OUTBOUND SHIPMENT RECORD
        //USED BY DATATABLES VIEW ON OS RECORD

        let sqlQuery = `
            SELECT 
                id 
            FROM 
                customrecord_cp_outship_serials 
            WHERE 
                custrecord_cp_outship_linked_os IS NULL
        `;

        log.debug({ title: `sqlQuery lookupOrphanedOutboundSerials was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupNewlyCreatedLinkedWOs() {
        //RETURNS WORK ORDERS CREATED FROM SALES ORDER LINES THAT HAD NOT BEEN CREATED WHEN THE SO LINE WAS ADDED TO OS
        //USER CREATED THE LINKED WORK ORDER AFTER ADDING THE LINE TO THE OUTBOUND SHIPMENT

        let sqlQuery = `
            SELECT t.id                               AS t_id,
                   tl.custcol_cp_outship_shipitemtran AS tl_shipitemtran,
                   tl.custcol_cp_outship_wo           AS tl_wo,
                   sotl.createdpo                     AS sotl_wo
            FROM transaction AS t
                     INNER JOIN transactionline AS tl ON (tl.transaction = t.id)
                     INNER JOIN transactionline AS sotl ON (
                sotl.uniquekey = tl.custcol_cp_outship_shipitemtran
                )
            WHERE t.recordtype = 'customtransaction_cp_outship'
              AND BUILTIN.DF(Status) IN (
                                         'Outbound Shipment : To Be Fulfilled',
                                         'Outbound Shipment : Partially Fulfilled'
                )
              AND tl.custcol_cp_outship_qtyremaining > 0
              AND tl.custcol_cp_outship_wo IS NULL
              AND sotl.createdpo IS NOT NULL
        `;

        log.debug({ title: `sqlQuery lookupNewlyCreatedLinkedWOs was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupNewlyCreatedSerials() {
        //RETURNS WORK ORDERS CREATED FROM SALES ORDER LINES THAT HAD NOT BEEN CREATED WHEN THE SO LINE WAS ADDED TO OS
        //USER CREATED THE LINKED WORK ORDER AFTER ADDING THE LINE TO THE OUTBOUND SHIPMENT

        let sqlQuery = `
            SELECT
                t.id AS osid,
                os.id AS outserial_id,
                MAX(tl.custcol_cp_outship_shipitemtran) AS ostl_shipitemtran,
                MAX(os.custrecord_cp_outship_serial_id) AS os_serial,
                MAX(ib.inventoryNumber)                 AS ib_serial
            FROM
                transaction AS t
                    INNER JOIN transactionline AS tl ON (tl.transaction = t.ID)
                    INNER JOIN transactionline AS sotl ON (
                    sotl.uniquekey = tl.custcol_cp_outship_shipitemtran
                    )
                    INNER JOIN inventoryItemLocations AS iil ON (
                    tl.custcol_cp_outship_item = iil.item
                        AND tl.location = iil.location
                    )
                    INNER JOIN inventorybalance AS ib ON (
                    tl.custcol_cp_outship_item = ib.item
                        AND tl.location = ib.location
                    )
                    INNER JOIN customrecord_cp_outship_serials AS os ON (
                    tl.custcol_cp_outship_shipitemtran = os.custrecord_cp_outship_serial_shipitemtra
                    )
            WHERE
                t.recordtype = 'customtransaction_cp_outship'
              AND (
                t.status LIKE '%E%'
                    OR t.status LIKE '%A%'
                )
              AND (
                      tl.custcol_cp_outship_qtytofulfill - tl.custcol_cp_qty_fulfilled
                      ) > 0
            GROUP BY
                t.id,
                os.id
        `;

        log.debug({ title: `sqlQuery lookupNewlyCreatedSerials was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupStopCount(osId) {
        //RETURNS WORK ORDERS CREATED FROM SALES ORDER LINES THAT HAD NOT BEEN CREATED WHEN THE SO LINE WAS ADDED TO OS
        //USER CREATED THE LINKED WORK ORDER AFTER ADDING THE LINE TO THE OUTBOUND SHIPMENT

        let sqlQuery = `
            SELECT
                COUNT(id)   AS  stops
            FROM
                customrecord_cp_outship_stop
            WHERE
                custrecord_cp_outship_shipment = ${osId}
        `;

        log.debug({ title: `sqlQuery lookupStopCount was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupEditRoles() {
        //RETURNS ARRAY OF ROLES ALLOWED TO EDIT FULFILLED OUTBOUND SHIPMENTS

        let sqlQuery = `
            SELECT
                custrecord_cp_outship_edit_role	AS role
            FROM
                customrecord_cp_outship_edit_roles
        `;

        log.debug({ title: `sqlQuery lookupEditRoles was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        const valuesArray = allResults.map(o => o.role); //Returns an array of only integer role ids

        return valuesArray;
    }

    function lookupKitItems() {
        //Looks up data to determine which Outbound Shipment lines are Shippable
        let sqlQuery = `
            SELECT
                t.id AS osid,
                tl.lineSequenceNumber AS ostl_line,
                tl.custcol_cp_outship_item,
                tl.custcol_cp_outship_shipitemtran,
                tl.custcol_cp_outship_qtyremaining,
                NVL(sotl.quantityCommitted,0) AS sotl_qtycommited,
                sotl.location,
                sotl.itemtype
            FROM
                transaction AS t
                    INNER JOIN transactionline AS tl
                               ON tl.transaction = t.ID
                    INNER JOIN transactionline AS sotl
                               ON sotl.uniquekey = tl.custcol_cp_outship_shipitemtran
            WHERE
                t.recordtype = 'customtransaction_cp_outship'
              AND (t.status LIKE '%E%' OR t.status LIKE '%A%')
              AND (tl.custcol_cp_outship_qtytofulfill - tl.custcol_cp_qty_fulfilled) > 0
              AND sotl.itemtype = 'Kit'
        `;

        log.debug({ title: `sqlQuery lookupKitItems was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupKitItemsSingleOS(osId) {
        //Looks up data to determine which Outbound Shipment lines are Shippable
        let sqlQuery = `
            SELECT
                t.id AS osid,
                tl.lineSequenceNumber AS ostl_line,
                tl.custcol_cp_outship_item,
                tl.custcol_cp_outship_shipitemtran,
                tl.custcol_cp_outship_qtyremaining,
                NVL(sotl.quantityCommitted,0) AS sotl_qtycommited,
                sotl.location,
                sotl.itemtype
            FROM
                transaction AS t
                    INNER JOIN transactionline AS tl
                               ON tl.transaction = t.ID
                    INNER JOIN transactionline AS sotl
                               ON sotl.uniquekey = tl.custcol_cp_outship_shipitemtran
            WHERE
                t.recordtype = 'customtransaction_cp_outship'
                AND (t.status LIKE '%E%' OR t.status LIKE '%A%')
                AND (tl.custcol_cp_outship_qtytofulfill - tl.custcol_cp_qty_fulfilled) > 0
                AND t.id = ${osId}
                AND sotl.itemtype = 'Kit'
        `;

        log.debug({ title: `sqlQuery lookupKitItemsSingleOS was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupKitMembers(parentId) {
        //Looks up data to determine which Outbound Shipment lines are Shippable
        let sqlQuery = `
            SELECT
                item,
                BUILTIN.DF (item) AS item_name,
                quantity
            FROM
                kitItemMember
            WHERE
                parentitem = ${parentId}
        `;

        log.debug({ title: `sqlQuery lookupKitMembers was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupItemInventory(itemIds, location) {
        //LOOKS UP INVENTORY LEVELS OF THE ITEMS PASSED FOR A GIVEN LOCATION

        log.debug({title: `itemIds given to query`, details: itemIds});
        log.debug({title: `location given to query`, details: location});

        // Create comma-separated list for IN clause
        const itemList = itemIds.join(',');

        let sqlQuery = `
            SELECT
                item,
                BUILTIN.DF (item) AS item_name,
                quantityonhand AS iil_qtyonhand,
                quantityavailable AS iil_qtyavailable
            FROM
                inventoryItemLocations
            WHERE
                item IN (${itemList})
              AND location = ${location}
        `;

        log.debug({ title: `sqlQuery lookupItemInventory was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupWoWeights(woId) {
        //LOOKS UP CUMULATIVE WEIGHT OF COMPONENTS ISSUED TO A WORK ORDER

        let sqlQuery = `
            SELECT
                ROUND(SUM(quantity)) AS poured_weight
            FROM
                transactionline
            WHERE
                createdfrom = ${woId}
                AND units = 1
                AND quantity > 0
        `;

        //log.debug({ title: `sqlQuery lookupWoWeights was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    function lookupWoWeightsBatch(woIds) {
        //LOOKS UP CUMULATIVE WEIGHTS FOR MULTIPLE WORK ORDERS

        if (!woIds || woIds.length === 0) {
            return {};
        }

        const woIdList = woIds.join(',');

        let sqlQuery = `
            SELECT
                createdfrom AS wo_id,
                ROUND(SUM(quantity)) AS poured_weight
            FROM
                transactionline
            WHERE
                createdfrom IN (${woIdList})
                AND units = 1
                AND quantity > 0
            GROUP BY
                createdfrom
        `;

        log.debug({ title: `sqlQuery lookupWoWeightsBatch was`, details: sqlQuery });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sqlQuery, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        log.debug({
          title: 'lookupWoWeightsBatch results',
          details: `Returned ${allResults.length} work order weights`
        });

        return allResults;
    }

    function lookupOSLines4SO(uniqueKeys){
        let whereClause = 'WHERE tl.custcol_cp_outship_shipitemtran IN (';
        let dynamicCriteria = '';
        let whereClause2 = ')';

        for (let i = 0; i < uniqueKeys.length; i++) {
            if (uniqueKeys.length - i === 1) {
                //last value in string so no comma at the end
                dynamicCriteria += uniqueKeys[i];
            } else {
                dynamicCriteria += uniqueKeys[i] + ',';
            }
        }
        whereClause += dynamicCriteria;
        whereClause += whereClause2;

        let sql = `
            SELECT     
                i.itemid						        AS	i_item,
                i.description					        AS	i_description,
                t.id                                    AS  t_id,
                t.tranid						        AS	t_number,
                tl.custcol_bpm_structure_type           AS  tl_structure,
                SUBSTR( BUILTIN.DF( Status ), (INSTR(BUILTIN.DF( Status ), ':',-1)+2))	AS	t_status,
                tl.custcol_cp_outship_qtytofulfill		AS	tl_qtytofulfill,
                tl.custcol_cp_qty_fulfilled			    AS	tl_qtyfulfilled,
                tl.custcol_cp_outship_qtyremaining	    AS	tl_qtyremaining
                
            
            FROM
                transaction		AS	t
            
            INNER JOIN transactionline	AS	tl	ON
                ( tl.transaction = t.ID ) 
            
            INNER JOIN item	AS 	i	ON
                ( tl.custcol_cp_outship_item=i.id)
            
            ${whereClause}
                                             
            ORDER BY 
                tl.custcol_cp_outship_shipitemtran 
         `;

        log.debug({ title: `sqlQuery lookupOSLines4SO was`, details: sql });

        let allResults = [];

        let results = query.runSuiteQLPaged({ query: sql, params: [], pageSize: 5000 });

        results.pageRanges.forEach(pageRange => {
            allResults.push(...results.fetch({ index: pageRange.index }).data.asMappedResults());
        });

        return allResults;
    }

    return {
        lookupFulfillableLines: lookupFulfillableLines,
        lookupAddableSoLines: lookupAddableSoLines,
        lookupShippableLines: lookupShippableLines,
        lookupShippableLinesSingleOS: lookupShippableLinesSingleOS,
        lookupOpenWoLines: lookupOpenWoLines,
        lookupExistingOutboundSerialLines: lookupExistingOutboundSerialLines,
        lookupExistingOutboundSerialLineIds: lookupExistingOutboundSerialLineIds,
        lookupOnhandSerials: lookupOnhandSerials,
        lookupLineSerials: lookupLineSerials,
        lookupAssignedSerials: lookupAssignedSerials,
        lookupLinkedOutboundSerials: lookupLinkedOutboundSerials,
        lookupOrphanedOutboundSerials: lookupOrphanedOutboundSerials,
        lookupNewlyCreatedLinkedWOs: lookupNewlyCreatedLinkedWOs,
        lookupNewlyCreatedSerials: lookupNewlyCreatedSerials,
        lookupStopCount: lookupStopCount,
        lookupEditRoles: lookupEditRoles,
        lookupKitItems : lookupKitItems,
        lookupKitItemsSingleOS: lookupKitItemsSingleOS,
        lookupKitMembers: lookupKitMembers,
        lookupItemInventory: lookupItemInventory,
        lookupWoWeights : lookupWoWeights,
        lookupWoWeightsBatch : lookupWoWeightsBatch,
        lookupOSLines4SO : lookupOSLines4SO
    };
});
