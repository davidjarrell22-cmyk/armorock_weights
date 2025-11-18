# Test Plan: Armorock Weights - Outbound Shipment Synchronization

## Overview
This test plan covers the testing strategy for the Armorock Weights NetSuite customization, which synchronizes work order weights and statuses with outbound shipment records.

**Project:** armorock_weights
**Version:** 1.0
**Last Updated:** 2025-11-18
**Test Environment:** NetSuite SuiteCloud

---

## 1. Scope

### In Scope
- CP_outship_wo_sync_MR.js (Map/Reduce Script)
- CP_outship_suiteql_lib.js (SuiteQL Library)
- Work order weight synchronization
- Outbound shipment status updates
- Batch query optimizations
- Custom field updates
- Serial number management
- Kit item handling

### Out of Scope
- NetSuite core functionality
- External integrations (unless explicitly part of the workflow)
- UI/UX testing of standard NetSuite forms

---

## 2. Test Strategy

### 2.1 Test Types

#### Unit Testing
- Test individual functions in isolation
- Mock dependencies and external data sources
- Validate input/output behavior
- Test error handling and edge cases

#### Integration Testing
- Test complete workflows end-to-end
- Validate data flow between components
- Test Map/Reduce script execution stages
- Verify database query results

#### Performance Testing
- Governance unit consumption monitoring
- Batch query performance validation
- Large dataset handling
- Concurrent execution behavior

#### Regression Testing
- Verify existing functionality after changes
- Test previously identified bug fixes
- Validate optimizations don't break existing features

---

## 3. Test Cases

### 3.1 Map/Reduce Script: CP_outship_wo_sync_MR.js

#### 3.1.1 getInputData() Function

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| MR-01 | Detect newly created linked work orders | OS with lines where WO was created after line creation | Returns array of OS records that need WO ID updates | High |
| MR-02 | Retrieve open work order lines | Multiple open outbound shipments with various WO statuses | Returns all open WO lines with necessary fields | High |
| MR-03 | Batch weight lookup for multiple WOs | 50+ work orders with weights | Successfully retrieves weights in batched query | High |
| MR-04 | Handle empty result set | No open outbound shipments | Returns empty array without errors | Medium |
| MR-05 | Handle work orders without weights | WOs with no issued components | Returns WO data with null/zero weights | Medium |
| MR-06 | Validate weight data structure | Multiple WOs with different weight values | Map correctly populated with WO ID as key and weight as value | High |
| MR-07 | Large dataset handling | 1000+ open work order lines | Properly handles pagination and returns all results | High |

#### 3.1.2 map() Function

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|---|----------|
| MR-08 | Group lines by outbound shipment ID | Multiple lines from same OS | Lines grouped under correct OS ID key | High |
| MR-09 | Map work order status correctly | WO with status "In Process" | Status mapped to line data | High |
| MR-10 | Map weight data to lines | Line with WO that has 150.5 lbs weight | Weight correctly associated with line | High |
| MR-11 | Handle null work order IDs | Line with empty/null WO field | Line skipped or handled gracefully | Medium |
| MR-12 | Handle missing weight data | WO not in weight lookup map | Uses null or 0 for weight value | Medium |
| MR-13 | Preserve all line fields | Line with all custom fields populated | All necessary fields included in mapped output | High |

