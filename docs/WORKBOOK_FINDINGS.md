# Workbook Inspection Summary

The supplied XLSX has **51 worksheets**, **35,123 formulas** and **1,536 externally linked/import-wrapper formulas**. Source metadata in `data/SOURCE_MANIFEST.md`; all worksheet data in `data/workbook_inventory.csv`.

## Operating tabs
`Dash`, `SPD`, `Connection`, `$$$`, `WL`, `US`, `Transit`, `IO`, `Communications`. Extracted 2026 row-two labels in `data/legacy_columns.csv`. Header names, formulas and cached values are discovery material, **not confirmed canonical metric contracts**.

## Legacy and forecasting tabs
Historical Adults/Kids/Students/Connection, Giving, Adults YoY/Atnd/Online, Easter/Christmas, All Raw Data, 2014–2017 slices, forecasting/pivot sheets, venue capacity and 2018 front-door/back-door data. Flag these for source lineage, duplicate risk and inconsistent statistical definitions. `Sheet31`, `Sheet14` and other opaque labels need inspection prior to migration.

## Main risks
1. Formula results inherited from Google Sheets `IMPORTRANGE` export can be missing despite formulas and stale cached values.
2. 'Online engagement' historically uses a scaling factor; do not equate with people.
3. Venue/capacity/time changed; chart history should carry calendar-valid service attributes.
4. Different sheets may restate the same weekly number; do not double-import.
5. Giving aggregates and donor transactions require separate authorization and validation.
6. Old forecast outputs must not be used as observational ground truth.
