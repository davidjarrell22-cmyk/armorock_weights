# Test Plan: Outbound Shipment Work Order Synchronization Map/Reduce Script

## Overview
This test plan covers the testing strategy for the **CP_outship_wo_sync_MR.js** Map/Reduce script, which synchronizes work order weights and statuses with outbound shipment records.

**Script:** CP_outship_wo_sync_MR.js
**Type:** Map/Reduce Script
**Version:** 1.0
**Last Updated:** 2025-11-18
**Test Environment:** NetSuite SuiteCloud Sandbox

---

## 1. Scope

### In Scope
- CP_outship_wo_sync_MR.js Map/Reduce script (all 4 stages)
- Work order weight synchronization
- Work order status tracking
- "All WO begun" global flag logic
- Custom field updates on outbound shipments
- Batch query optimization validation
- Change detection logic (save optimization)
- Error handling and logging

### Out of Scope
- Individual SuiteQL library function unit tests
- NetSuite core platform functionality
- UI/UX testing
- External system integrations
- Serial number and kit item workflows (not part of this script)

---

## 2. Test Strategy

### 2.1 Test Types

#### Functional Testing
Test each Map/Reduce stage (getInputData, map, reduce, summarize) to ensure correct business logic execution.

#### Integration Testing
Test complete end-to-end workflows from work order creation/updates through to outbound shipment record updates.

#### Performance Testing
Monitor governance consumption, execution time, and scalability with large datasets.

#### Error Handling & Edge Cases
Validate script behavior with null values, missing data, timeouts, and concurrent execution scenarios.

---

## 3. Test Cases

### 3.1 getInputData() Stage

**Purpose:** Detects newly created work orders and retrieves all open work order lines with weights for processing.

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| GET-01 | Detect newly created linked work orders | OS line created 1/1/2025, WO linked 1/5/2025 | Returns OS records that need WO ID updates | High |
| GET-02 | Retrieve open work order lines - basic | 10 open OS with WO lines in various statuses | Returns all open WO lines with necessary fields | High |
| GET-03 | Retrieve open work order lines - empty | No open outbound shipments exist | Returns empty array without errors | Medium |
| GET-04 | Batch weight lookup for multiple WOs | 50 work orders with weights | Successfully retrieves all weights in batched query | Critical |
| GET-05 | Handle work orders without weights | 5 WOs with no issued components | Returns WO data with null/zero weights | Medium |
| GET-06 | Validate weight data structure | WOs with weights: 0, 10.5, 250.75, 1000 | Weight map correctly keyed by WO ID | High |
| GET-07 | Large dataset handling | 1000+ open work order lines | Properly handles all results, no data loss | High |
| GET-08 | Mixed WO statuses | WOs with statuses: Not Started, In Process, Built, Closed | All statuses retrieved correctly | High |
| GET-09 | Duplicate WO IDs across lines | Multiple OS lines reference same WO | Weight lookup handles duplicates correctly | Medium |

---

### 3.2 map() Stage

**Purpose:** Groups work order line data by outbound shipment ID for processing in reduce stage.

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| MAP-01 | Group lines by OS ID - single OS | 5 lines from OS #12345 | All lines grouped under key "12345" | High |
| MAP-02 | Group lines by OS ID - multiple OS | Lines from OS #100, #200, #300 | Each OS ID becomes separate key | High |
| MAP-03 | Map work order status correctly | Line with WO status "In Process" | Status value correctly mapped to line data | High |
| MAP-04 | Map weight data to lines | Line WO has weight 150.5 lbs | Weight 150.5 associated with correct line | High |
| MAP-05 | Handle null work order IDs | Line with empty/null WO field | Line processed without errors | Medium |
| MAP-06 | Handle missing weight data | WO not in weight lookup map | Line uses null/0 for weight value | Medium |
| MAP-07 | Preserve all required fields | Line with all custom fields populated | All necessary data included in output | High |
| MAP-08 | Handle special characters in data | WO status with special characters | Data mapped without corruption | Low |

---

### 3.3 reduce() Stage

**Purpose:** Updates outbound shipment records with work order statuses, weights, and the global "all WO begun" flag.

