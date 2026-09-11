var assert = require("assert");
var Calc = require("../calc.js");

function test(name, fn) {
  try {
    fn();
    console.log("OK: " + name);
  } catch (e) {
    console.error("FAIL: " + name);
    console.error(e);
    process.exitCode = 1;
  }
}

test("timeToMinutes converts HH:MM to minutes", function () {
  assert.strictEqual(Calc.timeToMinutes("08:30"), 510);
  assert.strictEqual(Calc.timeToMinutes("17:30"), 1050);
  assert.strictEqual(Calc.timeToMinutes("00:00"), 0);
});

test("calcActualWorkMinutes returns worked minutes minus break", function () {
  assert.strictEqual(Calc.calcActualWorkMinutes("08:30", "17:30", 60), 480);
  assert.strictEqual(Calc.calcActualWorkMinutes("08:30", "18:10", 60), 520);
});

test("calcActualWorkMinutes returns null when times missing", function () {
  assert.strictEqual(Calc.calcActualWorkMinutes(null, "17:30", 60), null);
  assert.strictEqual(Calc.calcActualWorkMinutes("08:30", null, 60), null);
  assert.strictEqual(Calc.calcActualWorkMinutes("", "", 0), null);
});

test("calcActualWorkMinutes returns null when clockOut before clockIn minus break", function () {
  assert.strictEqual(Calc.calcActualWorkMinutes("08:30", "09:00", 60), null);
});

test("floorTo15 rounds down to nearest 15 minutes", function () {
  assert.strictEqual(Calc.floorTo15(0), 0);
  assert.strictEqual(Calc.floorTo15(14), 0);
  assert.strictEqual(Calc.floorTo15(15), 15);
  assert.strictEqual(Calc.floorTo15(29), 15);
  assert.strictEqual(Calc.floorTo15(46), 45);
});

test("calcOvertimeMinutes counts time before 08:30 and after 17:30, floored to 15min", function () {
  assert.strictEqual(Calc.calcOvertimeMinutes("08:30", "17:30", "出勤"), 0);
  assert.strictEqual(Calc.calcOvertimeMinutes("08:30", "18:10", "出勤"), 30); // 40分->切り捨て30分
  assert.strictEqual(Calc.calcOvertimeMinutes("08:00", "17:30", "出勤"), 30); // 早出30分
  assert.strictEqual(Calc.calcOvertimeMinutes("08:00", "18:00", "出勤"), 60); // 早出30+遅め30=60
});

test("calcOvertimeMinutes returns 0 when status is not 出勤 or times missing", function () {
  assert.strictEqual(Calc.calcOvertimeMinutes("08:00", "18:00", "有給"), 0);
  assert.strictEqual(Calc.calcOvertimeMinutes(null, "18:00", "出勤"), 0);
  assert.strictEqual(Calc.calcOvertimeMinutes("08:00", null, "出勤"), 0);
});

test("calcOvertimeMinutes: 休日は拘束時間が8時間未満なら休憩を引かず全部残業", function () {
  assert.strictEqual(Calc.calcOvertimeMinutes("06:45", "09:15", "出勤", true, 0), 150);
  assert.strictEqual(Calc.calcOvertimeMinutes("06:45", "09:15", "出勤", true, 60), 150); // 8時間未満なので休憩60分は無視
});

test("calcOvertimeMinutes: 休日で拘束8時間以上なら休憩を差し引く", function () {
  assert.strictEqual(Calc.calcOvertimeMinutes("08:00", "18:00", "出勤", true, 60), 540); // 600分-60分
});

test("calcOvertimeMinutes: 休日で拘束8時間以上でも休憩0分なら差し引きなし", function () {
  assert.strictEqual(Calc.calcOvertimeMinutes("08:00", "18:00", "出勤", true, 0), 600);
});

test("calcOvertimeMinutes: isDayOffを渡さなければ平日ルールのまま(後方互換)", function () {
  assert.strictEqual(Calc.calcOvertimeMinutes("08:00", "18:00", "出勤"), 60); // 早出30+遅め30=60(既存ケースと同じ)
});

test("minutesToHoursLabel formats minutes as H:MM", function () {
  assert.strictEqual(Calc.minutesToHoursLabel(480), "8:00");
  assert.strictEqual(Calc.minutesToHoursLabel(30), "0:30");
  assert.strictEqual(Calc.minutesToHoursLabel(0), "0:00");
  assert.strictEqual(Calc.minutesToHoursLabel(null), "");
});

test("calcLeaveConsumedDays counts 有給=1, 半休=0.5, 時間有給=hours/8", function () {
  assert.strictEqual(Calc.calcLeaveConsumedDays({ status: "有給" }), 1);
  assert.strictEqual(Calc.calcLeaveConsumedDays({ status: "半休" }), 0.5);
  assert.strictEqual(Calc.calcLeaveConsumedDays({ status: "出勤", hourlyLeaveHours: 4 }), 0.5);
  assert.strictEqual(Calc.calcLeaveConsumedDays({ status: "欠勤" }), 0);
  assert.strictEqual(Calc.calcLeaveConsumedDays({ status: "出勤" }), 0);
});

test("calcLeaveBalance subtracts consumed days from granted days", function () {
  var records = [
    { status: "有給" },
    { status: "半休" },
    { status: "出勤", hourlyLeaveHours: 4 },
    { status: "欠勤" }
  ];
  assert.strictEqual(Calc.calcLeaveBalance(20, records), 20 - 1 - 0.5 - 0.5);
});

test("csvEscape wraps values containing comma/quote/newline in quotes", function () {
  assert.strictEqual(Calc.csvEscape("田中"), "田中");
  assert.strictEqual(Calc.csvEscape("a,b"), '"a,b"');
  assert.strictEqual(Calc.csvEscape('say "hi"'), '"say ""hi"""');
  assert.strictEqual(Calc.csvEscape(null), "");
  assert.strictEqual(Calc.csvEscape(0), "0");
});

test("buildCsvContent builds header + rows joined by CRLF", function () {
  var csv = Calc.buildCsvContent([
    { date: "2026-08-13", name: "田中", status: "出勤", clockIn: "08:30", clockOut: "17:30", breakMin: 60, hourlyLeaveHours: 0, workLabel: "8:00", overtimeLabel: "0:00", note: "" }
  ]);
  var lines = csv.split("\r\n");
  assert.strictEqual(lines[0], "日付,氏名,ステータス,出勤,退勤,休憩(分),時間有給(時間),実労働時間,残業時間,備考");
  assert.strictEqual(lines[1], "2026-08-13,田中,出勤,08:30,17:30,60,0,8:00,0:00,");
});

test("determinePunchField returns clockIn before 8:30, clockOut otherwise", function () {
  assert.strictEqual(Calc.determinePunchField(new Date(2026, 7, 13, 7, 0)), "clockIn");
  assert.strictEqual(Calc.determinePunchField(new Date(2026, 7, 13, 8, 29)), "clockIn");
  assert.strictEqual(Calc.determinePunchField(new Date(2026, 7, 13, 8, 30)), "clockOut");
  assert.strictEqual(Calc.determinePunchField(new Date(2026, 7, 13, 12, 0)), "clockOut");
  assert.strictEqual(Calc.determinePunchField(new Date(2026, 7, 13, 18, 0)), "clockOut");
});

console.log("calc.test.js done");
