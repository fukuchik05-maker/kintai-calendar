# Firebase移行 + バーコード打刻キオスクページ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LocalStorage単体で動いていた勤怠管理カレンダーをFirebase Firestoreバックエンドに移行し、バーコードリーダーで職員コードを読み取るだけの打刻専用ページを追加する。

**Architecture:** `storage.js` の公開インターフェース(`Storage.loadData/saveData/getRecord/setRecord/...`)はそのまま維持し、内部実装だけをLocalStorageからFirestoreに差し替える。個々の変更系関数(`setRecord`, `deleteRecord`, `addMember` 等)はメモリ上のオブジェクトを即座に更新しつつ、対応するFirestoreドキュメント1件だけを裏側で非同期に書き込む(fire-and-forget)。これにより画面側コード(app.js/modals.js/gantt.js/summary.js)はほぼ無改造で動作し、打刻ページと管理画面が同時に書き込んでも互いのデータを丸ごと上書きする心配がない。

**Tech Stack:** Firebase Firestore(Web modular SDK v10、CDN経由、ビルド不要)、GitHub Pages(静的ホスティング)、既存のVanilla JS構成をそのまま踏襲。

## Global Constraints

- ビルドツール・バンドラーは使わない。すべて `<script>` タグ(一部 `type="module"`)で完結させる
- Firebase SDKは `https://www.gstatic.com/firebasejs/10.8.0/` のCDNから読み込む(バージョン固定)
- Firestoreコレクション: `members`(ドキュメントID=メンバーID)、`records`(ドキュメントID=`{日付}_{メンバーID}`)、`dayNotes`(ドキュメントID=日付)
- アクセス制限は設けない(セキュリティルールは全読み書き許可)
- 既存の画面(カレンダー/一覧表示/月報/CSV/バックアップ)の見た目・操作は変更しない。変わるのはデータの保存先のみ
- Firestoreに依存するコードはNode単体テストの対象外とし、実際のFirebaseプロジェクトに対するブラウザ動作確認で検証する。calc.js/holidays.jsの既存Node単体テストは維持し全て通過させ続ける
- Firebaseプロジェクト: `kintai-calendar-2026`(Firestore Standardエディション、東京リージョン、本番環境モード)。既に作成済み

---

### Task 1: Firestoreセキュリティルールの設定と疎通確認

**Files:**
- Create: `tests/firestore-smoke-test.html` (動作確認用の使い捨てページ。検証後に削除する)

**Interfaces:**
- Consumes: なし(ユーザーが既に作成したFirebaseプロジェクトの設定情報)
- Produces: Firestoreへの読み書きが許可されている状態(以降の全タスクの前提)

- [ ] **Step 1: Firestoreセキュリティルールを設定する**