#### 3.3.1 Work Order Status and Begun Flag Updates

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| RED-01 | WO begun flag - "In Process" status | Line with WO status = "In Process" | `custcol_cp_outship_wo_begun` = true | Critical |
| RED-02 | WO begun flag - "Closed" status | Line with WO status = "Closed" | `custcol_cp_outship_wo_begun` = true | Critical |
| RED-03 | WO begun flag - "Built" status | Line with WO status = "Built" | `custcol_cp_outship_wo_begun` = true | Critical |
| RED-04 | WO begun flag - "Not Started" status | Line with WO status = "Not Started" | `custcol_cp_outship_wo_begun` = false | Critical |
| RED-05 | WO begun flag - other statuses | Line with WO status = "Pending" or other | `custcol_cp_outship_wo_begun` = false | High |
| RED-06 | Update WO status field | Line with various WO statuses | `custcol_cp_outship_wo_status` updated correctly on OS line | High |

#### 3.3.2 Weight Updates

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| RED-07 | Update item weight - decimal | Line WO weight = 250.75 lbs | `custcol_cp_outship_item_weight` = 250.75 | High |
| RED-08 | Update item weight - zero | Line WO weight = 0 | `custcol_cp_outship_item_weight` = 0 | Medium |
| RED-09 | Update item weight - large value | Line WO weight = 5000.123 lbs | Weight stored with correct precision | Medium |
| RED-10 | Update item weight - null | Line WO has no weight data | Field set to null or 0 appropriately | Medium |

#### 3.3.3 Global "All WO Begun" Flag Logic

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| RED-11 | Global flag - all WOs started | OS with 3 lines, all WOs = "In Process" | `custbody_cp_outship_allwo_begun` = true | Critical |
| RED-12 | Global flag - partial started | OS with 3 lines, 2 WOs started, 1 not started | `custbody_cp_outship_allwo_begun` = false | Critical |
| RED-13 | Global flag - none started | OS with 3 lines, all WOs = "Not Started" | `custbody_cp_outship_allwo_begun` = false | High |
| RED-14 | Global flag - mixed with/without WOs | OS with 5 lines: 3 have WOs (all started), 2 have no WOs | `custbody_cp_outship_allwo_begun` = true (ignores lines without WOs) | Critical |
| RED-15 | Global flag - only lines without WOs | OS with 3 lines, none have WOs | `custbody_cp_outship_allwo_begun` = false or null | Medium |
| RED-16 | Global flag - single line started | OS with 1 line, WO = "Built" | `custbody_cp_outship_allwo_begun` = true | High |
| RED-17 | Global flag - mixed statuses | OS with lines in Built, Closed, In Process | `custbody_cp_outship_allwo_begun` = true | High |

#### 3.3.4 Change Detection and Save Optimization

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| RED-18 | No changes - skip save | OS where weight/status unchanged from current values | Record.save() NOT called, governance saved | High |
| RED-19 | Weight changed - save record | OS where WO weight changed from 100 to 150 | Record.save() called, changes persisted | High |
| RED-20 | Status changed - save record | OS where WO status changed from "Not Started" to "In Process" | Record.save() called, changes persisted | High |
| RED-21 | Global flag changed - save record | OS where all WOs just started (flag false → true) | Record.save() called, flag updated | High |
| RED-22 | Multiple fields changed | OS where weight, status, and begun flag all changed | Record.save() called once with all changes | Medium |

#### 3.3.5 Multi-Line Processing

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| RED-23 | Process multiple lines per OS | OS with 10 lines, various WO statuses and weights | All lines updated correctly on single OS record | High |
| RED-24 | Line with no WO reference | OS with 5 lines: 3 with WOs, 2 without | Lines without WO skipped/ignored, no errors | Medium |
| RED-25 | Maintain existing line data | OS line with existing custom data unrelated to WO sync | Unrelated data preserved during update | Medium |

---

### 3.4 summarize() Stage

**Purpose:** Logs execution statistics and errors for monitoring and troubleshooting.

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| SUM-01 | Log successful execution | Script completes without errors | Logs governance, concurrency, yields, success count | Medium |
| SUM-02 | Log map stage errors | Error thrown during map stage | Error details logged with context and key | High |
| SUM-03 | Log reduce stage errors | Error thrown during reduce stage | Error details logged with OS ID and context | High |
| SUM-04 | Count processed keys | Process 50 OS records | Logs accurate count of processed keys | Medium |
| SUM-05 | Log governance consumption | Script processes 100 records | Logs total governance units consumed | Medium |
| SUM-06 | Log partial failures | 45 of 50 OS updated successfully, 5 errors | Logs both success count and error details | High |

