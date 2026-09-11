# 土日祝は全労働時間を残業扱いにする 設計書

- 日付: 2026-09-11
- ステータス: 承認済み

## 背景・目的

現在の `Calc.calcOvertimeMinutes` は曜日を見ておらず、平日と同じ基準(8:30より前 / 17:30より後)でしか残業時間を計算していない。そのため土日祝に出勤した場合も、標準勤務時間帯(8:30〜17:30)に重なる部分は残業として計上されない。

土日祝はそもそも所定労働日ではないため、出勤した実労働時間はすべて残業として扱いたい。

## 対象日

- 土曜日
- 日曜日
- 祝日(`Holidays.isHoliday()` で判定される日。振替休日・国民の休日を含む)

## 残業時間の計算ルール

`status === "出勤"` かつ `clockIn`/`clockOut` が入力されている前提で、対象日は次の式で残業時間を計算する。

```
span = clockOut - clockIn  (拘束時間、分)
effectiveBreak = span >= 8時間(480分) ? breakMin : 0
overtimeMinutes = floorTo15(span - effectiveBreak)
```

- 拘束時間が8時間未満の場合、入力済みの休憩時間(`breakMin`)は差し引かず、拘束時間そのものを残業として扱う。
- 拘束時間が8時間以上の場合のみ、入力済みの休憩時間を差し引く。
- 平日の計算式(8:30より前 + 17:30より後、15分単位切り捨て)は変更しない。

## API変更

### `calc.js`

`calcOvertimeMinutes(clockIn, clockOut, status, isDayOff, breakMin)` — 引数を2つ追加する。

- `isDayOff`(省略可・既定 falsy): true のとき上記の休日ルールを使う。false/未指定のときは既存の平日ルールのまま(後方互換)。
- `breakMin`(省略可・既定 0): 休日ルールでのみ使用。

### `app.js` に共通ヘルパーを追加

```js
function isDateOff(dateKey) {
  var parts = dateKey.split("-").map(Number);
  var weekday = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  return weekday === 0 || weekday === 6 || !!Holidays.isHoliday(dateKey);
}
```

`app.js` は他のスクリプト(`gantt.js` / `summary.js` / `io.js`)より先に読み込まれるグローバルスクリプトなので、`pad2` や `dateKeyOf` と同様にそのまま共有される。

## 呼び出し側の変更

- **`app.js`(カレンダー表示)**: 各セルで既に計算済みの `isDayOff` 変数を再利用する。
  - `calcOvertimeMinutes(...)` の呼び出しに `isDayOff, record.breakMin` を追加。
  - 出勤・退勤時刻の色付け判定を `isEarly = isDayOff || (早出判定)`、`isLate = isDayOff || (居残り判定)` に変更し、休日は出退勤の両方を残業色で表示する。
- **`gantt.js`(一覧表示)**: セルごとに `isDayOff2 = weekday2 === 0 || weekday2 === 6 || !!holidayName2` を計算し、`app.js` と同様に残業計算・色付けの両方に渡す。
- **`io.js`(CSVエクスポート)**: `isDateOff(dk)` を使って `calcOvertimeMinutes` に `isDayOff, record.breakMin` を渡す。表示上の色付けは対象外。
- **`summary.js`(月次集計)**: 同様に `isDateOff(dk)` を使って `calcOvertimeMinutes` に渡す。

## テスト

`tests/calc.test.js` に以下のケースを追加する。

```js
test("calcOvertimeMinutes: 休日は拘束時間が8時間未満なら休憩を引かず全部残業", function () {
  assert.strictEqual(Calc.calcOvertimeMinutes("06:45", "09:15", "出勤", true, 0), 150);
});

test("calcOvertimeMinutes: 休日で拘束8時間以上なら休憩を差し引く", function () {
  assert.strictEqual(Calc.calcOvertimeMinutes("08:00", "18:00", "出勤", true, 60), 540); // 600-60=540
});

test("calcOvertimeMinutes: 休日で拘束8時間以上でも休憩0分なら差し引きなし", function () {
  assert.strictEqual(Calc.calcOvertimeMinutes("08:00", "18:00", "出勤", true, 0), 600);
});

test("calcOvertimeMinutes: isDayOffを渡さなければ平日ルールのまま(後方互換)", function () {
  assert.strictEqual(Calc.calcOvertimeMinutes("08:00", "18:00", "出勤"), 60);
});
```

`tests/holidays.test.js` は変更不要(判定ロジック自体は変えない)。

## スコープ外

- 平日の残業計算式・15分丸めルールの変更
- 有給・半休・欠勤など「出勤」以外のステータスの扱い
- 残業時間の割増率(1.25倍など)の計算・表示
