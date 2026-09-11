# 土日祝は全労働時間を残業扱いにする Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 土日祝(土曜・日曜・祝日)に出勤した場合、標準勤務時間帯(8:30〜17:30)に関わらず実労働時間の全部を残業として計算・表示する。

**Architecture:** `Calc.calcOvertimeMinutes` に `isDayOff` と `breakMin` の2引数を追加し、休日のときだけ「拘束時間(clockOut-clockIn)を基準に、8時間以上ならbreakMinを差し引く」ルールで計算する。既存の全呼び出し箇所(app.js, gantt.js, io.js, summary.js)を更新して、対象日の休日判定を渡すようにする。表示側(app.js, gantt.js)は出勤・退勤時刻の色付けも休日なら両方を残業色にする。

**Tech Stack:** 素のJavaScript(ビルドなし)、Node.js の `assert` を使った手書きテストランナー(`node tests/calc.test.js` で実行)。

## Global Constraints

- 無料維持・依存パッケージなしの3原則を守る(新しいnpmパッケージ等は追加しない)。
- 既存の平日の残業計算式(8:30より前 + 17:30より後、15分単位切り捨て)は変更しない。
- `calcOvertimeMinutes` の新引数(`isDayOff`, `breakMin`)は省略可能にし、既存の呼び出し(引数省略)は平日ルールのまま動くようにする(後方互換)。

---

### Task 1: `calc.js` — 休日の残業計算ルールを追加

**Files:**
- Modify: `calc.js:26-34`(`calcOvertimeMinutes` 関数)
- Test: `tests/calc.test.js:44-55`(既存の `calcOvertimeMinutes` テストブロックの直後に追加)

**Interfaces:**
- Consumes: `Calc.timeToMinutes(hhmm)`(`calc.js:4-8`, 既存)、`Calc.floorTo15(minutes)`(`calc.js:22-24`, 既存)
- Produces: `Calc.calcOvertimeMinutes(clockIn, clockOut, status, isDayOff, breakMin)` — `isDayOff`(boolean, 省略可・既定 falsy)、`breakMin`(number, 省略可・既定 0扱い)を追加。後続タスク(2〜4)がこの新シグネチャを使う。

- [ ] **Step 1: 休日ケースの失敗するテストを書く**

`tests/calc.test.js` の既存の `test("calcOvertimeMinutes returns 0 when status is not 出勤 or times missing", ...)` ブロック(53行目付近)の直後に追記する:

```js
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `node tests/calc.test.js`
Expected: 上記4つの新規テストが `FAIL:` として出力される(`calcOvertimeMinutes` がまだ `isDayOff`/`breakMin` を見ていないため、平日ルールの計算結果になり期待値と不一致になる)。

- [ ] **Step 3: `calcOvertimeMinutes` を休日ルール対応に書き換える**

`calc.js:26-34` を以下に置き換える:

```js
  function calcOvertimeMinutes(clockIn, clockOut, status, isDayOff, breakMin) {
    if (status !== "出勤") return 0;
    if (!clockIn || !clockOut) return 0;
    var inMin = timeToMinutes(clockIn);
    var outMin = timeToMinutes(clockOut);
    if (isDayOff) {
      var span = outMin - inMin;
      if (span < 0) return 0;
      var effectiveBreak = span >= 8 * 60 ? (breakMin || 0) : 0;
      return floorTo15(Math.max(span - effectiveBreak, 0));
    }
    var early = inMin < STANDARD_START_MIN ? STANDARD_START_MIN - inMin : 0;
    var late = outMin > STANDARD_END_MIN ? outMin - STANDARD_END_MIN : 0;
    return floorTo15(early + late);
  }
