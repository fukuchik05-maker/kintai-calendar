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