#### 3.1.3 reduce() Function

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| MR-14 | Update WO begun flag - In Process | Line with WO status "In Process" | `custcol_cp_outship_wo_begun` = true | High |
| MR-15 | Update WO begun flag - Closed | Line with WO status "Closed" | `custcol_cp_outship_wo_begun` = true | High |
| MR-16 | Update WO begun flag - Built | Line with WO status "Built" | `custcol_cp_outship_wo_begun` = true | High |
| MR-17 | Update WO begun flag - Not Started | Line with WO status "Not Started" or other | `custcol_cp_outship_wo_begun` = false | High |
| MR-18 | Update WO status field | Line with various WO statuses | `custcol_cp_outship_wo_status` updated correctly | High |
| MR-19 | Update item weight | Line with WO weight 250.75 lbs | `custcol_cp_outship_item_weight` = 250.75 | High |
| MR-20 | Set global begun flag - all started | OS with 3 lines, all WOs started | `custbody_cp_outship_allwo_begun` = true | Critical |
| MR-21 | Set global begun flag - partial | OS with 3 lines, 2 WOs started | `custbody_cp_outship_allwo_begun` = false | Critical |
| MR-22 | Set global begun flag - none started | OS with 3 lines, 0 WOs started | `custbody_cp_outship_allwo_begun` = false | High |
| MR-23 | Set global begun flag - mixed WOs | OS with lines: some with WOs, some without | Only considers lines with WO IDs | Critical |
| MR-24 | Only save changed records | OS where data hasn't changed | Record.save() not called, governance saved | High |
| MR-25 | Save modified records | OS with updated weight values | Record.save() called, changes persisted | High |
| MR-26 | Handle line with no WO | OS line without work order | Line skipped, no errors | Medium |
| MR-27 | Handle multiple lines per OS | OS with 10 lines, various statuses | All lines processed, OS updated correctly | High |
| MR-28 | Decimal precision in weights | Weight value 123.456789 | Weight stored with correct precision | Medium |

#### 3.1.4 summarize() Function

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| MR-29 | Log execution statistics | Completed script execution | Logs governance, concurrency, yields | Medium |
| MR-30 | Log map stage errors | Map stage throws error | Error details logged with context | High |
| MR-31 | Log reduce stage errors | Reduce stage throws error | Error details logged with context | High |
| MR-32 | Log successful execution | No errors during execution | Success message logged | Low |
| MR-33 | Count keys processed | Process 50 OS records | Logs correct count of processed keys | Medium |

---

### 3.2 SuiteQL Library: CP_outship_suiteql_lib.js

#### 3.2.1 Work Order Functions

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| SQL-01 | lookupOpenWoLines() - basic | 5 open OS with WO lines | Returns all open WO lines | High |
| SQL-02 | lookupOpenWoLines() - no results | No open outbound shipments | Returns empty array | Medium |
| SQL-03 | lookupOpenWoLines() - large dataset | 2000+ WO lines | Handles pagination correctly | High |
| SQL-04 | lookupNewlyCreatedLinkedWOs() - detect new WOs | WO created after OS line | Returns OS records needing update | High |
| SQL-05 | lookupNewlyCreatedLinkedWOs() - no new WOs | All WOs created before lines | Returns empty array | Medium |
| SQL-06 | lookupWoWeights() - single WO | WO ID 12345 | Returns correct weight from issued components | High |
| SQL-07 | lookupWoWeights() - WO with no components | WO with no issued inventory | Returns 0 or null weight | Medium |
| SQL-08 | lookupWoWeights() - WO not found | Invalid WO ID | Returns null/undefined | Medium |
| SQL-09 | lookupWoWeightsBatch() - multiple WOs | Array of 50 WO IDs | Returns map with all WO weights | Critical |
| SQL-10 | lookupWoWeightsBatch() - empty array | Empty WO ID array | Returns empty map | Medium |
| SQL-11 | lookupWoWeightsBatch() - mixed valid/invalid | 10 valid, 5 invalid WO IDs | Returns weights for valid WOs only | Medium |
| SQL-12 | lookupWoWeightsBatch() - performance | 500+ WO IDs | Completes within acceptable time/governance | High |
| SQL-13 | lookupWoWeightsBatch() - duplicate IDs | Array with duplicate WO IDs | Handles duplicates gracefully | Low |

#### 3.2.2 Outbound Shipment Functions

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| SQL-14 | lookupFulfillableLines() - by location | Location ID 5 | Returns all fulfillable SO lines for location | High |
| SQL-15 | lookupAddableSoLines() - available lines | SO with partially fulfilled lines | Returns remaining fulfillable quantity | High |
| SQL-16 | lookupShippableLines() - all OS | Multiple OS with various statuses | Returns only shippable lines | High |
| SQL-17 | lookupShippableLinesSingleOS() - single OS | OS ID 9876 | Returns shippable lines for that OS only | High |
| SQL-18 | lookupOSLines4SO() - linked lines | SO ID 5432 | Returns all OS lines linked to that SO | Medium |
| SQL-19 | lookupStopCount() - multiple stops | OS with 5 delivery stops | Returns count of 5 | Medium |
| SQL-20 | lookupStopCount() - no stops | OS with no stops | Returns 0 | Low |

