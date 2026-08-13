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

test("minutesToHoursLabel formats minutes as H:MM", function () {
  assert.strictEqual(Calc.minutesToHoursLabel(480), "8:00");
  assert.strictEqual(Calc.minutesToHoursLabel(30), "0:30");
  assert.strictEqual(Calc.minutesToHoursLabel(0), "0:00");
  assert.strictEqual(Calc.minutesToHoursLabel(null), "");
});

console.log("calc.test.js done");
