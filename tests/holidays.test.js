var assert = require("assert");
var Holidays = require("../holidays.js");

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

test("fixed-date holidays are recognized", function () {
  assert.strictEqual(Holidays.isHoliday("2026-01-01"), "元日");
  assert.strictEqual(Holidays.isHoliday("2026-02-11"), "建国記念の日");
  assert.strictEqual(Holidays.isHoliday("2026-02-23"), "天皇誕生日");
  assert.strictEqual(Holidays.isHoliday("2026-04-29"), "昭和の日");
  assert.strictEqual(Holidays.isHoliday("2026-05-03"), "憲法記念日");
  assert.strictEqual(Holidays.isHoliday("2026-05-04"), "みどりの日");
  assert.strictEqual(Holidays.isHoliday("2026-05-05"), "こどもの日");
  assert.strictEqual(Holidays.isHoliday("2026-08-11"), "山の日");
  assert.strictEqual(Holidays.isHoliday("2026-11-03"), "文化の日");
  assert.strictEqual(Holidays.isHoliday("2026-11-23"), "勤労感謝の日");
});

test("happy monday holidays are computed correctly", function () {
  assert.strictEqual(Holidays.isHoliday("2024-01-08"), "成人の日");
  assert.strictEqual(Holidays.isHoliday("2025-01-13"), "成人の日");
  assert.strictEqual(Holidays.isHoliday("2026-01-12"), "成人の日");
  assert.strictEqual(Holidays.isHoliday("2027-01-11"), "成人の日");
});

test("equinox holidays are computed via astronomical approximation", function () {
  assert.strictEqual(Holidays.isHoliday("2024-03-20"), "春分の日");
  assert.strictEqual(Holidays.isHoliday("2025-03-20"), "春分の日");
  assert.strictEqual(Holidays.isHoliday("2026-03-20"), "春分の日");
  assert.strictEqual(Holidays.isHoliday("2027-03-21"), "春分の日");

  assert.strictEqual(Holidays.isHoliday("2024-09-22"), "秋分の日");
  assert.strictEqual(Holidays.isHoliday("2025-09-23"), "秋分の日");
  assert.strictEqual(Holidays.isHoliday("2026-09-23"), "秋分の日");
  assert.strictEqual(Holidays.isHoliday("2027-09-23"), "秋分の日");
});

test("substitute holiday (振替休日) applies when a holiday falls on Sunday", function () {
  // 2024-05-05 (こどもの日) は日曜日 -> 翌5/6が振替休日
  assert.strictEqual(Holidays.isHoliday("2024-05-06"), "振替休日");
});

test("citizen's holiday (国民の休日) applies when a weekday is sandwiched between two holidays", function () {
  // 2026年: 敬老の日(9/21,月) と 秋分の日(9/23,水) に挟まれた 9/22(火) が国民の休日
  assert.strictEqual(Holidays.isHoliday("2026-09-21"), "敬老の日");
  assert.strictEqual(Holidays.isHoliday("2026-09-22"), "国民の休日");
  assert.strictEqual(Holidays.isHoliday("2026-09-23"), "秋分の日");
});

test("non-holiday weekday returns null", function () {
  assert.strictEqual(Holidays.isHoliday("2026-08-13"), null);
});

console.log("holidays.test.js done");