#### 3.2.3 Serial Number Functions

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| SQL-21 | lookupExistingOutboundSerialLines() - duplicates | Serial already assigned to OS line | Returns existing serial record | High |
| SQL-22 | lookupExistingOutboundSerialLineIds() - get IDs | OS with assigned serials | Returns array of serial record IDs | Medium |
| SQL-23 | lookupOnhandSerials() - available | Location with 20 serials on hand | Returns available serial numbers | High |
| SQL-24 | lookupLineSerials() - by line | OS line ID 111 | Returns all serials for that line | High |
| SQL-25 | lookupAssignedSerials() - count | OS with 15 assigned serials | Returns count of 15 | Medium |
| SQL-26 | lookupLinkedOutboundSerials() - for display | OS ID 8888 | Returns formatted serial data for UI | Medium |
| SQL-27 | lookupOrphanedOutboundSerials() - cleanup | Serials with deleted OS records | Returns orphaned serial records | Medium |
| SQL-28 | lookupNewlyCreatedSerials() - detect new | Serials created after timestamp | Returns new serial records | Medium |

#### 3.2.4 Kit and Inventory Functions

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| SQL-29 | lookupKitItems() - all OS | Multiple OS with kit items | Returns all kit items from OS lines | High |
| SQL-30 | lookupKitItemsSingleOS() - single OS | OS with 2 kit items | Returns kit items for that OS | High |
| SQL-31 | lookupKitMembers() - components | Kit item ID 777 | Returns all component items of kit | High |
| SQL-32 | lookupItemInventory() - by location | Items [A, B, C] at location 5 | Returns inventory levels for all items | High |
| SQL-33 | lookupItemInventory() - empty location | Items at location with no inventory | Returns 0 quantities | Medium |

#### 3.2.5 Permission and Role Functions

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| SQL-34 | lookupEditRoles() - get roles | N/A | Returns array of role IDs allowed to edit | Low |

---

### 3.3 Integration Tests

#### 3.3.1 End-to-End Workflows

| Test ID | Test Case | Test Steps | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| INT-01 | Complete weight sync workflow | 1. Create OS with WO lines<br>2. Issue components to WO<br>3. Run Map/Reduce script<br>4. Verify OS updates | OS lines show correct weights, statuses updated | Critical |
| INT-02 | Newly created WO detection | 1. Create OS line<br>2. Later create linked WO<br>3. Run script | OS updated with new WO ID | High |
| INT-03 | Global begun flag workflow | 1. Create OS with 3 WO lines<br>2. Start 2 WOs<br>3. Run script<br>4. Start 3rd WO<br>5. Run script again | Flag false after step 3, true after step 5 | Critical |
| INT-04 | Batch processing efficiency | 1. Create 100 OS with WO lines<br>2. Run script<br>3. Monitor governance | Batched queries use less governance than individual | High |
| INT-05 | Status transition tracking | 1. WO status: Not Started<br>2. Change to In Process<br>3. Run script<br>4. Change to Closed<br>5. Run script | Status and begun flag updated correctly at each step | High |
| INT-06 | Mixed OS processing | 1. Create 10 OS: some with WOs, some without<br>2. Run script | Only WO-linked lines processed, others unchanged | Medium |
| INT-07 | Concurrent execution | 1. Start script execution<br>2. Monitor concurrency<br>3. Check for race conditions | No data corruption, proper locking | High |
| INT-08 | Error recovery | 1. Cause error in reduce stage<br>2. Script resumes<br>3. Verify data integrity | Script recovers, processes remaining records | High |

---

### 3.4 Performance Tests

#### 3.4.1 Governance Consumption

| Test ID | Test Case | Baseline | Target | Priority |
|---------|-----------|----------|--------|----------|
| PERF-01 | Governance: 10 OS records | Measure units consumed | < 100 units | High |
| PERF-02 | Governance: 100 OS records | Measure units consumed | < 800 units | High |
| PERF-03 | Governance: 500 OS records | Measure units consumed | < 4000 units | Medium |
| PERF-04 | Governance: Batched vs individual queries | Compare both approaches | Batched uses ≤50% of individual | Critical |

#### 3.4.2 Execution Time