Firebase Console(https://console.firebase.google.com/ → `kintai-calendar-2026` → Firestore Database → 「ルール」タブ)を開き、以下の内容に置き換えて「公開」をクリックする。

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 少人数の身内利用を想定し、今回はアクセス制限を設けない。
    // 将来的に制限したくなった場合はここにルールを追加する。
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

- [ ] **Step 2: 疎通確認用の使い捨てページを作成する**

```html
<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><title>Firestore疎通確認</title></head>
<body>
<h1>Firestore疎通確認</h1>
<pre id="result">実行中...</pre>
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
  import { getFirestore, doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

  var firebaseConfig = {
    apiKey: "AIzaSyBEej44TyYb-m9kd4fDnucFEIWMDlfJN9M",
    authDomain: "kintai-calendar-2026.firebaseapp.com",
    projectId: "kintai-calendar-2026",
    storageBucket: "kintai-calendar-2026.firebasestorage.app",
    messagingSenderId: "1061780263601",
    appId: "1:1061780263601:web:ccda20cc1a411cf565c890"
  };

  var app = initializeApp(firebaseConfig);
  var db = getFirestore(app);
  var resultEl = document.getElementById("result");

  (async function () {
    try {
      var testDocRef = doc(db, "smokeTest", "ping");
      await setDoc(testDocRef, { at: new Date().toISOString() });
      var snap = await getDoc(testDocRef);
      await deleteDoc(testDocRef);
      resultEl.textContent = "成功: 書き込み・読み込み・削除すべてOK\n" + JSON.stringify(snap.data());
    } catch (e) {
      resultEl.textContent = "失敗: " + e.message;
    }
  })();
</script>
</body>
</html>
```

- [ ] **Step 3: ブラウザで開いて確認する**

`.claude/launch.json` の `kintai-dev` サーバーで `tests/firestore-smoke-test.html` を開く(または直接 `file://` で開いてもよい。Firestoreへの通信はCORS許可されているため動作する)。

画面に「成功: 書き込み・読み込み・削除すべてOK」と表示されればルール設定は正しい。「Missing or insufficient permissions」のようなエラーが出た場合はStep 1のルールが正しく公開されているか確認する。

- [ ] **Step 4: 使い捨てページを削除する**

```bash
rm tests/firestore-smoke-test.html
```

- [ ] **Step 5: (ルール変更のみのためコミット対象なし。次のタスクへ)**

---

### Task 2: storage.jsをFirestoreバックエンドに書き換える

**Files:**
- Create: `firebase-config.js`
- Modify: `storage.js` (全面書き換え、`type="module"`化)
- Modify: `index.html:119` (`<script src="storage.js">` → `<script type="module" src="storage.js">`)
- Modify: `modals.js:170-173, 182-186, 192-197, 213-214` (`Storage.saveData` の冗長な呼び出しを削除)
- Delete: `tests/storage.test.js` (Firestore依存になりCommonJSでrequire不可能になるため)

**Interfaces:**
- Consumes: なし
- Produces: `window.Storage` が以下のシグネチャで利用可能(既存と同一。`loadData`/`saveData`のみ非同期=Promiseを返す):
  - `Storage.defaultData(): {members: [], records: {}, dayNotes: {}}`
  - `Storage.loadData(): Promise<data>`
  - `Storage.saveData(data): Promise<void>`
  - `Storage.generateMemberId(members): string`
  - `Storage.addMember(data, name, grantedLeaveDays): string` (同期、内部で非同期書き込みをfire-and-forget)
  - `Storage.updateMember(data, id, name, grantedLeaveDays): boolean`
  - `Storage.removeMember(data, id): void`
  - `Storage.getRecord(data, dateKey, memberId): record|null`
  - `Storage.setRecord(data, dateKey, memberId, record): void`
  - `Storage.deleteRecord(data, dateKey, memberId): void`
  - `Storage.getDayNote(data, dateKey): string`
  - `Storage.setDayNote(data, dateKey, text): void`

- [ ] **Step 1: firebase-config.js を作成する**

```js
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBEej44TyYb-m9kd4fDnucFEIWMDlfJN9M",
  authDomain: "kintai-calendar-2026.firebaseapp.com",
  projectId: "kintai-calendar-2026",
  storageBucket: "kintai-calendar-2026.firebasestorage.app",
  messagingSenderId: "1061780263601",
  appId: "1:1061780263601:web:ccda20cc1a411cf565c890"
};
```

- [ ] **Step 2: storage.js を全面的に書き換える**

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

var firebaseApp = initializeApp(FIREBASE_CONFIG);
var db = getFirestore(firebaseApp);

function defaultData() {
  return { members: [], records: {}, dayNotes: {} };
}

function recordDocId(dateKey, memberId) {
  return dateKey + "_" + memberId;
}

function reportSaveError(context, err) {
  console.error("Firestore書き込みエラー(" + context + "):", err);
  alert("クラウドへの保存に失敗しました(" + context + ")。ネットワーク接続を確認してください。");
}

async function loadData() {
  var data = defaultData();

  var membersSnap = await getDocs(collection(db, "members"));
  membersSnap.forEach(function (docSnap) {
    var d = docSnap.data();
    data.members.push({
      id: docSnap.id,
      name: d.name,
      grantedLeaveDays: d.grantedLeaveDays,
      employeeCode: d.employeeCode || ""
    });
  });

  var recordsSnap = await getDocs(collection(db, "records"));
  recordsSnap.forEach(function (docSnap) {
    var d = docSnap.data();
    if (!data.records[d.date]) data.records[d.date] = {};
    data.records[d.date][d.memberId] = {
      status: d.status,
      clockIn: d.clockIn,
      clockOut: d.clockOut,
      breakMin: d.breakMin,
      hourlyLeaveHours: d.hourlyLeaveHours,
      note: d.note
    };
  });

  var dayNotesSnap = await getDocs(collection(db, "dayNotes"));
  dayNotesSnap.forEach(function (docSnap) {
    data.dayNotes[docSnap.id] = docSnap.data().text;
  });

  return data;
}

async function saveData(data) {
  // JSONバックアップの復元など、全データを丸ごと書き直す場合にのみ使う。
  // 通常の編集操作は setRecord 等が個別にFirestoreへ書き込むのでこれは呼ばれない。
  try {
    var writes = [];
    data.members.forEach(function (m) {
      writes.push(setDoc(doc(db, "members", m.id), {
        name: m.name, grantedLeaveDays: m.grantedLeaveDays, employeeCode: m.employeeCode || ""
      }));
    });
    Object.keys(data.records).forEach(function (dateKey) {
      Object.keys(data.records[dateKey]).forEach(function (memberId) {
        var r = data.records[dateKey][memberId];
        writes.push(setDoc(doc(db, "records", recordDocId(dateKey, memberId)), {
          date: dateKey, memberId: memberId, status: r.status, clockIn: r.clockIn, clockOut: r.clockOut,
          breakMin: r.breakMin, hourlyLeaveHours: r.hourlyLeaveHours, note: r.note
        }));
      });
    });
    Object.keys(data.dayNotes).forEach(function (dateKey) {
      writes.push(setDoc(doc(db, "dayNotes", dateKey), { text: data.dayNotes[dateKey] }));
    });
    await Promise.all(writes);
  } catch (err) {
    reportSaveError("全体保存", err);
  }
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
  var member = { id: id, name: name, grantedLeaveDays: grantedLeaveDays, employeeCode: "" };
  data.members.push(member);
  setDoc(doc(db, "members", id), { name: member.name, grantedLeaveDays: member.grantedLeaveDays, employeeCode: "" })
    .catch(function (err) { reportSaveError("メンバー追加", err); });
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
  setDoc(doc(db, "members", id), { name: m.name, grantedLeaveDays: m.grantedLeaveDays, employeeCode: m.employeeCode || "" })
    .catch(function (err) { reportSaveError("メンバー更新", err); });
  return true;
}

function removeMember(data, id) {
  data.members = data.members.filter(function (x) { return x.id !== id; });
  var deletions = [deleteDoc(doc(db, "members", id))];
  Object.keys(data.records).forEach(function (dk) {
    if (data.records[dk][id]) {
      deletions.push(deleteDoc(doc(db, "records", recordDocId(dk, id))));
      delete data.records[dk][id];
      if (Object.keys(data.records[dk]).length === 0) delete data.records[dk];
    }
  });
  Promise.all(deletions).catch(function (err) { reportSaveError("メンバー削除", err); });
}

function getRecord(data, dateKey, memberId) {
  return (data.records[dateKey] && data.records[dateKey][memberId]) || null;
}

function setRecord(data, dateKey, memberId, record) {
  if (!data.records[dateKey]) data.records[dateKey] = {};
  data.records[dateKey][memberId] = record;
  setDoc(doc(db, "records", recordDocId(dateKey, memberId)), {
    date: dateKey, memberId: memberId, status: record.status, clockIn: record.clockIn, clockOut: record.clockOut,
    breakMin: record.breakMin, hourlyLeaveHours: record.hourlyLeaveHours, note: record.note
  }).catch(function (err) { reportSaveError("記録保存", err); });
}

function deleteRecord(data, dateKey, memberId) {
  if (data.records[dateKey]) {
    delete data.records[dateKey][memberId];
    if (Object.keys(data.records[dateKey]).length === 0) {
      delete data.records[dateKey];
    }
  }
  deleteDoc(doc(db, "records", recordDocId(dateKey, memberId)))
    .catch(function (err) { reportSaveError("記録削除", err); });
}

function getDayNote(data, dateKey) {
  return (data.dayNotes && data.dayNotes[dateKey]) || "";
}

function setDayNote(data, dateKey, text) {
  if (!data.dayNotes) data.dayNotes = {};
  if (text) {
    data.dayNotes[dateKey] = text;
    setDoc(doc(db, "dayNotes", dateKey), { text: text })
      .catch(function (err) { reportSaveError("日付コメント保存", err); });
  } else {
    delete data.dayNotes[dateKey];
    deleteDoc(doc(db, "dayNotes", dateKey))
      .catch(function (err) { reportSaveError("日付コメント削除", err); });
  }
}

window.Storage = {
  defaultData: defaultData,
  loadData: loadData,
  saveData: saveData,
  generateMemberId: generateMemberId,
  addMember: addMember,
  updateMember: updateMember,
  removeMember: removeMember,
  getRecord: getRecord,
  setRecord: setRecord,
  deleteRecord: deleteRecord,
  getDayNote: getDayNote,
  setDayNote: setDayNote
};
```

- [ ] **Step 3: index.htmlのstorage.jsの読み込みをmoduleに変更する**

`index.html:119` を以下に変更する。

```html
  <script type="module" src="storage.js"></script>
```

- [ ] **Step 4: modals.js内の冗長な `Storage.saveData` 呼び出しを削除する**

`setRecord`/`addMember`/`updateMember`/`removeMember` が自前でFirestoreへ書き込むようになったため、直後の `Storage.saveData(App.state.data)` は不要かつ無駄な全件書き込みになる。以下4箇所から該当行を削除する。

`modals.js` の `renderMemberTable` 内、氏名変更ハンドラ:
```js
    nameInput.addEventListener("change", function () {
      Storage.updateMember(App.state.data, member.id, nameInput.value, member.grantedLeaveDays);
    });
```

`renderMemberTable` 内、付与日数変更ハンドラ:
```js
    grantedInput.addEventListener("change", function () {
      var value = parseFloat(grantedInput.value) || 0;
      Storage.updateMember(App.state.data, member.id, member.name, value);
    });
```

`renderMemberTable` 内、削除ハンドラ:
```js
    removeBtn.addEventListener("click", function () {
      if (!confirm(member.name + " を削除しますか？関連する記録も削除されます。")) return;
      Storage.removeMember(App.state.data, member.id);
      renderMemberTable();
    });
```

`addMemberFromForm`:
```js
function addMemberFromForm() {
  var nameInput = document.getElementById("newMemberName");
  var grantedInput = document.getElementById("newMemberGranted");
  var name = nameInput.value.trim();
  if (!name) return;
  var granted = parseFloat(grantedInput.value) || 0;
  Storage.addMember(App.state.data, name, granted);
  nameInput.value = "";
  grantedInput.value = "";
  renderMemberTable();
}
```

- [ ] **Step 5: 動作しなくなった旧Node単体テストを削除する**

storage.jsはFirestoreへの実通信が必須になり、CommonJSの`require`で読み込めなくなる(ESモジュール構文かつリモートURLをimportするため)ため、以下を削除する。

```bash
rm tests/storage.test.js
```

- [ ] **Step 6: 残りのNode単体テストが引き続き通過することを確認する**

Run: `node tests/calc.test.js && node tests/holidays.test.js`
Expected: 両方とも全項目 `OK` で `EXIT:0` 相当(エラーなく完走)

- [ ] **Step 7: コミットする**

```bash
git add firebase-config.js storage.js index.html modals.js
git rm tests/storage.test.js
git commit -m "feat: switch storage.js from LocalStorage to Firestore backend

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: アプリ起動時とバックアップ復元を非同期対応させる

**Files:**
- Modify: `app.js:31-36` (`initState` を async化)
- Modify: `main.js:1-6` (`DOMContentLoaded` ハンドラを async化)
- Modify: `io.js:50-65` (`importBackupFile` を async化)

**Interfaces:**
- Consumes: Task 2で作られた `Storage.loadData(): Promise<data>` / `Storage.saveData(data): Promise<void>`
- Produces: アプリ起動時に `App.state.data` へFirestoreの内容が読み込まれた状態でレンダリングが行われる

- [ ] **Step 1: app.js の initState を async化する**

`app.js:31-36` を以下に置き換える。

```js
async function initState() {
  var now = new Date();
  App.state.year = now.getFullYear();
  App.state.month = now.getMonth() + 1;
  App.state.data = await Storage.loadData();
}
```

- [ ] **Step 2: main.js の DOMContentLoaded ハンドラを async化する**

`main.js:1-5` を以下に置き換える(以降の行はそのまま)。

```js
document.addEventListener("DOMContentLoaded", async function () {
  await initState();
  syncViewModeUI();
  autoFillWeekdaysForCurrentMonth();
  renderAll();
```

- [ ] **Step 3: io.js の importBackupFile を async化する**

`io.js:50-65` を以下に置き換える。

```js
function importBackupFile(file) {
  var reader = new FileReader();
  reader.onload = async function () {
    try {
      var parsed = JSON.parse(reader.result);
      if (!parsed.members || !parsed.records) throw new Error("invalid format");
      if (!confirm("現在のデータを上書きして復元します。よろしいですか？")) return;
      App.state.data = parsed;
      await Storage.saveData(App.state.data);
      renderAll();
    } catch (e) {
      alert("読み込みに失敗しました。正しいバックアップファイルを選択してください。");
    }
  };
  reader.readAsText(file);
}
```

- [ ] **Step 4: ブラウザで起動確認する**

`.claude/launch.json` の `kintai-dev` でアプリを開き、コンソールにエラーが出ないこと、カレンダー/一覧表示が(空でも)描画されることを確認する。

- [ ] **Step 5: コミットする**

```bash
git add app.js main.js io.js
git commit -m "feat: await Firestore-backed loadData/saveData at startup and backup restore

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: 既存機能一式をFirestore経由で動作確認する

**Files:**
- なし(コード変更なし。手動QAのみ)

**Interfaces:**
- Consumes: Task 2・3で完成したFirestore連携
- Produces: 既存の全機能がFirestoreを経由して壊れていないことの確認

- [ ] **Step 1: メンバーを2人登録する**

アプリを開き、メンバー設定から2人(例: 田中、鈴木)を登録。Firebase Consoleの「Firestore Database」→「データ」タブで `members` コレクションに2件のドキュメントが作られていることを確認する。

- [ ] **Step 2: 出退勤・有給・日付コメントを入力する**

カレンダー(または一覧表示)で数日分の記録と、日付コメントを1件入力。Firestoreの `records` / `dayNotes` コレクションにドキュメントが作られることを確認する。

- [ ] **Step 3: 打刻ボタンを試す**

ヘッダーの「打刻」ボタンで出勤・退勤を記録し、該当の `records` ドキュメントが更新されることを確認する。

- [ ] **Step 4: 平日一括入力・自動一括入力を確認する**

月を切り替えて自動一括入力が走ること、「平日一括入力」ボタンでも同様に動作することを確認する。

- [ ] **Step 5: 月報(当月サマリ・月次推移)を開く**

数値が実際の入力内容と一致していることを確認する。

- [ ] **Step 6: CSV出力・JSONバックアップ書き出し/読み込みを試す**

CSVが正しく出力されること、バックアップ書き出し→別データで上書き→読み込みで元に戻ることを確認する。

- [ ] **Step 7: ブラウザをリロードしてデータが保持されていることを確認する**

ページを再読み込みし、Firestoreから正しく読み込まれることを確認する(LocalStorageに依存していないことの最終確認)。

- [ ] **Step 8: 問題があれば修正し、この時点でコミットする(コード変更があった場合のみ)**

```bash
git add -A
git commit -m "fix: address issues found during Firestore migration QA

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: メンバーに職員コードを追加する

**Files:**
- Modify: `storage.js` (`addMember`/`updateMember` に `employeeCode` 引数を追加)
- Modify: `modals.js` (`renderMemberTable`/`addMemberFromForm` に職員コード欄を追加)
- Modify: `index.html` (メンバー設定モーダルに職員コード列・入力欄を追加)

**Interfaces:**
- Consumes: Task 2の `Storage.addMember`/`Storage.updateMember`
- Produces: `Storage.addMember(data, name, grantedLeaveDays, employeeCode): string`、`Storage.updateMember(data, id, name, grantedLeaveDays, employeeCode): boolean`。メンバーオブジェクトが `{id, name, grantedLeaveDays, employeeCode}` を持つ

- [ ] **Step 1: storage.js の addMember/updateMember を職員コード対応にする**

`storage.js` 内の該当2関数を以下に置き換える。

```js
function addMember(data, name, grantedLeaveDays, employeeCode) {
  var id = generateMemberId(data.members);
  var member = { id: id, name: name, grantedLeaveDays: grantedLeaveDays, employeeCode: employeeCode || "" };
  data.members.push(member);
  setDoc(doc(db, "members", id), { name: member.name, grantedLeaveDays: member.grantedLeaveDays, employeeCode: member.employeeCode })
    .catch(function (err) { reportSaveError("メンバー追加", err); });
  return id;
}

function updateMember(data, id, name, grantedLeaveDays, employeeCode) {
  var m = null;
  for (var i = 0; i < data.members.length; i++) {
    if (data.members[i].id === id) { m = data.members[i]; break; }
  }
  if (!m) return false;
  m.name = name;
  m.grantedLeaveDays = grantedLeaveDays;
  m.employeeCode = employeeCode || "";
  setDoc(doc(db, "members", id), { name: m.name, grantedLeaveDays: m.grantedLeaveDays, employeeCode: m.employeeCode })
    .catch(function (err) { reportSaveError("メンバー更新", err); });
  return true;
}
```

- [ ] **Step 2: index.htmlのメンバー設定モーダルに職員コード列を追加する**

`index.html` の `memberTable` 部分を以下に置き換える。

```html
      <table id="memberTable">
        <thead><tr><th>氏名</th><th>有給付与日数</th><th>職員コード</th><th></th></tr></thead>
        <tbody id="memberTableBody"></tbody>
      </table>
      <div class="add-member-row">
        <input type="text" id="newMemberName" placeholder="氏名">
        <input type="number" id="newMemberGranted" placeholder="付与日数" min="0" step="0.5">
        <input type="text" id="newMemberCode" placeholder="職員コード(任意)">
        <button id="addMemberBtn">追加</button>
      </div>
```

- [ ] **Step 3: modals.js の renderMemberTable に職員コード入力欄を追加する**

`renderMemberTable` 内、`grantedTd` の作成ブロックの直後に以下を追加し、`actionTd` より前に配置する。

```js
    var codeTd = document.createElement("td");
    var codeInput = document.createElement("input");
    codeInput.type = "text";
    codeInput.value = member.employeeCode || "";
    codeInput.placeholder = "職員コード";
    codeInput.addEventListener("change", function () {
      Storage.updateMember(App.state.data, member.id, member.name, member.grantedLeaveDays, codeInput.value.trim());
    });
    codeTd.appendChild(codeInput);
```

同じ関数内、`tr.appendChild(actionTd);` の直前に `tr.appendChild(codeTd);` を追加する(`grantedTd` の後、`actionTd` の前)。

また、氏名・付与日数の変更ハンドラも職員コードを引き継ぐよう更新する。

```js
    nameInput.addEventListener("change", function () {
      Storage.updateMember(App.state.data, member.id, nameInput.value, member.grantedLeaveDays, member.employeeCode);
    });
```

```js
    grantedInput.addEventListener("change", function () {
      var value = parseFloat(grantedInput.value) || 0;
      Storage.updateMember(App.state.data, member.id, member.name, value, member.employeeCode);
    });
```

- [ ] **Step 4: addMemberFromForm を職員コード対応にする**

```js
function addMemberFromForm() {
  var nameInput = document.getElementById("newMemberName");
  var grantedInput = document.getElementById("newMemberGranted");
  var codeInput = document.getElementById("newMemberCode");
  var name = nameInput.value.trim();
  if (!name) return;
  var granted = parseFloat(grantedInput.value) || 0;
  Storage.addMember(App.state.data, name, granted, codeInput.value.trim());
  nameInput.value = "";
  grantedInput.value = "";
  codeInput.value = "";
  renderMemberTable();
}
```

- [ ] **Step 5: ブラウザで確認する**

メンバー設定を開き、既存メンバーに職員コードを入力→変更が保存されること、新規メンバーを職員コード付きで追加できることをFirestoreコンソールで確認する。

- [ ] **Step 6: コミットする**

```bash
git add storage.js modals.js index.html
git commit -m "feat: add employee code field to member settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: 打刻の時刻判定ロジックを純粋関数として追加する

**Files:**
- Modify: `calc.js` (`determinePunchField` 関数を追加)
- Modify: `tests/calc.test.js` (テスト追加)

**Interfaces:**
- Consumes: `calc.js` 内の既存 `STANDARD_START_MIN`(510) / `STANDARD_END_MIN`(1050)
- Produces: `Calc.determinePunchField(nowDate: Date): "clockIn"|"clockOut"` — 8:30より前なら `"clockIn"`、それ以外(8:30〜17:30の間、および17:30より後)は `"clockOut"`

- [ ] **Step 1: 失敗するテストを書く**

`tests/calc.test.js` の `console.log("calc.test.js done");` の直前に追加する。

```js
test("determinePunchField returns clockIn before 8:30, clockOut otherwise", function () {
  assert.strictEqual(Calc.determinePunchField(new Date(2026, 7, 13, 7, 0)), "clockIn");
  assert.strictEqual(Calc.determinePunchField(new Date(2026, 7, 13, 8, 29)), "clockIn");
  assert.strictEqual(Calc.determinePunchField(new Date(2026, 7, 13, 8, 30)), "clockOut");
  assert.strictEqual(Calc.determinePunchField(new Date(2026, 7, 13, 12, 0)), "clockOut");
  assert.strictEqual(Calc.determinePunchField(new Date(2026, 7, 13, 18, 0)), "clockOut");
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `node tests/calc.test.js`
Expected: `FAIL: determinePunchField returns clockIn before 8:30, clockOut otherwise` / `Calc.determinePunchField is not a function`

- [ ] **Step 3: calc.js に実装を追加する**

`calc.js` の `var api = {` の直前に追加する。

```js
  function determinePunchField(nowDate) {
    var minutes = nowDate.getHours() * 60 + nowDate.getMinutes();
    if (minutes < STANDARD_START_MIN) return "clockIn";
    return "clockOut"; // 17:30より後の残業、および8:30〜17:30の間(早退扱い)はどちらもclockOut
  }
```

`api` オブジェクトに `determinePunchField: determinePunchField,` を追加する。

- [ ] **Step 4: テストが通過することを確認する**

Run: `node tests/calc.test.js`
Expected: 全項目 `OK`

- [ ] **Step 5: コミットする**

```bash
git add calc.js tests/calc.test.js
git commit -m "feat: add determinePunchField pure function for kiosk punch logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: バーコード打刻キオスクページを作成する

**Files:**
- Create: `kiosk.html`
- Create: `kiosk.js`
- Modify: `style.css` (キオスク用スタイル追加)

**Interfaces:**
- Consumes: `window.Storage`(Task 2)、`Calc.determinePunchField`(Task 6)、メンバーの `employeeCode`(Task 5)
- Produces: 単独で動作する打刻専用ページ(他ページから参照されない)

- [ ] **Step 1: kiosk.html を作成する**

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>打刻</title>
<link rel="stylesheet" href="style.css">
</head>
<body class="kiosk-body">
  <div class="kiosk-wrap">
    <h1>打刻</h1>
    <p>バーコードリーダーで職員コードを読み取ってください</p>
    <input type="text" id="kioskInput" class="kiosk-input" autocomplete="off">
    <div id="kioskMessage" class="kiosk-message"></div>
  </div>

  <script src="calc.js"></script>
  <script type="module" src="storage.js"></script>
  <script src="kiosk.js"></script>
</body>
</html>
```

- [ ] **Step 2: kiosk.js を作成する**

```js
function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function dateKeyOf(year, month, day) {
  return year + "-" + pad2(month) + "-" + pad2(day);
}

function findMemberByEmployeeCode(members, code) {
  for (var i = 0; i < members.length; i++) {
    if (members[i].employeeCode && members[i].employeeCode === code) return members[i];
  }
  return null;
}

var kioskData = null;

function showKioskMessage(text, isError) {
  var el = document.getElementById("kioskMessage");
  el.textContent = text;
  el.className = "kiosk-message" + (isError ? " kiosk-message-error" : " kiosk-message-success");
}

function focusKioskInput() {
  var input = document.getElementById("kioskInput");
  input.value = "";
  input.focus();
}

function handleKioskScan(code) {
  var trimmed = code.trim();
  if (!trimmed) return;

  var member = findMemberByEmployeeCode(kioskData.members, trimmed);
  if (!member) {
    showKioskMessage("職員コード「" + trimmed + "」に一致するメンバーが見つかりません", true);
    focusKioskInput();
    return;
  }

  var now = new Date();
  var todayKey = dateKeyOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
  var nowTime = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
  var field = Calc.determinePunchField(now);

  var existing = Storage.getRecord(kioskData, todayKey, member.id);
  var record = existing || { status: "出勤", clockIn: "", clockOut: "", breakMin: 60, hourlyLeaveHours: 0, note: "" };
  record.status = "出勤";
  record[field] = nowTime;

  Storage.setRecord(kioskData, todayKey, member.id, record);

  var label = field === "clockIn" ? "出勤" : "退勤";
  showKioskMessage(member.name + "さん " + label + " " + nowTime + " を記録しました", false);
  focusKioskInput();
}

document.addEventListener("DOMContentLoaded", async function () {
  kioskData = await Storage.loadData();

  var input = document.getElementById("kioskInput");
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      handleKioskScan(input.value);
    }
  });
  focusKioskInput();

  // 他端末での職員コード追加・変更を取りこぼさないよう、5分おきにメンバー一覧だけ再取得する
  setInterval(async function () {
    var fresh = await Storage.loadData();
    kioskData.members = fresh.members;
  }, 5 * 60 * 1000);
});
```

- [ ] **Step 3: style.css にキオスク用スタイルを追加する**

`style.css` の末尾に追加する。

```css
.kiosk-body {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  margin: 0;
  background: #f5f6f8;
}
.kiosk-wrap {
  text-align: center;
  background: #fff;
  padding: 40px 60px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}
.kiosk-wrap h1 { font-size: 32px; margin: 0 0 8px; }
.kiosk-wrap p { color: #666; margin: 0 0 24px; }
.kiosk-input {
  font-size: 24px;
  padding: 16px;
  width: 320px;
  text-align: center;
  border: 2px solid #ccc;
  border-radius: 8px;
}
.kiosk-message { margin-top: 24px; font-size: 22px; min-height: 32px; font-weight: bold; }
.kiosk-message-success { color: #2e7d32; }
.kiosk-message-error { color: #cc3300; }
```

- [ ] **Step 4: ブラウザで動作確認する**

`kiosk.html` を開き、入力欄に登録済みメンバーの職員コードを入力してEnter(バーコードリーダーがない場合はキーボードで代用可能)。「〇〇さん 出勤 HH:MM を記録しました」と表示され、メインアプリ側でその日の記録が反映されていることを確認する。存在しないコードでは「見つかりません」と表示されることも確認する。8:30より前・8:30〜17:30の間・17:30より後の3パターンでシステム時刻を変えて(またはPCの時刻を一時的に変更して)判定が正しいことを確認する。

- [ ] **Step 5: コミットする**

```bash
git add kiosk.html kiosk.js style.css
git commit -m "feat: add barcode punch kiosk page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: メインアプリに「データを再取得」ボタンを追加する

**Files:**
- Modify: `index.html` (ボタン追加)
- Modify: `app.js` (`refreshFromCloud` 関数追加)
- Modify: `main.js` (イベント配線)

**Interfaces:**
- Consumes: `Storage.loadData()`(Task 2)
- Produces: `refreshFromCloud(): Promise<void>` — 打刻ページ等、別端末での変更をページ再読み込みなしで取り込む

- [ ] **Step 1: index.html にボタンを追加する**

`index.html` の `viewToggleBtn` の直後に追加する。

```html
      <button id="refreshBtn">データを再取得</button>
```

- [ ] **Step 2: app.js に refreshFromCloud を追加する**

`app.js` の `initState` 関数の直後に追加する。

```js
async function refreshFromCloud() {
  App.state.data = await Storage.loadData();
  renderAll();
}
```

- [ ] **Step 3: main.js に配線する**

`main.js` の `viewToggleBtn` のイベント登録行の直後に追加する。

```js
  document.getElementById("refreshBtn").addEventListener("click", refreshFromCloud);
```

- [ ] **Step 4: ブラウザで確認する**

kiosk.htmlで打刻した後、メインアプリをリロードせずに「データを再取得」を押し、カレンダー/一覧表示に反映されることを確認する。

- [ ] **Step 5: コミットする**

```bash
git add index.html app.js main.js
git commit -m "feat: add manual refresh button to pull in changes from other devices

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: GitHubにpushしてGitHub Pagesで公開する

**Files:**
- なし(デプロイ作業のみ)

**Interfaces:**
- Consumes: Task 1〜8で完成した全ファイル
- Produces: 公開URL(`https://<username>.github.io/<repo>/`)からアプリと打刻ページにアクセスできる状態

- [ ] **Step 1: リポジトリ作成方針をユーザーに確認する**

publicリポジトリとしてGitHubにpushしてよいか、ユーザーに確認を取る(ソースコードが公開される点を含む)。

- [ ] **Step 2: GitHubリポジトリを作成してpushする**

```bash
gh repo create kintai-calendar --public --source=. --remote=origin --push
```

- [ ] **Step 3: GitHub Pagesを有効化する**

GitHubリポジトリの Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `/(root)` に設定して保存する。数分待つと公開URLが発行される。

- [ ] **Step 4: 公開URLで最終動作確認する**

発行されたURL(`.../index.html` および `.../kiosk.html`)をブラウザで開き、Task 4・Task 7と同様の一連の動作(記録の追加・打刻・月報・CSV出力)を確認する。

- [ ] **Step 5: READMEに公開URLを記録する(任意)**

```bash
cat > README.md << 'EOF'
# 勤怠管理カレンダー

- メインアプリ: https://<username>.github.io/kintai-calendar/index.html
- 打刻ページ: https://<username>.github.io/kintai-calendar/kiosk.html
EOF
git add README.md
git commit -m "docs: add README with deployed URLs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```