```

- [ ] **Step 4: テストを実行して全て成功することを確認する**

Run: `node tests/calc.test.js`
Expected: すべての行が `OK:` で始まり、末尾に `calc.test.js done` が出力される(`FAIL:` が無いこと)。

- [ ] **Step 5: コミット**

```bash
git add calc.js tests/calc.test.js
git commit -m "feat: treat all holiday work hours as overtime in calcOvertimeMinutes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `app.js` — 休日判定ヘルパーとカレンダー表示への反映

**Files:**
- Modify: `app.js:19-21`(`daysInMonth` の直後に `isDateOff` ヘルパーを追加)
- Modify: `app.js:229-240`(カレンダー表示のメンバー行レンダリング)

**Interfaces:**
- Consumes: `Calc.calcOvertimeMinutes(clockIn, clockOut, status, isDayOff, breakMin)`(Task 1で追加)、`Holidays.isHoliday(dateKey)`(既存, `holidays.js:111-115`)
- Produces: `isDateOff(dateKey)`(app.js のグローバル関数)— `gantt.js` を除く後続タスク(Task 4)がそのまま呼び出す。`app.js` は `holidays.js`, `calc.js` の後、`gantt.js`/`summary.js`/`io.js` より前に読み込まれるため(`index.html:139-148`)、これらのファイルから `isDateOff` をそのままグローバル参照できる。

- [ ] **Step 1: `isDateOff` ヘルパーを追加する**

`app.js:19-21` の `daysInMonth` 関数の直後に追記する:

```js
function isDateOff(dateKey) {
  var parts = dateKey.split("-").map(Number);
  var weekday = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  return weekday === 0 || weekday === 6 || !!Holidays.isHoliday(dateKey);
}
```

- [ ] **Step 2: カレンダー表示のメンバー行を休日ルール対応に書き換える**

`app.js:229-240` を以下に置き換える(`isDayOff` はこの関数スコープの `renderCalendar` 内、229行目より前の212行目で既に `var isDayOff = weekday === 0 || weekday === 6 || !!holidayName;` として定義済みなのでそのまま使う):

```js
        if (record && record.status === "出勤" && record.clockIn && record.clockOut) {
          // 時間外(8:30より前 / 17:30より後)の側だけを色付けする。土日祝は出退勤の両方を残業色にする。
          var inMin = Calc.timeToMinutes(record.clockIn);
          var outMin = Calc.timeToMinutes(record.clockOut);
          var isEarly = isDayOff || inMin < Calc.STANDARD_START_MIN;
          var isLate = isDayOff || outMin > Calc.STANDARD_END_MIN;

          memberRow.appendChild(makeTimePart(record.clockIn, isEarly));
          memberRow.appendChild(document.createTextNode("-"));
          memberRow.appendChild(makeTimePart(record.clockOut, isLate));

          var overtimeMin = Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status, isDayOff, record.breakMin);
          if (overtimeMin > 0) {
            var overtimeSpan = document.createElement("span");
            overtimeSpan.className = "overtime-badge";
            overtimeSpan.textContent = "+" + Calc.minutesToHoursLabel(overtimeMin);
            memberRow.appendChild(overtimeSpan);
          }
        } else if (record) {
          memberRow.appendChild(document.createTextNode(record.status));
        }
```

- [ ] **Step 3: 回帰テストを実行する(既存テストが壊れていないことを確認)**

Run: `node tests/calc.test.js`
Expected: すべて `OK:`(app.js はブラウザ専用コードのため自動テストは無いが、Task 1のテストが引き続き通ることを確認する)。

- [ ] **Step 4: コミット**

