// Settings that decide when the position of an approximate anchor may be calculated and applied.
// The values below are provisional defaults; replace them once the final thresholds are agreed.
// After a change, reload the app (the phone app picks up the new version by itself).

export const CALCULATION_RULES = {
  // Minimum number of different anchors with a measured distance before "Calculate position"
  // is allowed. With only two, one mistyped distance still gives a position with no warning;
  // with three or more, a bad distance shows up as a large residual.
  minAnchors: 3,

  // Effective anchor count N (Edge TDOA Solver Requirements, 7.2): how many evenly spaced anchors
  // the directions from the calculated position to the measured anchors are worth.
  // 3 evenly spaced anchors = 3.0; anchors at 0°, 90° and 180° = 2.67; all on one side < 2.
  // The position can only be applied when N is at least this value.
  minEffectiveAnchors: 2.5,

  // Horizontal dilution of precision (7.3): position error ≈ HDOP × measurement error.
  // About 1 is excellent; 3 evenly spaced anchors = 1.15. Large values mean the anchors pin the
  // position down along one direction only. The position can only be applied when HDOP is at
  // most this value.
  maxHdop: 2.0,
};