---

### 3.5 Integration Tests (End-to-End Workflows)

| Test ID | Test Case | Test Steps | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| INT-01 | Complete weight sync workflow | 1. Create OS with 3 WO lines<br>2. Issue components to WOs (add weight)<br>3. Run Map/Reduce script<br>4. Verify OS line weights updated | OS lines show correct weights from WOs | Critical |
| INT-02 | Status transition tracking | 1. Create OS with WO lines, all "Not Started"<br>2. Run script (verify begun=false)<br>3. Change WOs to "In Process"<br>4. Run script again<br>5. Verify begun=true | Status and begun flags updated at each step | Critical |
| INT-03 | Global flag transition workflow | 1. Create OS with 3 WO lines, all "Not Started"<br>2. Run script (allwo_begun=false)<br>3. Start 2 WOs<br>4. Run script (allwo_begun=false)<br>5. Start 3rd WO<br>6. Run script (allwo_begun=true) | Global flag accurate throughout transitions | Critical |
| INT-04 | Newly created WO detection | 1. Create OS line without WO<br>2. Later link WO to SO line<br>3. Run script<br>4. Verify OS updated with new WO ID | OS line updated with newly linked WO | High |
| INT-05 | Mixed OS processing | 1. Create 10 OS: 5 with WOs, 5 without<br>2. Run script<br>3. Verify updates | Only OS with WOs processed and updated | Medium |
| INT-06 | Batch optimization validation | 1. Create 100 OS with WO lines<br>2. Run script<br>3. Compare governance to non-batched approach | Batched queries use significantly less governance | High |
| INT-07 | Script restart/recovery | 1. Start script execution<br>2. Simulate timeout/yield<br>3. Script resumes<br>4. Verify all records processed | Script recovers and completes processing | High |
| INT-08 | Concurrent execution handling | 1. Queue multiple script instances<br>2. Monitor execution<br>3. Verify data integrity | No data corruption, proper concurrency handling | Medium |

---

### 3.6 Performance Tests

| Test ID | Test Case | Baseline/Target | Expected Result | Priority |
|---------|-----------|-----------------|-----------------|----------|
| PERF-01 | Governance: 10 OS records | Target: < 100 units | Governance consumption within limits | High |
| PERF-02 | Governance: 100 OS records | Target: < 800 units | Governance consumption within limits | High |
| PERF-03 | Governance: 500 OS records | Target: < 4000 units | Governance consumption within limits | Medium |
| PERF-04 | Execution time: 50 OS records | Target: < 30 seconds | Script completes within time limit | Medium |
| PERF-05 | Execution time: 500 OS records | Target: < 5 minutes | Script completes within time limit | Medium |
| PERF-06 | Batched vs individual queries | Compare governance consumption | Batched uses ≤50% of individual queries | Critical |
| PERF-07 | Large dataset: 1000+ WO lines | Target: Script completes successfully | All records processed without failure | High |
| PERF-08 | Concurrent execution limit | Monitor queue behavior | Proper queue management, no failures | Medium |

---

### 3.7 Edge Cases and Error Handling

| Test ID | Test Case | Test Data | Expected Result | Priority |
|---------|-----------|-----------|-----------------|----------|
| EDGE-01 | Null work order ID | OS line with null WO field | Handled gracefully, no script failure | High |
| EDGE-02 | Invalid work order ID | OS line with non-existent WO ID | Handled gracefully, logs warning | Medium |
| EDGE-03 | Deleted work order | OS line references deleted WO | Script continues, logs issue | Medium |
| EDGE-04 | Invalid OS record ID | Malformed record ID in input data | Error caught and logged, script continues | Medium |
| EDGE-05 | Missing custom fields | OS record missing expected custom fields | Uses default values, doesn't crash | High |
| EDGE-06 | Zero weight value | WO with 0 weight (no components issued) | Value of 0 stored correctly | Medium |
| EDGE-07 | Extremely large weight | WO weight > 10,000 lbs | Value stored correctly without truncation | Low |
| EDGE-08 | Special characters in WO status | Status contains quotes, ampersands, etc. | Status stored without corruption | Low |
| EDGE-09 | Empty getInputData result | Query returns no records | Script completes without processing, no errors | Medium |
| EDGE-10 | Script timeout during execution | Script exceeds time limit mid-execution | Script auto-resumes from last checkpoint | High |
| EDGE-11 | Governance limit reached | Script hits governance limit during reduce | Script reschedules and resumes properly | High |
| EDGE-12 | Concurrent record updates | Two processes try to update same OS simultaneously | Last-write-wins or proper record locking | High |
| EDGE-13 | Null weight from batch lookup | Batched query returns null for some WOs | Null values handled gracefully | Medium |
| EDGE-14 | OS with 50+ lines | OS record with maximum line count | All lines processed correctly | Medium |
| EDGE-15 | Rapid status changes | WO status changes during script execution | Script uses status at time of execution | Low |

