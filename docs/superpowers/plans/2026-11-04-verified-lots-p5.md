# Verified BYU lots and P5 finish checks

Implement the existing L1/P5 card requirements: four sourced lots, correct weekly permit/hour results, and live source links. Use 59Y, 30G, 14A, 18U from the endpoint published in map.byu.edu/scripts/main.js, plus BYU's July 23, 2026 regulations. Ordinary car stalls and regular fall/winter weekly schedules only; disclose finals, holidays, event and posted-sign exceptions.

- [ ] Add database regression tests for the four lots, permit rejection, weekday/weekend schedules, 01:00/05:00 and 07:00/end-of-enforcement boundaries.
- [ ] Add a dated repeatable migration: retain existing sample rows and personal references, insert four real lots, use null for unknown capacity/availability/tow contact. Label sample areas explicitly and exclude them from primary results.
- [ ] Update necessary data loading and visible provenance/limitations; preserve the existing design.
- [ ] Run tests on the disposable local database, review the change, and apply the approved data update to Provo Parking.
- [ ] Verify published permit/time/details flow and accessibility, update README and Trello evidence. Only mark Done after checks pass; PO acceptance remains with Spencer. Do not invent time.
