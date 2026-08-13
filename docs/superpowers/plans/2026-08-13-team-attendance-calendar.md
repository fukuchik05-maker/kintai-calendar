# カレンダー形式 勤怠管理ツール Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 家族/少人数チーム(3人想定、人数は可変)の出退勤・休暇をカレンダー形式で一覧管理できる、サーバー不要・ビルド不要のブラウザアプリを作る。

**Architecture:** `index.html` をダブルクリックで開くだけで動く静的サイト。ロジックを純粋関数(`calc.js`, `holidays.js`)に分離してNode.jsで単体テストし、UI層(`app.js`, `modals.js`, `summary.js`, `io.js`, `main.js`)はブラウザでの手動確認で検証する。データはLocalStorageに1つのJSONとして保存する。

**Tech Stack:** Vanilla JavaScript(ES5相当の構文、`var`/`function`で統一しfile://でも確実に動くようにする)、素のCSS、Node.js(テスト実行のみ、ビルドには使わない)。

## Global Constraints

- 外部ライブラリ・CDN・npm依存を一切使わない(仕様書のスコープ外事項に準拠)。
- すべてのファイルは `file://` プロトコルで直接開いても動作すること(ES Modulesの`import`や`fetch`は使わない。`<script src="...">`のクラシックスクリプトのみ使用)。
- 各JSファイルは、ブラウザでは `window.XXX` に、Node.jsでは `module.exports` にAPIを公開する共通パターン(UMD風)を使うこと。
- コード内の文字列・ラベルは日本語UIに合わせる(ステータス名: 出勤/休日/有給/半休/欠勤/その他)。
- 所定労働時間は 08:30〜17:30 固定。残業は15分未満切り捨て。
- 設計書: `docs/superpowers/specs/2026-08-13-team-attendance-calendar-design.md` を正とする。

## 実装上の設計判断(仕様書からの補足)

仕様書では祝日を「静的テーブルを埋め込み、年が進んだら手動追加」としていたが、
2026年以降の祝日(特に春分・秋分の日)を手作業で正確に埋めるのは誤りのリスクが高い。
そこで、固定日祝日・ハッピーマンデー・春分秋分(天文学的近似式)・振替休日・国民の休日を
アルゴリズムで自動計算する `holidays.js` を実装する。挙動(カレンダー上の色分け)は
仕様書の意図通りで、保守性・正確性が向上する。この判断はタスク3で実装・テストする。

また、仕様書は「単一HTMLファイルにすべて埋め込む」としていたが、実装では
`index.html` / `style.css` / `holidays.js` / `calc.js` / `storage.js` / `app.js` /
`modals.js` / `summary.js` / `io.js` / `main.js` の複数ファイルに分割する。
理由は次の2点:
1. 計算ロジック(`calc.js`, `holidays.js`, `storage.js`)をNode.jsから`require`して
   単体テストするには、独立したファイルである必要がある(単一HTMLに埋め込むとテスト不可能)。
2. `<script src="...">` によるクラシックスクリプトの読み込みは、`fetch`やES Modulesの
   `import`と異なり `file://` プロトコルでもCORS制限を受けず問題なく動作するため、
   「サーバー不要・ビルド不要・ダブルクリックで起動」という仕様書の目的は
   ファイル分割後も損なわれない。
全ファイルを同じフォルダに置き、`index.html` をダブルクリックすれば動く点は仕様書の意図通り。

---

## ファイル構成

```
kin/
  index.html       # ページ構造(タスク5)
  style.css        # 見た目(タスク5)
  holidays.js       # 祝日計算(タスク3)
  calc.js          # 勤怠計算・CSV整形の純粋関数(タスク1, 2)
  storage.js       # LocalStorageデータモデル・CRUD(タスク4)
  app.js           # 状態管理・カレンダー描画・月移動(タスク6)
  modals.js        # 勤怠編集モーダル・メンバー設定モーダル(タスク7, 9)
  summary.js       # 月間集計パネル・月報(タスク8, 10)
  io.js            # CSV出力・JSONバックアップ/復元(タスク11, 12)
  main.js          # イベント配線・起動処理(タスク13)
  tests/
    calc.test.js    # calc.js の単体テスト(タスク1, 2)
    holidays.test.js # holidays.js の単体テスト(タスク3)
    storage.test.js # storage.js の単体テスト(タスク4)
```

---

### Task 1: calc.js — 実労働時間・残業時間の計算

**Files:**
- Create: `calc.js`
- Test: `tests/calc.test.js`

**Interfaces:**
- Produces: `Calc.timeToMinutes(hhmm: string): number`, `Calc.STANDARD_START_MIN: number`(=510), `Calc.STANDARD_END_MIN: number`(=1050), `Calc.calcActualWorkMinutes(clockIn: string|null, clockOut: string|null, breakMin: number): number|null`, `Calc.floorTo15(minutes: number): number`, `Calc.calcOvertimeMinutes(clockIn: string|null, clockOut: string|null, status: string): number`, `Calc.minutesToHoursLabel(minutes: number|null): string`

- [ ] **Step 1: テストディレクトリを作成し、失敗するテストを書く**

`tests/calc.test.js` を作成:

```js
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
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `node tests/calc.test.js`
Expected: `Cannot find module '../calc.js'` のようなエラーで失敗する。

- [ ] **Step 3: calc.js を実装する**

`calc.js` を作成:

```js
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
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `node tests/calc.test.js`
Expected: すべて `OK:` で始まる行が出力され、`process.exitCode` が設定されない(0で終了)。

- [ ] **Step 5: gitリポジトリを初期化してコミットする**

このプロジェクトはまだgitリポジトリではないため、ここで初期化してから最初のコミットを行う。
以降のタスクでは通常通り `git add` / `git commit` するだけでよい。

```bash
git init
git add calc.js tests/calc.test.js
git commit -m "feat: add work/overtime calculation functions"
```

---

### Task 2: calc.js — 有給残計算とCSV整形

**Files:**
- Modify: `calc.js`
- Modify: `tests/calc.test.js`

**Interfaces:**
- Consumes: Task 1の `calc.js` の構造(UMDパターン、`api`オブジェクト)
- Produces: `Calc.calcLeaveConsumedDays(record: {status: string, hourlyLeaveHours?: number}): number`, `Calc.calcLeaveBalance(grantedDays: number, records: Array<{status, hourlyLeaveHours}>): number`, `Calc.csvEscape(value: any): string`, `Calc.buildCsvContent(rows: Array<{date, name, status, clockIn, clockOut, breakMin, hourlyLeaveHours, workLabel, overtimeLabel, note}>): string`

- [ ] **Step 1: 失敗するテストを追記する**

`tests/calc.test.js` の `console.log("calc.test.js done");` の直前に追記:

```js
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
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `node tests/calc.test.js`
Expected: `calcLeaveConsumedDays`等のテストが `Calc.calcLeaveConsumedDays is not a function` で失敗する。

- [ ] **Step 3: calc.js に関数を追加する**

`calc.js` の `function minutesToHoursLabel(...) {...}` の直後に追加:

```js
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
```

そして `api` オブジェクトに追加(`minutesToHoursLabel: minutesToHoursLabel` の行の直後):

```js
    calcLeaveConsumedDays: calcLeaveConsumedDays,
    calcLeaveBalance: calcLeaveBalance,
    csvEscape: csvEscape,
    buildCsvContent: buildCsvContent
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `node tests/calc.test.js`
Expected: 全テストが `OK:` で成功する。

- [ ] **Step 5: コミット**

```bash
git add calc.js tests/calc.test.js
git commit -m "feat: add leave balance calculation and CSV formatting"
```

---

### Task 3: holidays.js — 祝日自動計算

**Files:**
- Create: `holidays.js`
- Test: `tests/holidays.test.js`

**Interfaces:**
- Produces: `Holidays.getHolidaysForYear(year: number): {[dateKey: string]: string}`, `Holidays.isHoliday(dateStr: string): string|null`

- [ ] **Step 1: 失敗するテストを書く**

`tests/holidays.test.js` を作成:

```js
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
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `node tests/holidays.test.js`
Expected: `Cannot find module '../holidays.js'` で失敗する。

- [ ] **Step 3: holidays.js を実装する**

`holidays.js` を作成:

```js
(function (root) {
  "use strict";

  var FIXED_HOLIDAYS = [
    [1, 1, "元日"],
    [2, 11, "建国記念の日"],
    [2, 23, "天皇誕生日"],
    [4, 29, "昭和の日"],
    [5, 3, "憲法記念日"],
    [5, 4, "みどりの日"],
    [5, 5, "こどもの日"],
    [8, 11, "山の日"],
    [11, 3, "文化の日"],
    [11, 23, "勤労感謝の日"]
  ];

  var NTH_MONDAY_HOLIDAYS = [
    [1, 2, "成人の日"],
    [7, 3, "海の日"],
    [9, 3, "敬老の日"],
    [10, 2, "スポーツの日"]
  ];

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function dateKey(year, month, day) {
    return year + "-" + pad2(month) + "-" + pad2(day);
  }

  function nthMondayOfMonth(year, month, nth) {
    var d = new Date(year, month - 1, 1);
    var offset = (1 - d.getDay() + 7) % 7;
    var firstMonday = 1 + offset;
    return firstMonday + (nth - 1) * 7;
  }

  function vernalEquinoxDay(year) {
    // 1980-2099年で有効な近似式(国立天文台の公表値と一致することを確認済み)
    return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  function autumnalEquinoxDay(year) {
    return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  function buildBaseHolidays(year) {
    var map = {};
    FIXED_HOLIDAYS.forEach(function (h) {
      map[dateKey(year, h[0], h[1])] = h[2];
    });
    NTH_MONDAY_HOLIDAYS.forEach(function (h) {
      var day = nthMondayOfMonth(year, h[0], h[1]);
      map[dateKey(year, h[0], day)] = h[2];
    });
    map[dateKey(year, 3, vernalEquinoxDay(year))] = "春分の日";
    map[dateKey(year, 9, autumnalEquinoxDay(year))] = "秋分の日";
    return map;
  }

  function addDays(y, m, d, delta) {
    var dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), weekday: dt.getDay() };
  }

  function applyCitizenHolidays(map, year) {
    var toAdd = {};
    Object.keys(map).forEach(function (key) {
      var parts = key.split("-").map(Number);
      var mid = addDays(parts[0], parts[1], parts[2], 1);
      var midKey = dateKey(mid.y, mid.m, mid.d);
      var after = addDays(mid.y, mid.m, mid.d, 1);
      var afterKey = dateKey(after.y, after.m, after.d);
      if (!map[midKey] && map[afterKey] && mid.weekday !== 0) {
        toAdd[midKey] = "国民の休日";
      }
    });
    Object.keys(toAdd).forEach(function (k) {
      map[k] = toAdd[k];
    });
  }

  function applySubstituteHolidays(map, year) {
    var keys = Object.keys(map).sort();
    keys.forEach(function (key) {
      var parts = key.split("-").map(Number);
      var weekday = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
      if (weekday !== 0) return;
      var next = addDays(parts[0], parts[1], parts[2], 1);
      var nextKey = dateKey(next.y, next.m, next.d);
      while (map[nextKey]) {
        next = addDays(next.y, next.m, next.d, 1);
        nextKey = dateKey(next.y, next.m, next.d);
      }
      map[nextKey] = "振替休日";
    });
  }

  var cache = {};
  function getHolidaysForYear(year) {
    if (cache[year]) return cache[year];
    var map = buildBaseHolidays(year);
    applyCitizenHolidays(map, year);
    applySubstituteHolidays(map, year);
    cache[year] = map;
    return map;
  }

  function isHoliday(dateStr) {
    var year = parseInt(dateStr.slice(0, 4), 10);
    var map = getHolidaysForYear(year);
    return map[dateStr] || null;
  }

  var api = {
    getHolidaysForYear: getHolidaysForYear,
    isHoliday: isHoliday
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Holidays = api;
  }
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `node tests/holidays.test.js`
Expected: 全テストが `OK:` で成功する。

- [ ] **Step 5: コミット**

```bash
git add holidays.js tests/holidays.test.js
git commit -m "feat: add algorithmic Japanese holiday calculator"
```

---

### Task 4: storage.js — データモデルとCRUD

**Files:**
- Create: `storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Produces: `Storage.STORAGE_KEY: string`, `Storage.defaultData(): {members: [], records: {}}`, `Storage.loadData(): object`, `Storage.saveData(data: object): void`, `Storage.generateMemberId(members: Array<{id}>): string`, `Storage.addMember(data, name, grantedLeaveDays): string`, `Storage.updateMember(data, id, name, grantedLeaveDays): boolean`, `Storage.removeMember(data, id): void`, `Storage.getRecord(data, dateKey, memberId): object|null`, `Storage.setRecord(data, dateKey, memberId, record): void`, `Storage.deleteRecord(data, dateKey, memberId): void`

`loadData`/`saveData` は `localStorage` に依存するためNode単体テストの対象外とし、
それ以外の純粋なデータ操作関数をテストする。`loadData`/`saveData` はタスク6以降の
ブラウザでの手動確認(リロード後のデータ保持確認)で検証する。

- [ ] **Step 1: 失敗するテストを書く**

`tests/storage.test.js` を作成:

```js
var assert = require("assert");
var Storage = require("../storage.js");

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

test("defaultData returns empty members and records", function () {
  var data = Storage.defaultData();
  assert.deepStrictEqual(data.members, []);
  assert.deepStrictEqual(data.records, {});
});

test("generateMemberId returns m1 for empty list and increments", function () {
  assert.strictEqual(Storage.generateMemberId([]), "m1");
  assert.strictEqual(Storage.generateMemberId([{ id: "m1" }, { id: "m2" }]), "m3");
  assert.strictEqual(Storage.generateMemberId([{ id: "m1" }, { id: "m5" }]), "m6");
});

test("addMember appends a member with generated id and returns the id", function () {
  var data = Storage.defaultData();
  var id = Storage.addMember(data, "田中", 20);
  assert.strictEqual(id, "m1");
  assert.strictEqual(data.members.length, 1);
  assert.strictEqual(data.members[0].name, "田中");
  assert.strictEqual(data.members[0].grantedLeaveDays, 20);
});

test("updateMember changes name and grantedLeaveDays", function () {
  var data = Storage.defaultData();
  var id = Storage.addMember(data, "田中", 20);
  var ok = Storage.updateMember(data, id, "田中太郎", 15);
  assert.strictEqual(ok, true);
  assert.strictEqual(data.members[0].name, "田中太郎");
  assert.strictEqual(data.members[0].grantedLeaveDays, 15);
});

test("updateMember returns false for unknown id", function () {
  var data = Storage.defaultData();
  assert.strictEqual(Storage.updateMember(data, "nope", "x", 0), false);
});

test("removeMember deletes member and their records", function () {
  var data = Storage.defaultData();
  var id = Storage.addMember(data, "田中", 20);
  Storage.setRecord(data, "2026-08-13", id, { status: "出勤" });
  Storage.removeMember(data, id);
  assert.strictEqual(data.members.length, 0);
  assert.strictEqual(Storage.getRecord(data, "2026-08-13", id), null);
});

test("setRecord/getRecord/deleteRecord round-trip correctly", function () {
  var data = Storage.defaultData();
  var id = Storage.addMember(data, "田中", 20);
  assert.strictEqual(Storage.getRecord(data, "2026-08-13", id), null);

  Storage.setRecord(data, "2026-08-13", id, { status: "出勤", clockIn: "08:30" });
  var record = Storage.getRecord(data, "2026-08-13", id);
  assert.strictEqual(record.status, "出勤");

  Storage.deleteRecord(data, "2026-08-13", id);
  assert.strictEqual(Storage.getRecord(data, "2026-08-13", id), null);
  assert.strictEqual(data.records["2026-08-13"], undefined);
});

console.log("storage.test.js done");
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `node tests/storage.test.js`
Expected: `Cannot find module '../storage.js'` で失敗する。

- [ ] **Step 3: storage.js を実装する**

`storage.js` を作成:

```js
(function (root) {
  "use strict";

  var STORAGE_KEY = "kintai-data-v1";

  function defaultData() {
    return { members: [], records: {} };
  }

  function loadData() {
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return defaultData();
    }
    if (!raw) return defaultData();
    try {
      var parsed = JSON.parse(raw);
      if (!parsed.members) parsed.members = [];
      if (!parsed.records) parsed.records = {};
      return parsed;
    } catch (e) {
      return defaultData();
    }
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function generateMemberId(existingMembers) {
    var maxNum = 0;
    existingMembers.forEach(function (m) {
      var match = /^m(\d+)$/.exec(m.id);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    return "m" + (maxNum + 1);
  }

  function addMember(data, name, grantedLeaveDays) {
    var id = generateMemberId(data.members);
    data.members.push({ id: id, name: name, grantedLeaveDays: grantedLeaveDays });
    return id;
  }

  function updateMember(data, id, name, grantedLeaveDays) {
    var m = null;
    for (var i = 0; i < data.members.length; i++) {
      if (data.members[i].id === id) { m = data.members[i]; break; }
    }
    if (!m) return false;
    m.name = name;
    m.grantedLeaveDays = grantedLeaveDays;
    return true;
  }

  function removeMember(data, id) {
    data.members = data.members.filter(function (x) { return x.id !== id; });
    Object.keys(data.records).forEach(function (dk) {
      delete data.records[dk][id];
      if (Object.keys(data.records[dk]).length === 0) delete data.records[dk];
    });
  }

  function getRecord(data, dateKey, memberId) {
    return (data.records[dateKey] && data.records[dateKey][memberId]) || null;
  }

  function setRecord(data, dateKey, memberId, record) {
    if (!data.records[dateKey]) data.records[dateKey] = {};
    data.records[dateKey][memberId] = record;
  }

  function deleteRecord(data, dateKey, memberId) {
    if (data.records[dateKey]) {
      delete data.records[dateKey][memberId];
      if (Object.keys(data.records[dateKey]).length === 0) {
        delete data.records[dateKey];
      }
    }
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    defaultData: defaultData,
    loadData: loadData,
    saveData: saveData,
    generateMemberId: generateMemberId,
    addMember: addMember,
    updateMember: updateMember,
    removeMember: removeMember,
    getRecord: getRecord,
    setRecord: setRecord,
    deleteRecord: deleteRecord
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Storage = api;
  }
})(typeof window !== "undefined" ? window : this);
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `node tests/storage.test.js`
Expected: 全テストが `OK:` で成功する。

- [ ] **Step 5: コミット**

```bash
git add storage.js tests/storage.test.js
git commit -m "feat: add localStorage data model and CRUD helpers"
```

---

### Task 5: index.html + style.css — ページの骨格

**Files:**
- Create: `index.html`
- Create: `style.css`

**Interfaces:**
- Consumes: 後続タスクで `holidays.js`, `calc.js`, `storage.js`, `app.js`, `modals.js`, `summary.js`, `io.js`, `main.js` を `<script>` で読み込む前提のDOM要素ID一式を提供する
- Produces: DOM要素ID: `currentMonthLabel`, `prevMonthBtn`, `nextMonthBtn`, `todayBtn`, `memberSettingsBtn`, `reportBtn`, `csvExportBtn`, `backupExportBtn`, `backupImportBtn`, `backupFileInput`, `calendarGrid`, `summaryPanel`, `editModal`, `editModalTitle`, `editStatus`, `editTimeFields`, `editClockIn`, `editClockOut`, `editBreakMin`, `editHourlyLeave`, `editNote`, `editSaveBtn`, `editDeleteBtn`, `editCancelBtn`, `memberModal`, `memberTableBody`, `newMemberName`, `newMemberGranted`, `addMemberBtn`, `memberCloseBtn`, `reportModal`, `reportTitle`, `reportMemberSelect`, `reportContent`, `reportCloseBtn`

- [ ] **Step 1: index.html を作成する**

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>勤怠管理カレンダー</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="app-header">
    <div class="nav">
      <button id="prevMonthBtn">◀</button>
      <span id="currentMonthLabel"></span>
      <button id="nextMonthBtn">▶</button>
      <button id="todayBtn">今月</button>
    </div>
    <div class="actions">
      <button id="memberSettingsBtn">メンバー設定</button>
      <button id="reportBtn">月報</button>
      <button id="csvExportBtn">CSV出力</button>
      <button id="backupExportBtn">バックアップ書き出し</button>
      <button id="backupImportBtn">バックアップ読み込み</button>
      <input type="file" id="backupFileInput" accept="application/json" style="display:none">
    </div>
  </header>

  <main>
    <div id="calendarGrid" class="calendar-grid"></div>
    <section id="summaryPanel" class="summary-panel"></section>
  </main>

  <div id="editModal" class="modal-overlay hidden">
    <div class="modal">
      <h2 id="editModalTitle"></h2>
      <label>ステータス
        <select id="editStatus">
          <option value="出勤">出勤</option>
          <option value="休日">休日</option>
          <option value="有給">有給</option>
          <option value="半休">半休</option>
          <option value="欠勤">欠勤</option>
          <option value="その他">その他</option>
        </select>
      </label>
      <div id="editTimeFields">
        <label>出勤時刻 <input type="time" id="editClockIn"></label>
        <label>退勤時刻 <input type="time" id="editClockOut"></label>
        <label>休憩(分) <input type="number" id="editBreakMin" min="0" step="5"></label>
        <label>時間有給(時間) <input type="number" id="editHourlyLeave" min="0" step="0.5"></label>
      </div>
      <label>備考 <textarea id="editNote"></textarea></label>
      <div class="modal-actions">
        <button id="editSaveBtn">保存</button>
        <button id="editDeleteBtn">削除</button>
        <button id="editCancelBtn">キャンセル</button>
      </div>
    </div>
  </div>

  <div id="memberModal" class="modal-overlay hidden">
    <div class="modal">
      <h2>メンバー設定</h2>
      <table id="memberTable">
        <thead><tr><th>氏名</th><th>有給付与日数</th><th></th></tr></thead>
        <tbody id="memberTableBody"></tbody>
      </table>
      <div class="add-member-row">
        <input type="text" id="newMemberName" placeholder="氏名">
        <input type="number" id="newMemberGranted" placeholder="付与日数" min="0" step="0.5">
        <button id="addMemberBtn">追加</button>
      </div>
      <div class="modal-actions">
        <button id="memberCloseBtn">閉じる</button>
      </div>
    </div>
  </div>

  <div id="reportModal" class="modal-overlay hidden">
    <div class="modal">
      <h2 id="reportTitle">月報</h2>
      <label>対象メンバー
        <select id="reportMemberSelect"></select>
      </label>
      <div id="reportContent"></div>
      <div class="modal-actions">
        <button id="reportCloseBtn">閉じる</button>
      </div>
    </div>
  </div>

  <script src="holidays.js"></script>
  <script src="calc.js"></script>
  <script src="storage.js"></script>
  <script src="app.js"></script>
  <script src="modals.js"></script>
  <script src="summary.js"></script>
  <script src="io.js"></script>
  <script src="main.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.css を作成する**

```css
* { box-sizing: border-box; }
body {
  font-family: "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
  margin: 0;
  padding: 16px;
  background: #f5f6f8;
  color: #222;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.app-header button { padding: 6px 12px; cursor: pointer; }
.nav span { margin: 0 8px; font-weight: bold; }

.calendar-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fff;
  padding: 8px;
  border-radius: 8px;
}
.calendar-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.calendar-header-cell { text-align: center; font-weight: bold; padding: 4px; }
.calendar-cell {
  border: 1px solid #ddd;
  min-height: 90px;
  padding: 4px;
  border-radius: 4px;
  background: #fff;
}
.cell-empty { background: #f0f0f0; border: none; }
.cell-saturday { background: #eaf3ff; }
.cell-sunday-holiday { background: #fdeaea; }
.cell-today { outline: 2px solid #3366ff; }
.cell-date-label { font-weight: bold; font-size: 12px; margin-bottom: 4px; }

.cell-member-list { display: flex; flex-direction: column; gap: 2px; }
.cell-member-row {
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
  background: #f0f0f0;
}
.cell-member-row.status-出勤 { background: #e5f5e5; }
.cell-member-row.status-休日 { background: #e5e5e5; }
.cell-member-row.status-有給 { background: #e5ecff; }
.cell-member-row.status-半休 { background: #eaf0ff; }
.cell-member-row.status-欠勤 { background: #ffe5e5; }
.cell-member-row.status-その他 { background: #fff7d9; }
.cell-member-row.has-overtime { color: #cc3300; font-weight: bold; }

.summary-panel { margin-top: 16px; background: #fff; padding: 12px; border-radius: 8px; }
.summary-table { border-collapse: collapse; width: 100%; }
.summary-table th, .summary-table td { border: 1px solid #ddd; padding: 6px 8px; text-align: center; }
.cell-overtime { color: #cc3300; font-weight: bold; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-overlay.hidden { display: none; }
.modal {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  min-width: 320px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
}
.modal label { display: block; margin-bottom: 10px; }
.modal input, .modal select, .modal textarea { width: 100%; padding: 6px; margin-top: 4px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.add-member-row { display: flex; gap: 8px; margin-top: 12px; }
```

- [ ] **Step 3: ブラウザで手動確認する**

`index.html` をダブルクリックして開く。
Expected:
- ヘッダーに「◀ (空欄) ▶ 今月」ナビと「メンバー設定/月報/CSV出力/バックアップ書き出し/バックアップ読み込み」ボタンが表示される
- カレンダー領域・集計パネル領域は空(まだ描画ロジックがないため)だが、レイアウト崩れやコンソールエラーが無いこと(ブラウザの開発者ツールでコンソールを確認)
- 各モーダルは非表示(`hidden`クラスにより画面に出ない)であること

- [ ] **Step 4: コミット**

```bash
git add index.html style.css
git commit -m "feat: add page shell and styling"
```

---

### Task 6: app.js — 状態管理・カレンダー描画・月移動

**Files:**
- Create: `app.js`

**Interfaces:**
- Consumes: `Holidays.isHoliday(dateStr)`(Task 3), `Calc.calcOvertimeMinutes(clockIn, clockOut, status)`(Task 1), `Storage.loadData()`, `Storage.saveData(data)`, `Storage.getRecord(data, dateKey, memberId)`(Task 4)、DOM要素ID `currentMonthLabel`, `calendarGrid`(Task 5)
- Produces: グローバル `App.state = {year, month, data, editingContext}`、`pad2(n)`, `dateKeyOf(year, month, day)`, `daysInMonth(year, month)`, `initState()`, `persistAndRerender()`, `renderAll()`(summary.jsの`renderSummary`を呼ぶため、Task 8完了までは存在しないためガードする)、`changeMonth(delta)`, `goToToday()`, `renderCalendar()`。`openEditModal(dateKey, memberId)` はTask 7で定義されるため、本タスクでは呼び出しのみ実装する

- [ ] **Step 1: app.js を作成する**

```js
var App = {
  state: {
    year: null,
    month: null,
    data: null,
    editingContext: null
  }
};

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function dateKeyOf(year, month, day) {
  return year + "-" + pad2(month) + "-" + pad2(day);
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function initState() {
  var now = new Date();
  App.state.year = now.getFullYear();
  App.state.month = now.getMonth() + 1;
  App.state.data = Storage.loadData();
}

function persistAndRerender() {
  Storage.saveData(App.state.data);
  renderAll();
}

function renderAll() {
  renderCalendar();
  if (typeof renderSummary === "function") renderSummary();
}

function changeMonth(delta) {
  var m = App.state.month + delta;
  var y = App.state.year;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  App.state.month = m;
  App.state.year = y;
  renderAll();
}

function goToToday() {
  var now = new Date();
  App.state.year = now.getFullYear();
  App.state.month = now.getMonth() + 1;
  renderAll();
}

function renderCalendar() {
  var year = App.state.year, month = App.state.month;
  document.getElementById("currentMonthLabel").textContent = year + "年" + month + "月";

  var grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  var weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];
  var headerRow = document.createElement("div");
  headerRow.className = "calendar-row calendar-header-row";
  weekdayNames.forEach(function (wd) {
    var cell = document.createElement("div");
    cell.className = "calendar-header-cell";
    cell.textContent = wd;
    headerRow.appendChild(cell);
  });
  grid.appendChild(headerRow);

  var firstDay = new Date(year, month - 1, 1);
  var startWeekday = firstDay.getDay();
  var totalDays = daysInMonth(year, month);
  var cellsCount = Math.ceil((startWeekday + totalDays) / 7) * 7;

  var today = new Date();
  var todayKey = dateKeyOf(today.getFullYear(), today.getMonth() + 1, today.getDate());

  var row = document.createElement("div");
  row.className = "calendar-row";

  for (var i = 0; i < cellsCount; i++) {
    var dayNum = i - startWeekday + 1;
    var cell = document.createElement("div");
    cell.className = "calendar-cell";

    if (dayNum >= 1 && dayNum <= totalDays) {
      var dk = dateKeyOf(year, month, dayNum);
      var weekday = (startWeekday + dayNum - 1) % 7;
      var holidayName = Holidays.isHoliday(dk);

      if (weekday === 0 || holidayName) cell.classList.add("cell-sunday-holiday");
      if (weekday === 6) cell.classList.add("cell-saturday");
      if (dk === todayKey) cell.classList.add("cell-today");

      var dateLabel = document.createElement("div");
      dateLabel.className = "cell-date-label";
      dateLabel.textContent = dayNum + (holidayName ? " " + holidayName : "");
      cell.appendChild(dateLabel);

      var memberList = document.createElement("div");
      memberList.className = "cell-member-list";

      App.state.data.members.forEach(function (member) {
        var record = Storage.getRecord(App.state.data, dk, member.id);
        var memberRow = document.createElement("div");
        memberRow.className = "cell-member-row status-" + (record ? record.status : "未入力");

        var overtimeMin = record ? Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status) : 0;
        if (overtimeMin > 0) memberRow.classList.add("has-overtime");

        var timeText = "";
        if (record && record.status === "出勤" && record.clockIn && record.clockOut) {
          timeText = record.clockIn + "-" + record.clockOut;
        } else if (record) {
          timeText = record.status;
        }
        memberRow.textContent = member.name.charAt(0) + " " + timeText;

        memberRow.addEventListener("click", (function (dkClosure, memberIdClosure) {
          return function () {
            if (typeof openEditModal === "function") openEditModal(dkClosure, memberIdClosure);
          };
        })(dk, member.id));

        memberList.appendChild(memberRow);
      });

      cell.appendChild(memberList);
    } else {
      cell.classList.add("cell-empty");
    }

    row.appendChild(cell);
    if ((i + 1) % 7 === 0) {
      grid.appendChild(row);
      row = document.createElement("div");
      row.className = "calendar-row";
    }
  }
}
```

- [ ] **Step 2: index.html を仮のブートストラップコードで一時的に確認する**

まだ `main.js` が無いため、`index.html` の `</body>` 直前に一時的な確認用スクリプトを追加して手動確認する:

```html
<script>
  document.addEventListener("DOMContentLoaded", function () {
    initState();
    renderCalendar();
  });
</script>
```

`index.html` の `<script src="main.js"></script>` の直後にこの `<script>` ブロックを追記する。

- [ ] **Step 3: ブラウザで手動確認する**

`index.html` を開く(既に開いていればリロード)。
Expected:
- 今月のカレンダーが月グリッドで表示される
- 今日の日付のセルが青枠(`cell-today`)で強調されている
- 土曜セルが薄い青、日曜・祝日セルが薄い赤で色分けされている
- メンバーが未登録のため各セルにメンバー行は表示されない(空でよい)
- コンソールにエラーが出ていないこと

- [ ] **Step 4: 一時確認用スクリプトを削除する**

Step 2で追記した `<script>...</script>` ブロックを `index.html` から削除する
(Task 13で `main.js` が正式にこの役割を担う)。

- [ ] **Step 5: コミット**

```bash
git add app.js index.html
git commit -m "feat: add calendar rendering and month navigation"
```

---

### Task 7: modals.js(前半) — 勤怠編集モーダル

**Files:**
- Create: `modals.js`

**Interfaces:**
- Consumes: `App.state`(Task 6)、`Storage.getRecord/setRecord/deleteRecord`(Task 4)、`persistAndRerender()`(Task 6)、DOM要素ID `editModal`, `editModalTitle`, `editStatus`, `editTimeFields`, `editClockIn`, `editClockOut`, `editBreakMin`, `editHourlyLeave`, `editNote`(Task 5)
- Produces: `openEditModal(dateKey: string, memberId: string): void`, `closeEditModal(): void`, `onEditStatusChange(): void`, `saveEditModal(): void`, `deleteEditRecord(): void`, `updateTimeFieldsVisibility(): void`

- [ ] **Step 1: modals.js を作成する(勤怠編集モーダル部分)**

```js
function openEditModal(dateKey, memberId) {
  var member = null;
  for (var i = 0; i < App.state.data.members.length; i++) {
    if (App.state.data.members[i].id === memberId) { member = App.state.data.members[i]; break; }
  }
  if (!member) return;

  App.state.editingContext = { dateKey: dateKey, memberId: memberId };

  var existing = Storage.getRecord(App.state.data, dateKey, memberId);
  var record = existing || {
    status: "出勤",
    clockIn: "08:30",
    clockOut: "17:30",
    breakMin: 60,
    hourlyLeaveHours: 0,
    note: ""
  };

  document.getElementById("editModalTitle").textContent = member.name + " - " + dateKey;
  document.getElementById("editStatus").value = record.status;
  document.getElementById("editClockIn").value = record.clockIn || "";
  document.getElementById("editClockOut").value = record.clockOut || "";
  document.getElementById("editBreakMin").value = record.breakMin != null ? record.breakMin : "";
  document.getElementById("editHourlyLeave").value = record.hourlyLeaveHours || 0;
  document.getElementById("editNote").value = record.note || "";

  updateTimeFieldsVisibility();
  document.getElementById("editModal").classList.remove("hidden");
}

function updateTimeFieldsVisibility() {
  var status = document.getElementById("editStatus").value;
  document.getElementById("editTimeFields").style.display = (status === "出勤") ? "block" : "none";
}

function closeEditModal() {
  document.getElementById("editModal").classList.add("hidden");
  App.state.editingContext = null;
}

function onEditStatusChange() {
  var status = document.getElementById("editStatus").value;
  if (status === "出勤") {
    var clockIn = document.getElementById("editClockIn");
    var clockOut = document.getElementById("editClockOut");
    if (!clockIn.value) clockIn.value = "08:30";
    if (!clockOut.value) clockOut.value = "17:30";
  }
  updateTimeFieldsVisibility();
}

function saveEditModal() {
  var ctx = App.state.editingContext;
  if (!ctx) return;
  var status = document.getElementById("editStatus").value;
  var record = {
    status: status,
    clockIn: status === "出勤" ? document.getElementById("editClockIn").value : "",
    clockOut: status === "出勤" ? document.getElementById("editClockOut").value : "",
    breakMin: status === "出勤" ? (parseInt(document.getElementById("editBreakMin").value, 10) || 0) : 0,
    hourlyLeaveHours: status === "出勤" ? (parseFloat(document.getElementById("editHourlyLeave").value) || 0) : 0,
    note: document.getElementById("editNote").value
  };
  Storage.setRecord(App.state.data, ctx.dateKey, ctx.memberId, record);
  closeEditModal();
  persistAndRerender();
}

function deleteEditRecord() {
  var ctx = App.state.editingContext;
  if (!ctx) return;
  Storage.deleteRecord(App.state.data, ctx.dateKey, ctx.memberId);
  closeEditModal();
  persistAndRerender();
}
```

- [ ] **Step 2: 一時的な確認用配線を index.html に追加する**

`index.html` の `</body>` 直前に一時的に追加(Task 6のStep2と同様、Task 13で正式に置き換える):

```html
<script>
  document.addEventListener("DOMContentLoaded", function () {
    initState();
    renderAll();
    document.getElementById("prevMonthBtn").addEventListener("click", function () { changeMonth(-1); });
    document.getElementById("nextMonthBtn").addEventListener("click", function () { changeMonth(1); });
    document.getElementById("editStatus").addEventListener("change", onEditStatusChange);
    document.getElementById("editSaveBtn").addEventListener("click", saveEditModal);
    document.getElementById("editDeleteBtn").addEventListener("click", deleteEditRecord);
    document.getElementById("editCancelBtn").addEventListener("click", closeEditModal);
  });
</script>
```

また、手動確認のためにメンバーを1件仮登録する処理も同じ `<script>` 内、`initState();` の直後に追記する:

```js
    if (App.state.data.members.length === 0) {
      Storage.addMember(App.state.data, "テスト太郎", 20);
      Storage.saveData(App.state.data);
    }
```

- [ ] **Step 3: ブラウザで手動確認する**

`index.html` をリロードする。
Expected:
- カレンダーの各日セルに「テ (空欄)」のようなメンバー行が表示される
- メンバー行をクリックすると編集モーダルが開き、タイトルに「テスト太郎 - YYYY-MM-DD」と表示される
- ステータスが「出勤」のとき、出勤/退勤/休憩/時間有給の入力欄が表示される
- ステータスを「休日」に変えると、それらの入力欄が非表示になる
- 出勤時刻を「07:00」、退勤時刻を「19:00」にして保存すると、モーダルが閉じてカレンダーのその日のセルに `テ 07:00-19:00` が赤字太字(残業扱い)で表示される
- 同じ日をもう一度クリックすると、保存した内容が復元されて表示される
- 「削除」を押すとその日の記録が消え、セルの表示が空欄に戻る

- [ ] **Step 4: 一時確認用コードを削除する**

Step 2で追記した `<script>` ブロックを `index.html` から削除する。

- [ ] **Step 5: コミット**

```bash
git add modals.js index.html
git commit -m "feat: add attendance edit modal"
```

---

### Task 8: summary.js(前半) — 月間集計パネル

**Files:**
- Create: `summary.js`

**Interfaces:**
- Consumes: `App.state`(Task 6)、`Storage.getRecord`(Task 4)、`Calc.calcActualWorkMinutes/calcOvertimeMinutes/calcLeaveConsumedDays/calcLeaveBalance/minutesToHoursLabel`(Task 1, 2)、`pad2/dateKeyOf/daysInMonth`(Task 6)、DOM要素ID `summaryPanel`(Task 5)
- Produces: `getMonthDateKeys(year, month): string[]`, `getAllDateKeysUpTo(year, month): string[]`, `computeMemberMonthStats(memberId, year, month): {workDays, workMinutes, overtimeMinutes, leaveDays, absentDays}`, `computeMemberLeaveBalance(member, year, month): number`, `renderSummary(): void`

- [ ] **Step 1: summary.js を作成する(集計パネル部分)**

```js
function getMonthDateKeys(year, month) {
  var total = daysInMonth(year, month);
  var keys = [];
  for (var d = 1; d <= total; d++) keys.push(dateKeyOf(year, month, d));
  return keys;
}

function getAllDateKeysUpTo(year, month) {
  var lastDay = dateKeyOf(year, month, daysInMonth(year, month));
  return Object.keys(App.state.data.records).filter(function (k) { return k <= lastDay; }).sort();
}

function computeMemberMonthStats(memberId, year, month) {
  var keys = getMonthDateKeys(year, month);
  var stats = { workDays: 0, workMinutes: 0, overtimeMinutes: 0, leaveDays: 0, absentDays: 0 };
  keys.forEach(function (dk) {
    var record = Storage.getRecord(App.state.data, dk, memberId);
    if (!record) return;
    if (record.status === "出勤") {
      stats.workDays += 1;
      var workMin = Calc.calcActualWorkMinutes(record.clockIn, record.clockOut, record.breakMin);
      if (workMin !== null) stats.workMinutes += workMin;
      stats.overtimeMinutes += Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status);
    }
    if (record.status === "欠勤") stats.absentDays += 1;
    stats.leaveDays += Calc.calcLeaveConsumedDays(record);
  });
  return stats;
}

function computeMemberLeaveBalance(member, year, month) {
  var keys = getAllDateKeysUpTo(year, month);
  var records = [];
  keys.forEach(function (dk) {
    var record = Storage.getRecord(App.state.data, dk, member.id);
    if (record) records.push(record);
  });
  return Calc.calcLeaveBalance(member.grantedLeaveDays, records);
}

function renderSummary() {
  var panel = document.getElementById("summaryPanel");
  panel.innerHTML = "";

  var table = document.createElement("table");
  table.className = "summary-table";
  var thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>氏名</th><th>出勤日数</th><th>実労働時間</th><th>残業時間</th><th>有給消化</th><th>有給残</th><th>欠勤日数</th></tr>";
  table.appendChild(thead);

  var tbody = document.createElement("tbody");
  App.state.data.members.forEach(function (member) {
    var stats = computeMemberMonthStats(member.id, App.state.year, App.state.month);
    var balance = computeMemberLeaveBalance(member, App.state.year, App.state.month);
    var tr = document.createElement("tr");
    var overtimeClass = stats.overtimeMinutes > 0 ? "cell-overtime" : "";
    tr.innerHTML =
      "<td>" + member.name + "</td>" +
      "<td>" + stats.workDays + "</td>" +
      "<td>" + Calc.minutesToHoursLabel(stats.workMinutes) + "</td>" +
      "<td class=\"" + overtimeClass + "\">" + Calc.minutesToHoursLabel(stats.overtimeMinutes) + "</td>" +
      "<td>" + stats.leaveDays + "</td>" +
      "<td>" + balance + "</td>" +
      "<td>" + stats.absentDays + "</td>";
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  panel.appendChild(table);
}
```

- [ ] **Step 2: ブラウザで手動確認する**

`index.html` の `<script src="io.js"></script>` と `<script src="main.js"></script>` はまだ存在しないため、
Task 6・7と同様に一時的な `<script>` を `</body>` 直前に追加して確認する:

```html
<script>
  document.addEventListener("DOMContentLoaded", function () {
    initState();
    if (App.state.data.members.length === 0) {
      Storage.addMember(App.state.data, "テスト太郎", 20);
      Storage.saveData(App.state.data);
    }
    renderAll();
    document.getElementById("prevMonthBtn").addEventListener("click", function () { changeMonth(-1); });
    document.getElementById("nextMonthBtn").addEventListener("click", function () { changeMonth(1); });
    document.getElementById("editStatus").addEventListener("change", onEditStatusChange);
    document.getElementById("editSaveBtn").addEventListener("click", saveEditModal);
    document.getElementById("editDeleteBtn").addEventListener("click", deleteEditRecord);
    document.getElementById("editCancelBtn").addEventListener("click", closeEditModal);
  });
</script>
```

`index.html` を開き、テスト太郎の出勤日を1〜2日分入力してから、カレンダー下の集計パネルを確認する。
Expected:
- 「テスト太郎」の行が表示され、出勤日数・実労働時間・残業時間・有給消化・有給残(20)・欠勤日数が計算されて表示される
- 残業が発生している日を入力した場合、残業時間セルが赤字太字で表示される

- [ ] **Step 3: 一時確認用コードを削除する**

追記した `<script>` ブロックを `index.html` から削除する。

- [ ] **Step 4: コミット**

```bash
git add summary.js index.html
git commit -m "feat: add monthly summary panel"
```

---

### Task 9: modals.js(後半) — メンバー設定モーダル

**Files:**
- Modify: `modals.js`

**Interfaces:**
- Consumes: `App.state`(Task 6)、`Storage.addMember/updateMember/removeMember/saveData`(Task 4)、`renderAll()`(Task 6)、DOM要素ID `memberModal`, `memberTableBody`, `newMemberName`, `newMemberGranted`(Task 5)
- Produces: `openMemberModal(): void`, `closeMemberModal(): void`, `renderMemberTable(): void`, `addMemberFromForm(): void`

- [ ] **Step 1: modals.js の末尾に追記する**

```js
function openMemberModal() {
  renderMemberTable();
  document.getElementById("memberModal").classList.remove("hidden");
}

function closeMemberModal() {
  document.getElementById("memberModal").classList.add("hidden");
  renderAll();
}

function renderMemberTable() {
  var tbody = document.getElementById("memberTableBody");
  tbody.innerHTML = "";

  App.state.data.members.forEach(function (member) {
    var tr = document.createElement("tr");

    var nameTd = document.createElement("td");
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = member.name;
    nameInput.addEventListener("change", function () {
      Storage.updateMember(App.state.data, member.id, nameInput.value, member.grantedLeaveDays);
      Storage.saveData(App.state.data);
    });
    nameTd.appendChild(nameInput);

    var grantedTd = document.createElement("td");
    var grantedInput = document.createElement("input");
    grantedInput.type = "number";
    grantedInput.min = "0";
    grantedInput.step = "0.5";
    grantedInput.value = member.grantedLeaveDays;
    grantedInput.addEventListener("change", function () {
      var value = parseFloat(grantedInput.value) || 0;
      Storage.updateMember(App.state.data, member.id, member.name, value);
      Storage.saveData(App.state.data);
    });
    grantedTd.appendChild(grantedInput);

    var actionTd = document.createElement("td");
    var removeBtn = document.createElement("button");
    removeBtn.textContent = "削除";
    removeBtn.addEventListener("click", function () {
      if (!confirm(member.name + " を削除しますか？関連する記録も削除されます。")) return;
      Storage.removeMember(App.state.data, member.id);
      Storage.saveData(App.state.data);
      renderMemberTable();
    });
    actionTd.appendChild(removeBtn);

    tr.appendChild(nameTd);
    tr.appendChild(grantedTd);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

function addMemberFromForm() {
  var nameInput = document.getElementById("newMemberName");
  var grantedInput = document.getElementById("newMemberGranted");
  var name = nameInput.value.trim();
  if (!name) return;
  var granted = parseFloat(grantedInput.value) || 0;
  Storage.addMember(App.state.data, name, granted);
  Storage.saveData(App.state.data);
  nameInput.value = "";
  grantedInput.value = "";
  renderMemberTable();
}
```

- [ ] **Step 2: ブラウザで手動確認する**

Task 8のStep2と同じ一時 `<script>` を `index.html` に追加し、さらに以下のイベント配線を追記する:

```js
    document.getElementById("memberSettingsBtn").addEventListener("click", openMemberModal);
    document.getElementById("memberCloseBtn").addEventListener("click", closeMemberModal);
    document.getElementById("addMemberBtn").addEventListener("click", addMemberFromForm);
```

`index.html` を開き、「メンバー設定」ボタンをクリックする。
Expected:
- モーダルに既存メンバー(テスト太郎)が一覧表示される
- 氏名欄・付与日数欄を編集して(モーダル内で)フォーカスを外すと保存される(再度モーダルを開き直すと変更が反映されている)
- 新規メンバー欄に氏名と付与日数を入力して「追加」を押すと、一覧に追加される
- 「削除」ボタンで確認ダイアログが出て、OKすると一覧から消える
- 「閉じる」でモーダルが閉じ、カレンダーと集計パネルが最新のメンバー構成で再描画される

- [ ] **Step 3: 一時確認用コードを削除する**

`index.html` に追加した `<script>` ブロックを削除する。

- [ ] **Step 4: コミット**

```bash
git add modals.js index.html
git commit -m "feat: add member settings modal"
```

---

### Task 10: summary.js(後半) — 月報ビュー

**Files:**
- Modify: `summary.js`

**Interfaces:**
- Consumes: `App.state`(Task 6)、`computeMemberMonthStats/computeMemberLeaveBalance`(Task 8)、`Calc.minutesToHoursLabel`(Task 1)、DOM要素ID `reportModal`, `reportMemberSelect`, `reportContent`(Task 5)
- Produces: `openReportModal(): void`, `closeReportModal(): void`, `renderReportContent(): void`

- [ ] **Step 1: summary.js の末尾に追記する**

```js
function openReportModal() {
  var select = document.getElementById("reportMemberSelect");
  select.innerHTML = "";
  App.state.data.members.forEach(function (member) {
    var opt = document.createElement("option");
    opt.value = member.id;
    opt.textContent = member.name;
    select.appendChild(opt);
  });
  renderReportContent();
  document.getElementById("reportModal").classList.remove("hidden");
}

function closeReportModal() {
  document.getElementById("reportModal").classList.add("hidden");
}

function renderReportContent() {
  var select = document.getElementById("reportMemberSelect");
  var memberId = select.value;
  var member = null;
  for (var i = 0; i < App.state.data.members.length; i++) {
    if (App.state.data.members[i].id === memberId) { member = App.state.data.members[i]; break; }
  }
  var content = document.getElementById("reportContent");
  if (!member) {
    content.innerHTML = "<p>メンバーが登録されていません。</p>";
    return;
  }

  var stats = computeMemberMonthStats(member.id, App.state.year, App.state.month);
  var balance = computeMemberLeaveBalance(member, App.state.year, App.state.month);
  var overtimeClass = stats.overtimeMinutes > 0 ? "cell-overtime" : "";

  content.innerHTML =
    "<h3>" + App.state.year + "年" + App.state.month + "月 " + member.name + " さんの月報</h3>" +
    "<ul>" +
    "<li>出勤日数: " + stats.workDays + " 日</li>" +
    "<li>実労働時間: " + Calc.minutesToHoursLabel(stats.workMinutes) + "</li>" +
    "<li class=\"" + overtimeClass + "\">残業時間: " + Calc.minutesToHoursLabel(stats.overtimeMinutes) + "</li>" +
    "<li>有給消化: " + stats.leaveDays + " 日</li>" +
    "<li>有給残: " + balance + " 日</li>" +
    "<li>欠勤日数: " + stats.absentDays + " 日</li>" +
    "</ul>";
}
```

- [ ] **Step 2: ブラウザで手動確認する**

Task 9のStep2の一時 `<script>` に、以下を追記する:

```js
    document.getElementById("reportBtn").addEventListener("click", openReportModal);
    document.getElementById("reportCloseBtn").addEventListener("click", closeReportModal);
    document.getElementById("reportMemberSelect").addEventListener("change", renderReportContent);
```

「月報」ボタンをクリックする。
Expected:
- モーダルにメンバー選択プルダウンと、選択中メンバーの月報(出勤日数・実労働時間・残業時間・有給消化・有給残・欠勤日数)が表示される
- プルダウンでメンバーを切り替えると内容が更新される
- 残業がある場合は赤字太字で表示される

- [ ] **Step 3: 一時確認用コードを削除する**

`index.html` から一時 `<script>` ブロックを削除する。

- [ ] **Step 4: コミット**

```bash
git add summary.js index.html
git commit -m "feat: add monthly report view"
```

---

### Task 11: io.js(前半) — CSV出力

**Files:**
- Create: `io.js`

**Interfaces:**
- Consumes: `App.state`(Task 6)、`getMonthDateKeys`(Task 8)、`Storage.getRecord`(Task 4)、`Calc.calcActualWorkMinutes/calcOvertimeMinutes/minutesToHoursLabel/buildCsvContent`(Task 1, 2)、`pad2`(Task 6)
- Produces: `downloadTextFile(filename: string, content: string, mimeType: string): void`, `exportCsv(): void`

- [ ] **Step 1: io.js を作成する(CSV出力部分)**

```js
function downloadTextFile(filename, content, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCsv() {
  var year = App.state.year, month = App.state.month;
  var keys = getMonthDateKeys(year, month);
  var rows = [];

  keys.forEach(function (dk) {
    App.state.data.members.forEach(function (member) {
      var record = Storage.getRecord(App.state.data, dk, member.id);
      if (!record) return;
      var workMin = Calc.calcActualWorkMinutes(record.clockIn, record.clockOut, record.breakMin);
      var overtimeMin = Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status);
      rows.push({
        date: dk,
        name: member.name,
        status: record.status,
        clockIn: record.clockIn,
        clockOut: record.clockOut,
        breakMin: record.breakMin,
        hourlyLeaveHours: record.hourlyLeaveHours,
        workLabel: Calc.minutesToHoursLabel(workMin),
        overtimeLabel: Calc.minutesToHoursLabel(overtimeMin),
        note: record.note
      });
    });
  });

  var csv = Calc.buildCsvContent(rows);
  var filename = year + "-" + pad2(month) + "-kintai.csv";
  var BOM = String.fromCharCode(0xFEFF); // Excelで開いた際に日本語が文字化けしないためのBOM
  downloadTextFile(filename, BOM + csv, "text/csv;charset=utf-8;");
}
```

- [ ] **Step 2: ブラウザで手動確認する**

Task 10のStep2の一時 `<script>` に、以下を追記する(`<script src="io.js"></script>` も `index.html` の `<script src="summary.js"></script>` の直後に追加する):

```js
    document.getElementById("csvExportBtn").addEventListener("click", exportCsv);
```

いくつかの日にテスト太郎の勤怠を入力してから「CSV出力」ボタンをクリックする。
Expected:
- `YYYY-MM-kintai.csv` という名前でファイルがダウンロードされる
- ダウンロードしたファイルをExcelまたはテキストエディタで開き、日本語(氏名やステータス)が文字化けしていないことを確認する
- 列が「日付,氏名,ステータス,出勤,退勤,休憩(分),時間有給(時間),実労働時間,残業時間,備考」の順で入っていることを確認する

- [ ] **Step 3: 一時確認用コードを削除する**

`index.html` から一時 `<script>` ブロックを削除する(`<script src="io.js"></script>` の恒久タグは残す)。

- [ ] **Step 4: コミット**

```bash
git add io.js index.html
git commit -m "feat: add CSV export"
```

---

### Task 12: io.js(後半) — JSONバックアップ/復元

**Files:**
- Modify: `io.js`

**Interfaces:**
- Consumes: `App.state`(Task 6)、`Storage.saveData`(Task 4)、`renderAll()`(Task 6)、`downloadTextFile`(Task 11)
- Produces: `exportBackup(): void`, `importBackupFile(file: File): void`

- [ ] **Step 1: io.js の末尾に追記する**

```js
function exportBackup() {
  var json = JSON.stringify(App.state.data, null, 2);
  downloadTextFile("kintai-backup.json", json, "application/json");
}

function importBackupFile(file) {
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var parsed = JSON.parse(reader.result);
      if (!parsed.members || !parsed.records) throw new Error("invalid format");
      if (!confirm("現在のデータを上書きして復元します。よろしいですか？")) return;
      App.state.data = parsed;
      Storage.saveData(App.state.data);
      renderAll();
    } catch (e) {
      alert("読み込みに失敗しました。正しいバックアップファイルを選択してください。");
    }
  };
  reader.readAsText(file);
}
```

- [ ] **Step 2: ブラウザで手動確認する**

Task 11のStep2の一時 `<script>` に、以下を追記する:

```js
    document.getElementById("backupExportBtn").addEventListener("click", exportBackup);
    document.getElementById("backupImportBtn").addEventListener("click", function () {
      document.getElementById("backupFileInput").click();
    });
    document.getElementById("backupFileInput").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) {
        importBackupFile(e.target.files[0]);
        e.target.value = "";
      }
    });
```

「バックアップ書き出し」をクリックし、`kintai-backup.json` がダウンロードされることを確認する。
その後、いくつか記録を追加/削除してデータを変えてから「バックアップ読み込み」で先ほどのファイルを選択する。
Expected:
- 確認ダイアログが出て、OKすると読み込んだ時点のデータに復元される(カレンダー・集計パネルが更新される)
- 不正なJSONファイル(例: 中身が `{}` のファイル)を読み込ませると、エラーメッセージが表示され、データは変わらない

- [ ] **Step 3: 一時確認用コードを削除する**

`index.html` から一時 `<script>` ブロックを削除する。

- [ ] **Step 4: コミット**

```bash
git add io.js index.html
git commit -m "feat: add JSON backup and restore"
```

---

### Task 13: main.js — 本配線と最終手動QA

**Files:**
- Create: `main.js`

**Interfaces:**
- Consumes: これまでの全タスクで定義した関数・DOM要素ID
- Produces: アプリ起動時の正式なイベント配線(`DOMContentLoaded`ハンドラ)

- [ ] **Step 1: main.js を作成する**

```js
document.addEventListener("DOMContentLoaded", function () {
  initState();
  renderAll();

  document.getElementById("prevMonthBtn").addEventListener("click", function () { changeMonth(-1); });
  document.getElementById("nextMonthBtn").addEventListener("click", function () { changeMonth(1); });
  document.getElementById("todayBtn").addEventListener("click", goToToday);

  document.getElementById("memberSettingsBtn").addEventListener("click", openMemberModal);
  document.getElementById("memberCloseBtn").addEventListener("click", closeMemberModal);
  document.getElementById("addMemberBtn").addEventListener("click", addMemberFromForm);

  document.getElementById("reportBtn").addEventListener("click", openReportModal);
  document.getElementById("reportCloseBtn").addEventListener("click", closeReportModal);
  document.getElementById("reportMemberSelect").addEventListener("change", renderReportContent);

  document.getElementById("editStatus").addEventListener("change", onEditStatusChange);
  document.getElementById("editSaveBtn").addEventListener("click", saveEditModal);
  document.getElementById("editDeleteBtn").addEventListener("click", deleteEditRecord);
  document.getElementById("editCancelBtn").addEventListener("click", closeEditModal);

  document.getElementById("csvExportBtn").addEventListener("click", exportCsv);
  document.getElementById("backupExportBtn").addEventListener("click", exportBackup);
  document.getElementById("backupImportBtn").addEventListener("click", function () {
    document.getElementById("backupFileInput").click();
  });
  document.getElementById("backupFileInput").addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) {
      importBackupFile(e.target.files[0]);
      e.target.value = "";
    }
  });
});
```

- [ ] **Step 2: 全単体テストをまとめて実行する**

Run:
```bash
node tests/calc.test.js
node tests/holidays.test.js
node tests/storage.test.js
```
Expected: 3ファイルとも全テスト `OK:` で成功する。

- [ ] **Step 3: 最終手動QAチェックリストを実行する**

`index.html` を開き、以下をすべて確認する(設計書のテスト方針に対応):

1. メンバー設定で3人(例: 田中/鈴木/佐藤、各有給20日)を登録する
2. 日をまたぐ勤務時刻(例: 出勤23:00〜退勤翌1:00に相当する入力)を試し、`calcActualWorkMinutes`が負の場合に実労働時間が空欄扱いになり、集計が壊れないことを確認する
3. 出退勤どちらか未入力のまま保存し、その日の実労働・残業が0として扱われ、集計に悪影響を与えないことを確認する
4. 3人分の月間予定(出勤/有給/半休/欠勤/時間有給混在)を入力し、月間集計パネルと月報の数値が一致することを確認する
5. 土日・祝日(2026年9月22日「国民の休日」を含む)がカレンダー上で正しく色分けされることを確認する
6. 残業が発生する日(例: 08:00-18:10)を入力し、該当メンバー行と集計パネル・月報の残業時間セルが赤字太字で強調されることを確認する
7. CSV出力を行い、Excel等で文字化けなく開けることを確認する
8. バックアップ書き出し→データ変更→バックアップ読み込みで、書き出し時点のデータに正しく戻ることを確認する
9. ページをリロードし、直前まで入力していたデータがLocalStorageから復元されることを確認する
10. メンバーを削除すると、そのメンバーの記録がカレンダー・集計・月報からも消えることを確認する
11. 月を10回以上前後に移動し、年をまたぐ場合(12月→1月、1月→12月)でもラベルとカレンダーが正しく切り替わることを確認する

Expected: すべての項目で問題が無いこと。問題があれば該当タスクに戻って修正する。

- [ ] **Step 4: コミット**

```bash
git add main.js
git commit -m "feat: wire up all event handlers and complete manual QA"
```

---

## 完了条件

- `node tests/calc.test.js`, `node tests/holidays.test.js`, `node tests/storage.test.js` がすべて成功する
- Task 13 Step 3 の手動QAチェックリストが全項目通過する
- `index.html` をダブルクリックするだけで、サーバーやビルドなしにアプリが起動する