---

## 4. Test Data Requirements

### 4.1 Outbound Shipment Records

**Small Test Set (10 records):**
- 3 OS with 1-3 lines each, all with WOs in "Not Started" status
- 3 OS with 1-3 lines each, all with WOs in "In Process" status
- 2 OS with mixed WO statuses per record
- 2 OS with some lines having WOs, some lines without WOs

**Medium Test Set (50 records):**
- 20 OS with 3-5 lines each, various WO statuses
- 20 OS with 5-10 lines each, various WO statuses
- 10 OS with mixed lines (with/without WOs)

**Large Test Set (200 records):**
- 100 OS with 5-10 lines each
- 100 OS with 10-15 lines each
- Mix of all WO status combinations
- Various weight ranges

### 4.2 Work Order Records

**Status Distribution:**
- 25% "Not Started"
- 25% "In Process"
- 25% "Built"
- 25% "Closed"

**Weight Ranges:**
- 10% with 0 weight (no components issued)
- 30% with 0.1-50 lbs
- 40% with 50-500 lbs
- 20% with 500-5000+ lbs

### 4.3 Test Scenarios

**Scenario 1: First Sync**
- New OS records never processed by script before
- All fields null/empty initially

**Scenario 2: Update Sync**
- OS records previously processed
- Some values changed, some unchanged
- Tests change detection logic

**Scenario 3: No Changes**
- OS records previously processed
- No changes to WO status or weights
- Tests save optimization

---

## 5. Test Environment Setup

### 5.1 Prerequisites
- NetSuite sandbox account with SuiteCloud enabled
- CP_outship_wo_sync_MR.js deployed to sandbox
- CP_outship_suiteql_lib.js deployed to sandbox
- Test data loaded per section 4
- Custom fields created:
  - `custcol_cp_outship_wo` (Line: Work Order Link)
  - `custcol_cp_outship_wo_begun` (Line: WO Begun Flag)
  - `custcol_cp_outship_wo_status` (Line: WO Status)
  - `custcol_cp_outship_item_weight` (Line: Item Weight)
  - `custbody_cp_outship_allwo_begun` (Header: All WO Begun Flag)
- Custom transaction type: `customtransaction_cp_outship`

### 5.2 Script Deployment
- Map/Reduce script deployed with appropriate permissions
- Script scheduled or manually executable
- Logging enabled for troubleshooting

### 5.3 Test User Accounts
- User with permissions to:
  - Execute Map/Reduce scripts
  - View/edit Outbound Shipment records
  - View Work Order records
  - Access execution logs

---

## 6. Test Execution

### 6.1 Execution Phases

| Phase | Timeline | Focus | Test IDs |
|-------|----------|-------|----------|
| Phase 1 | Week 1 | getInputData stage testing | GET-01 to GET-09 |
| Phase 2 | Week 2 | map stage testing | MAP-01 to MAP-08 |
| Phase 3 | Week 2-3 | reduce stage testing (all logic) | RED-01 to RED-25 |
| Phase 4 | Week 3 | summarize stage and logging | SUM-01 to SUM-06 |
| Phase 5 | Week 4 | End-to-end integration tests | INT-01 to INT-08 |
| Phase 6 | Week 4 | Performance and scalability | PERF-01 to PERF-08 |
| Phase 7 | Week 5 | Edge cases and error handling | EDGE-01 to EDGE-15 |
| Phase 8 | Week 5-6 | Regression testing and bug fixes | All critical/high priority tests |

### 6.2 Test Execution Approach

