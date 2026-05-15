# FinSight Test Case Specification

## Test Strategy and Approach

- Functional workflow verification
- Local data persistence checks
- CSV import and OCR flow validation
- Windows build artifact and script verification

## Test Plan

### Entry Criteria

- Dependencies installed
- App source present
- Documentation present

### Exit Criteria

- Core deliverables present
- Major workflows mapped to test cases

## Requirements Traceability Matrix

| Requirement | Test Cases |
| --- | --- |
| Authentication | TC-01, TC-02 |
| Transactions | TC-03, TC-04, TC-05 |
| Budgets | TC-06, TC-07 |
| CSV import | TC-08, TC-09 |
| OCR | TC-10 |
| AI assistant | TC-11, TC-12 |

## Test Cases

| ID | Title | Expected Result |
| --- | --- | --- |
| TC-01 | Register profile | Profile is created and session starts |
| TC-02 | Login profile | Existing user reaches main app |
| TC-03 | Add transaction | Transaction persists and appears in list |
| TC-04 | Edit transaction | Updated values are saved |
| TC-05 | Delete transaction | Transaction is removed |
| TC-06 | Create budget | Budget is stored |
| TC-07 | Budget progress update | Progress reflects spending |
| TC-08 | Import valid CSV | Non-duplicate rows are imported |
| TC-09 | Re-import duplicate CSV | Duplicate rows are skipped |
| TC-10 | OCR scan receipt | Candidate transaction data is extracted or clear error shown |
| TC-11 | Assistant fallback | Local-context answer is returned without installed model |
| TC-12 | Assistant local runtime | Generated answer is returned with installed model |

## Test Results Summary

This review verified repository deliverable presence, not full runtime execution.

- Source code present
- Renamed original charter and SRS present
- Technical design, test, deployment, and release documents present
- Automated tests not run in this pass
