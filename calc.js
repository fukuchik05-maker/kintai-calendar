(function (root) {
  "use strict";

  function timeToMinutes(hhmm) {
    if (!hhmm) return null;
    var parts = hhmm.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  var STANDARD_START_MIN = 8 * 60 + 30; // 510 = 08:30
  var STANDARD_END_MIN = 17 * 60 + 30;  // 1050 = 17:30

  function calcActualWorkMinutes(clockIn, clockOut, breakMin) {
    if (!clockIn || !clockOut) return null;
    var inMin = timeToMinutes(clockIn);
    var outMin = timeToMinutes(clockOut);
    var diff = outMin - inMin - (breakMin || 0);
    if (diff < 0) return null;
    return diff;
  }

  function floorTo15(minutes) {
    return Math.floor(minutes / 15) * 15;
  }

  function calcOvertimeMinutes(clockIn, clockOut, status) {
    if (status !== "出勤") return 0;
    if (!clockIn || !clockOut) return 0;
    var inMin = timeToMinutes(clockIn);
    var outMin = timeToMinutes(clockOut);
    var early = inMin < STANDARD_START_MIN ? STANDARD_START_MIN - inMin : 0;
    var late = outMin > STANDARD_END_MIN ? outMin - STANDARD_END_MIN : 0;
    return floorTo15(early + late);
  }

  function minutesToHoursLabel(minutes) {
    if (minutes === null || minutes === undefined) return "";
    var sign = minutes < 0 ? "-" : "";
    var abs = Math.abs(minutes);
    var h = Math.floor(abs / 60);
    var m = abs % 60;
    return sign + h + ":" + (m < 10 ? "0" + m : m);
  }

  var api = {
    timeToMinutes: timeToMinutes,
    STANDARD_START_MIN: STANDARD_START_MIN,
    STANDARD_END_MIN: STANDARD_END_MIN,
    calcActualWorkMinutes: calcActualWorkMinutes,
    floorTo15: floorTo15,
    calcOvertimeMinutes: calcOvertimeMinutes,
    minutesToHoursLabel: minutesToHoursLabel
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Calc = api;
  }
})(typeof window !== "undefined" ? window : this);