**Manual Testing:**
- Execute script via NetSuite UI
- Verify data updates in records
- Review execution logs
- Monitor governance consumption in script deployment

**Automated Testing (Optional):**
- SuiteScript unit test framework
- Automated data validation scripts
- Performance monitoring scripts

---

## 7. Entry and Exit Criteria

### 7.1 Entry Criteria
- ✅ Script deployed to sandbox environment
- ✅ Test data created and validated
- ✅ Custom fields and records configured
- ✅ Test cases reviewed and approved
- ✅ Test environment accessible

### 7.2 Exit Criteria
- ✅ All critical test cases passed (100%)
- ✅ All high-priority test cases passed (≥95%)
- ✅ All medium-priority test cases passed (≥85%)
- ✅ All critical and high-severity defects resolved
- ✅ Performance benchmarks met
- ✅ Regression tests passed
- ✅ Test summary report completed

---

## 8. Defect Management

### 8.1 Severity Definitions

| Severity | Description | Example | Response Time |
|----------|-------------|---------|---------------|
| Critical | Script fails completely, data corruption | Script won't execute, wrong records updated | Immediate |
| High | Major logic error, incorrect data updates | Global flag set incorrectly, weights wrong | 24 hours |
| Medium | Minor issue with workaround | Missing log message, minor edge case | 1 week |
| Low | Cosmetic, no functional impact | Typo in log, code style | Next release |

### 8.2 Defect Tracking
- Use GitHub Issues for defect tracking
- Label format: `bug`, `test-plan`, `map-reduce`
- Include: Test ID, severity, steps to reproduce, expected vs actual results

---

## 9. Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Insufficient test data volume | Medium | Low | Create data generation scripts for large datasets |
| Governance limits during testing | High | Medium | Test with realistic data sizes, monitor limits closely |
| Sandbox environment instability | High | Low | Have backup sandbox, schedule tests during off-peak |
| Change detection logic errors | High | Medium | Thorough testing of RED-18 to RED-22 test cases |
| Global flag calculation errors | Critical | Medium | Extensive testing of RED-11 to RED-17 test cases |
| Performance degradation at scale | High | Medium | Conduct PERF tests early with large datasets |

---

## 10. Success Metrics

- **Test Coverage:** 100% of Map/Reduce stages tested
- **Defect Detection Rate:** Identify 95%+ of bugs before production
- **Governance Efficiency:** Batched queries use ≤50% governance of individual queries
- **Execution Success Rate:** Script completes successfully ≥99% of the time
- **Data Accuracy:** 100% accuracy in weight sync and flag calculations

---

## 11. Deliverables

- ✅ Test plan document (this document)
- Test execution log (spreadsheet or tool)
- Defect reports and resolution log
- Performance benchmark results
- Test summary report with metrics
- Recommendations for production deployment

---

## 12. Approvals

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Test Lead | | | |
| Development Lead | | | |
| Business Owner | | | |

---

## Appendix A: Quick Reference - Critical Test Cases

These test cases MUST pass before production deployment:

1. **RED-01, RED-02, RED-03, RED-04:** WO begun flag logic (Core business logic)
2. **RED-11, RED-12, RED-14:** Global "all WO begun" flag calculation (Critical business requirement)
3. **RED-18, RED-19:** Change detection and save optimization (Governance efficiency)
4. **INT-01, INT-02, INT-03:** End-to-end workflow validation (Complete feature)
5. **PERF-06:** Batched query performance validation (Key optimization)
6. **GET-04:** Batch weight lookup functionality (Core feature)

---

## Appendix B: Test Execution Log Template

```
Test ID: [e.g., RED-11]
Test Case: [e.g., Global flag - all WOs started]
Execution Date: [YYYY-MM-DD]
Tester: [Name]
Environment: [Sandbox URL]
Test Data: [OS Record ID, WO IDs used]

Steps Executed:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Expected Result: [From test case]
Actual Result: [What actually happened]
Status: [PASS / FAIL / BLOCKED]
Defect ID: [If failed, link to GitHub issue]
Notes: [Additional observations]
Evidence: [Screenshot path, log excerpt, etc.]
```

---

**END OF TEST PLAN**

**Total Test Cases:** 73
**Critical Priority:** 12
**High Priority:** 40
**Medium Priority:** 17
**Low Priority:** 4