| Test ID | Test Case | Baseline | Target | Priority |
|---------|-----------|----------|--------|----------|
| PERF-05 | Execution time: 50 OS records | Measure total time | < 30 seconds | Medium |
| PERF-06 | Execution time: 500 OS records | Measure total time | < 5 minutes | Medium |
| PERF-07 | Query response: lookupWoWeightsBatch(100) | Measure query time | < 5 seconds | High |

#### 3.4.3 Scalability

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| PERF-08 | Handle 1000+ WO lines | 1000 open WO lines | Script completes successfully | High |
| PERF-09 | Handle 5000+ query results | Query returning 5000+ rows | Pagination works correctly | Medium |
| PERF-10 | Concurrent Map/Reduce execution | Multiple queued instances | Proper queue management, no conflicts | Medium |

---

### 3.5 Edge Cases and Error Handling

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| EDGE-01 | Null work order ID | Line with null/empty WO field | Handled gracefully, no errors | High |
| EDGE-02 | Invalid work order ID | Non-existent WO ID | Handled gracefully, logs warning | Medium |
| EDGE-03 | Deleted work order | WO that was deleted | Script continues, logs issue | Medium |
| EDGE-04 | Invalid OS record ID | Malformed record ID in data | Error caught, script continues | Medium |
| EDGE-05 | Missing custom fields | Record missing expected fields | Uses default values, doesn't crash | High |
| EDGE-06 | Zero weight value | WO with 0 weight | Value of 0 saved correctly | Medium |
| EDGE-07 | Negative weight value | Invalid negative weight | Validation/error handling | Low |
| EDGE-08 | Extremely large weight | Weight > 10000 lbs | Value stored correctly | Low |
| EDGE-09 | Special characters in status | WO status with special chars | Status stored without corruption | Low |
| EDGE-10 | Empty query result | Query returns no results | Empty array handled gracefully | Medium |
| EDGE-11 | Timeout during execution | Script exceeds time limit | Auto-resume works correctly | High |
| EDGE-12 | Governance limit reached | Script hits governance limit | Script reschedules, resumes properly | High |
| EDGE-13 | Circular references | Data with circular relationships | Detected and handled | Low |
| EDGE-14 | Concurrent record updates | Two processes update same OS | Last-write-wins or proper locking | High |
| EDGE-15 | Malformed SuiteQL results | Query returns unexpected structure | Error caught, logged appropriately | Medium |

---

## 4. Test Data Requirements

### 4.1 Master Test Data Set

#### Outbound Shipment Records
- 5 OS with 1-3 lines each (small set)
- 50 OS with 5-10 lines each (medium set)
- 200 OS with 5-15 lines each (large set)
- Mix of statuses: Open, In Process, Pending, Closed
- Mix of with/without work orders

#### Work Orders
- 100 work orders with various statuses:
  - 25 Not Started
  - 25 In Process
  - 25 Built
  - 25 Closed
- Work orders with 0, 1, 5, 20+ issued components
- Weight ranges: 0, 0.1-10, 10-100, 100-1000, 1000+ lbs

#### Custom Fields
- All custom fields populated with valid test data
- Some records with null/empty custom fields
- Edge cases: max length values, special characters

#### Serial Numbers
- 200 serial numbers with various statuses
- Assigned and unassigned serials
- Orphaned serial records

#### Locations
- 5 test locations with inventory
- 1 location with no inventory

#### Kit Items
- 10 kit items with 2-5 components each
- Components with and without inventory

---

## 5. Test Environment Setup

### 5.1 Prerequisites
- NetSuite sandbox account with SuiteCloud project enabled
- Test data loaded per section 4.1
- CP_outship_wo_sync_MR.js deployed and scheduled
- CP_outship_suiteql_lib.js deployed
- Custom fields and records created
- Test user accounts with appropriate roles

### 5.2 Configuration
- Map/Reduce script deployment configuration
- Scheduled script trigger settings
- Test location and subsidiary setup
- Custom preferences configured

---

## 6. Test Execution

### 6.1 Test Execution Schedule

