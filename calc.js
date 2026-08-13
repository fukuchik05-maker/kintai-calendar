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

  function calcLeaveConsumedDays(record) {
    var days = 0;
    if (record.status === "有給") days += 1;
    if (record.status === "半休") days += 0.5;
    if (record.hourlyLeaveHours) days += record.hourlyLeaveHours / 8;
    return days;
  }

  function calcLeaveBalance(grantedDays, records) {
    var consumed = 0;
    for (var i = 0; i < records.length; i++) {
      consumed += calcLeaveConsumedDays(records[i]);
    }
    return grantedDays - consumed;
  }

  function csvEscape(value) {
    var s = value === null || value === undefined ? "" : String(value);
    if (/[",\r\n]/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function buildCsvContent(rows) {
    var header = ["日付", "氏名", "ステータス", "出勤", "退勤", "休憩(分)", "時間有給(時間)", "実労働時間", "残業時間", "備考"];
    var lines = [header.join(",")];
    rows.forEach(function (r) {
      var cells = [
        r.date, r.name, r.status,
        r.clockIn || "", r.clockOut || "",
        r.breakMin !== null && r.breakMin !== undefined ? r.breakMin : "",
        r.hourlyLeaveHours || 0,
        r.workLabel || "", r.overtimeLabel || "", r.note || ""
      ];
      lines.push(cells.map(csvEscape).join(","));
    });
    return lines.join("\r\n");
  }

  var api = {
    timeToMinutes: timeToMinutes,
    STANDARD_START_MIN: STANDARD_START_MIN,
    STANDARD_END_MIN: STANDARD_END_MIN,
    calcActualWorkMinutes: calcActualWorkMinutes,
    floorTo15: floorTo15,
    calcOvertimeMinutes: calcOvertimeMinutes,
    minutesToHoursLabel: minutesToHoursLabel,
    calcLeaveConsumedDays: calcLeaveConsumedDays,
    calcLeaveBalance: calcLeaveBalance,
    csvEscape: csvEscape,
    buildCsvContent: buildCsvContent
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Calc = api;
  }
})(typeof window !== "undefined" ? window : this);
