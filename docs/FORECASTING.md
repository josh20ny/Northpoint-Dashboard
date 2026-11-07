# Attendance Forecasting Specification

## Scope
V1: adult total in-person attendance and ministry attendance where data quality allows. Architecture generic over numeric weekly metrics. Show **Actual**, **Leadership Target**, **Statistical Forecast**, with uncertainty bands and evaluation scores.

## UX controls
Select series, ministry, service, metric, history length (e.g. 1–10 years where data supports), horizon (weeks/months), confidence band and optional known future calendar events. Display same-week-year seasonality, raw and smoothed lines, model backtests, error metrics and limited-data warnings.

## Statistical process
Start with transparent seasonal naïve and trend-based baselines; evaluate optional ETS/SARIMA or equivalent only if they beat baseline on rolling-origin backtests. Change points such as COVID and May 2026 building move are retained in history; model should learn structural shifts/events and explain when extrapolation is unreliable. Do not default to deleting years. Avoid target leakage, forward-looking covariates unavailable at prediction time, and overfitting short post-move history.

## Model outputs
Forecast points per Sunday for horizon; 80/95% interval selectable; backtested WAPE/MAE and bias, training period, model version, source completeness, confidence warnings. Re-run deterministically when source correction or settings change. Initial training must not use Excel forecasts as ground truth.

## Guardrails
Forecasts are probabilistic planning aids. Holidays, venue changes, calendar shifts and special services require appropriate event/calendar features. Flag poor performance and uncertainty; do not promise precise predictions.
