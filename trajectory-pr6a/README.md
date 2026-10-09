# PR6A reviewer visual evidence

- before.png: exact TrajectoryInspector source archived from 669b2f0f91b0c787f7d8a26971c7c34210b935e1.
- after.png: exact current committed TrajectoryInspector and i18n source from 698af4670729197896fc8af7e504f9195e18d127.
- Both Chromium viewport 1000×650, Chinese, dark theme. Standalone inspector harness, synthetic row executionId pr6a-fixture-execution-001 and fixed request metadata. No actual daemon/model data used in these two images. The same fixture carries executionId for both sources; baseline does not consume/show it, current inspector displays it.
- Source CSS is unmodified. Harness applies root theme and places inspector in a fixed 720px column; no product layout changes. Same label, viewport, row, and heading-focus blur in both captures.
- Archived baseline component matches git object byte-for-byte. Current component matches committed object byte-for-byte. Screenshots visually inspected; after execution ID is visible.
- Separate prior actual daemon persistence/copy evidence remains pr6a-inspector-controlled-provider-1440x1200.png and independent report. These before/after images are fixture UI evidence only.