| Phase | Timeline | Focus |
|-------|----------|-------|
| Phase 1 | Week 1 | Unit tests for library functions (SQL-01 to SQL-34) |
| Phase 2 | Week 2 | Map/Reduce script unit tests (MR-01 to MR-33) |
| Phase 3 | Week 3 | Integration tests (INT-01 to INT-08) |
| Phase 4 | Week 4 | Performance and scalability tests (PERF-01 to PERF-10) |
| Phase 5 | Week 5 | Edge cases and error handling (EDGE-01 to EDGE-15) |
| Phase 6 | Week 6 | Regression testing and bug fixes |

### 6.2 Test Execution Approach

#### Manual Testing
- UI-related validations
- Visual inspection of logs
- Data verification in NetSuite UI
- Governance monitoring

#### Automated Testing (Recommended)
- Unit test framework: SuiteScript Testing Framework or custom harness
- Mock NetSuite modules for offline testing
- Automated data validation scripts
- Performance monitoring scripts

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria
- ✅ All code deployed to sandbox environment
- ✅ Test data created and validated
- ✅ Test environment configured
- ✅ Test cases reviewed and approved
- ✅ Testing tools and frameworks ready

### 7.2 Exit Criteria
- ✅ All high-priority test cases executed
- ✅ 100% of critical test cases passed
- ✅ ≥90% of high-priority test cases passed
- ✅ ≥80% of medium-priority test cases passed
- ✅ All critical and high-severity defects resolved
- ✅ Performance targets met
- ✅ Regression tests passed
- ✅ Test summary report completed

---

## 8. Defect Management

### 8.1 Severity Definitions

| Severity | Description | Example | Response Time |
|----------|-------------|---------|---------------|
| Critical | System crash, data loss, major functionality broken | Script fails to execute, data corruption | Immediate |
| High | Major functionality impaired, workaround available | Weight sync fails for some records | 24 hours |
| Medium | Minor functionality issue, workaround available | Incorrect log message | 1 week |
| Low | Cosmetic issue, no impact on functionality | Typo in comment | Next release |

### 8.2 Defect Tracking
- Use GitHub Issues for defect tracking
- Include: Test ID, severity, steps to reproduce, actual vs expected results
- Link defects to specific test cases

---

## 9. Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Insufficient test data | Medium | Low | Create comprehensive data generation scripts |
| Governance limits in testing | High | Medium | Test with realistic data volumes, monitor limits |
| NetSuite sandbox availability | High | Low | Schedule testing during off-peak hours |
| Test environment differs from production | High | Medium | Maintain parity between environments |
| Concurrent execution issues | Medium | Medium | Include concurrency tests early |
| Performance degradation with scale | High | Medium | Conduct performance tests with large datasets |

---

## 10. Deliverables

### 10.1 Test Artifacts
- ✅ Test plan document (this document)
- Test case spreadsheet with results
- Test data generation scripts
- Automated test scripts (if applicable)
- Test execution logs
- Defect reports
- Performance test results
- Test summary report

### 10.2 Test Summary Report Contents
- Test execution metrics (pass/fail counts)
- Defect summary by severity
- Performance benchmark results
- Coverage analysis
- Recommendations for production deployment
- Known issues and limitations

---

## 11. Approvals

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Test Lead | | | |
| Development Lead | | | |
| Project Manager | | | |
| Business Stakeholder | | | |

---

## 12. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-18 | Claude | Initial test plan creation |

---

## Appendix A: Test Case Template

```
Test ID: [Unique identifier]
Test Case Name: [Descriptive name]
Module: [Script/function being tested]
Priority: [Critical/High/Medium/Low]
Prerequisites: [Required setup]
Test Steps:
  1. [Step 1]
  2. [Step 2]
  3. [Step 3]
Test Data: [Specific data needed]
Expected Result: [What should happen]
Actual Result: [What actually happened]
Status: [Pass/Fail/Blocked/Not Executed]
Notes: [Additional information]
```

---

## Appendix B: Key Metrics to Monitor

### Script Execution Metrics
- Total governance units consumed
- Execution time (getInputData, map, reduce, summarize)
- Records processed per stage
- Concurrent execution count
- Yield count and reschedules

### Data Validation Metrics
- Records updated vs. records read
- Weight values: min, max, average, null count
- Status distribution before and after
- Global flag accuracy rate
- Change detection accuracy (saves avoided)

### Error Metrics
- Map stage error count and types
- Reduce stage error count and types
- Failed record processing count
- Recovery success rate

---

**END OF TEST PLAN**