```bash
git add app.js
git commit -m "feat: highlight and count full holiday work hours as overtime in calendar view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `gantt.js` — 一覧(ガンチャート)表示への反映

**Files:**
- Modify: `gantt.js:110-124`(ガンチャートのメンバー×日付セル描画)

**Interfaces:**
- Consumes: `Calc.calcOvertimeMinutes(clockIn, clockOut, status, isDayOff, breakMin)`(Task 1)。`weekday2`(`gantt.js:99`)と `holidayName2`(`gantt.js:100`)は既にこのループ内で計算済み。

- [ ] **Step 1: ガンチャートセルの残業計算・色付けを休日ルール対応に書き換える**

`gantt.js:110-124` を以下に置き換える:

```js
      if (record && record.status === "出勤" && record.clockIn && record.clockOut) {
        var isDayOff2 = weekday2 === 0 || weekday2 === 6 || !!holidayName2;
        var overtimeMin = Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status, isDayOff2, record.breakMin);
        if (overtimeMin > 0) td.classList.add("gantt-overtime");

        // 時間外(8:30より前 / 17:30より後)の側だけを色付けする(カレンダー表示と同じ挙動)。土日祝は両方とも色付けする。
        var inMin = Calc.timeToMinutes(record.clockIn);
        var outMin = Calc.timeToMinutes(record.clockOut);
        var isEarly = isDayOff2 || inMin < Calc.STANDARD_START_MIN;
        var isLate = isDayOff2 || outMin > Calc.STANDARD_END_MIN;

        var inDiv = document.createElement("div");
        if (isEarly) inDiv.className = "gantt-time-overtime";
        inDiv.textContent = record.clockIn;
        td.appendChild(inDiv);
        var outDiv = document.createElement("div");
        if (isLate) outDiv.className = "gantt-time-overtime";
        outDiv.textContent = record.clockOut;
        td.appendChild(outDiv);

        if (overtimeMin > 0) {
          var otDiv = document.createElement("div");
          otDiv.className = "gantt-overtime-badge";
          otDiv.textContent = "+" + Calc.minutesToHoursLabel(overtimeMin);
          td.appendChild(otDiv);
        }
```

- [ ] **Step 2: 回帰テストを実行する**

Run: `node tests/calc.test.js`
Expected: すべて `OK:`。

- [ ] **Step 3: コミット**

```bash
git add gantt.js
git commit -m "feat: highlight and count full holiday work hours as overtime in gantt view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `io.js` と `summary.js` — CSVエクスポートと月次集計への反映

**Files:**
- Modify: `io.js:22-23`(`exportCsv` 内の残業計算)
- Modify: `summary.js:32-34`(`computeMemberMonthStats` 内の残業計算)

**Interfaces:**
- Consumes: `Calc.calcOvertimeMinutes(clockIn, clockOut, status, isDayOff, breakMin)`(Task 1)、`isDateOff(dateKey)`(Task 2, app.js のグローバル関数)

- [ ] **Step 1: `io.js` のCSV出力を休日ルール対応に書き換える**

`io.js:22-23` を以下に置き換える:

```js
      var workMin = Calc.calcActualWorkMinutes(record.clockIn, record.clockOut, record.breakMin);
      var overtimeMin = Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status, isDateOff(dk), record.breakMin);
```

- [ ] **Step 2: `summary.js` の月次集計を休日ルール対応に書き換える**

`summary.js:32-34` を以下に置き換える:

```js
      var workMin = Calc.calcActualWorkMinutes(record.clockIn, record.clockOut, record.breakMin);
      if (workMin !== null) stats.workMinutes += workMin;
      stats.overtimeMinutes += Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status, isDateOff(dk), record.breakMin);
```

- [ ] **Step 3: 回帰テストを実行する**

Run: `node tests/calc.test.js`
Expected: すべて `OK:`。

- [ ] **Step 4: 動作確認(手動)**

ブラウザで `index.html` を開き、土曜日のメンバーに `06:45〜09:15` の出勤記録を入力し、一覧表示・カレンダー表示の両方で出退勤時刻が残業色になり、残業バッジが `+1:45` ではなく `+2:30` になることを確認する。その後「CSV出力」を実行し、CSV中の残業時間列が同じ `2:30` になっていることを確認する。

- [ ] **Step 5: コミット**

```bash
git add io.js summary.js
git commit -m "feat: count full holiday work hours as overtime in CSV export and monthly summary

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
