import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, addDoc
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
  // 新しいデータに存在しない古いドキュメントは削除し、Firestore側を新データに完全一致させる。
  try {
    var newMemberIds = {};
    data.members.forEach(function (m) { newMemberIds[m.id] = true; });
    var newRecordIds = {};
    Object.keys(data.records).forEach(function (dateKey) {
      Object.keys(data.records[dateKey]).forEach(function (memberId) {
        newRecordIds[recordDocId(dateKey, memberId)] = true;
      });
    });
    var newDayNoteIds = {};
    Object.keys(data.dayNotes).forEach(function (dateKey) { newDayNoteIds[dateKey] = true; });

    var existingMembersSnap = await getDocs(collection(db, "members"));
    var existingRecordsSnap = await getDocs(collection(db, "records"));
    var existingDayNotesSnap = await getDocs(collection(db, "dayNotes"));

    var writes = [];

    existingMembersSnap.forEach(function (docSnap) {
      if (!newMemberIds[docSnap.id]) writes.push(deleteDoc(doc(db, "members", docSnap.id)));
    });
    existingRecordsSnap.forEach(function (docSnap) {
      if (!newRecordIds[docSnap.id]) writes.push(deleteDoc(doc(db, "records", docSnap.id)));
    });
    existingDayNotesSnap.forEach(function (docSnap) {
      if (!newDayNoteIds[docSnap.id]) writes.push(deleteDoc(doc(db, "dayNotes", docSnap.id)));
    });

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

// 打刻ログ(punchLogs)への追記。打刻の成否には影響させたくないので失敗しても握りつぶす(コンソールにのみ記録)。
function appendPunchLog(memberId, memberName, dateKey, field, time, source) {
  addDoc(collection(db, "punchLogs"), {
    memberId: memberId,
    memberName: memberName,
    dateKey: dateKey,
    field: field,
    time: time,
    source: source,
    timestamp: new Date().toISOString()
  }).catch(function (err) {
    console.error("打刻ログの記録に失敗しました:", err);
  });
}

// 打刻専用: ローカルのキャッシュ(data)がどれだけ古くても、Firestoreの「今その瞬間の」
// レコードを直接取得してから該当欄(clockIn または clockOut)だけを上書きする。
// setRecord のようにローカルのコピーをそのまま丸ごと書き込むと、キャッシュが古い場合に
// 他の端末が書いた値(例: 平日一括入力の出勤時刻)を消してしまうため、専用の安全な経路を用意する。
// あわせて punchLogs に「いつ・誰が・どちらを・どこから」打刻したかの履歴を1件追加する。
async function punchRecord(data, dateKey, memberId, memberName, field, time, source) {
  var docRef = doc(db, "records", recordDocId(dateKey, memberId));
  try {
    var snap = await getDoc(docRef);
    var record;
    if (snap.exists()) {
      var d = snap.data();
      record = {
        status: "出勤",
        clockIn: field === "clockIn" ? time : d.clockIn,
        clockOut: field === "clockOut" ? time : d.clockOut,
        breakMin: d.breakMin,
        hourlyLeaveHours: d.hourlyLeaveHours,
        note: d.note
      };
    } else {
      record = { status: "出勤", clockIn: "", clockOut: "", breakMin: 60, hourlyLeaveHours: 0, note: "" };
      record[field] = time;
    }

    await setDoc(docRef, {
      date: dateKey, memberId: memberId, status: record.status, clockIn: record.clockIn, clockOut: record.clockOut,
      breakMin: record.breakMin, hourlyLeaveHours: record.hourlyLeaveHours, note: record.note
    });

    if (!data.records[dateKey]) data.records[dateKey] = {};
    data.records[dateKey][memberId] = record;

    appendPunchLog(memberId, memberName, dateKey, field, time, source);

    return record;
  } catch (err) {
    reportSaveError("打刻", err);
    return null;
  }
}

async function getPunchLogs() {
  var snap = await getDocs(collection(db, "punchLogs"));
  var logs = [];
  snap.forEach(function (docSnap) {
    var d = docSnap.data();
    logs.push({
      memberId: d.memberId,
      memberName: d.memberName,
      dateKey: d.dateKey,
      field: d.field,
      time: d.time,
      source: d.source,
      timestamp: d.timestamp
    });
  });
  logs.sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; }); // 新しい順
  return logs;
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
  punchRecord: punchRecord,
  getPunchLogs: getPunchLogs,
  deleteRecord: deleteRecord,
  getDayNote: getDayNote,
  setDayNote: setDayNote
};
