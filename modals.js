// 「打刻」: 今この瞬間の時刻を、選んだ人の今日の出勤時刻または退勤時刻として記録する。
// 平日は自動で8:30-17:30が入っているので、通常は使わず、早出・残業など実際の時刻が
// 標準と違うときだけ使う想定(そのタイミングでボタンを押せば時刻を手入力しなくて済む)。
function punchNow() {
  var members = App.state.data.members;
  if (members.length === 0) {
    alert("メンバーが登録されていません。先にメンバー設定から登録してください。");
    return;
  }

  var member;
  if (members.length === 1) {
    member = members[0];
  } else {
    var names = members.map(function (m, i) { return (i + 1) + ": " + m.name; }).join("\n");
    var memberInput = prompt("打刻する人を選んでください\n" + names, "1");
    if (!memberInput) return;
    var idx = parseInt(memberInput, 10) - 1;
    if (idx < 0 || idx >= members.length) return;
    member = members[idx];
  }

  var directionInput = prompt(member.name + "さん: 出勤打刻なら 1、退勤打刻なら 2 を入力してください", "2");
  if (!directionInput) return;
  var trimmed = directionInput.trim();
  if (trimmed !== "1" && trimmed !== "2") return;
  var isClockIn = trimmed === "1";

  var now = new Date();
  var todayKey = dateKeyOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
  var nowTime = pad2(now.getHours()) + ":" + pad2(now.getMinutes());

  var existing = Storage.getRecord(App.state.data, todayKey, member.id);
  var record = existing || { status: "出勤", clockIn: "", clockOut: "", breakMin: 60, hourlyLeaveHours: 0, note: "" };
  record.status = "出勤";
  if (isClockIn) {
    record.clockIn = nowTime;
  } else {
    record.clockOut = nowTime;
  }

  Storage.setRecord(App.state.data, todayKey, member.id, record);
  persistAndRerender();

  alert(member.name + "さんの" + (isClockIn ? "出勤" : "退勤") + "を " + nowTime + " で記録しました。");
}

function editDayNote(dateKey) {
  var current = Storage.getDayNote(App.state.data, dateKey);
  var input = prompt(dateKey + " のコメント(空欄で削除)", current);
  if (input === null) return; // キャンセル
  Storage.setDayNote(App.state.data, dateKey, input.trim());
  persistAndRerender();
}

function openDayMemberPicker(dateKey) {
  var members = App.state.data.members;
  if (members.length === 0) return;
  if (members.length === 1) {
    openEditModal(dateKey, members[0].id);
    return;
  }
  var names = members.map(function (m, i) { return (i + 1) + ": " + m.name; }).join("\n");
  var input = prompt("記録する人を選んでください\n" + names, "1");
  if (!input) return;
  var idx = parseInt(input, 10) - 1;
  if (idx >= 0 && idx < members.length) {
    openEditModal(dateKey, members[idx].id);
  }
}

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
    });
    grantedTd.appendChild(grantedInput);

    var actionTd = document.createElement("td");
    var removeBtn = document.createElement("button");
    removeBtn.textContent = "削除";
    removeBtn.addEventListener("click", function () {
      if (!confirm(member.name + " を削除しますか？関連する記録も削除されます。")) return;
      Storage.removeMember(App.state.data, member.id);
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
  nameInput.value = "";
  grantedInput.value = "";
  renderMemberTable();
}

function openVersionModal() {
  renderVersionTab();
  renderHistoryTab();
  switchVersionTab("version");
  document.getElementById("versionModal").classList.remove("hidden");
}

function closeVersionModal() {
  document.getElementById("versionModal").classList.add("hidden");
}

function switchVersionTab(tab) {
  var isVersion = tab === "version";
  document.getElementById("versionTabBtn").classList.toggle("active", isVersion);
  document.getElementById("historyTabBtn").classList.toggle("active", !isVersion);
  document.getElementById("versionTabContent").classList.toggle("hidden", !isVersion);
  document.getElementById("historyTabContent").classList.toggle("hidden", isVersion);
}

function renderVersionTab() {
  var content = document.getElementById("versionTabContent");
  content.innerHTML =
    "<p>現在のバージョン: <strong>v" + APP_VERSION + "</strong></p>" +
    "<p>最終更新日: " + CHANGELOG[0].date + "</p>";
}

function renderHistoryTab() {
  var content = document.getElementById("historyTabContent");
  var list = document.createElement("ul");
  list.className = "history-list";
  CHANGELOG.forEach(function (entry) {
    var li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML =
      "<span class=\"history-version\">v" + entry.version + "</span>" +
      "<span class=\"history-date\">" + entry.date + "</span>" +
      "<div>" + entry.notes + "</div>";
    list.appendChild(li);
  });
  content.innerHTML = "";
  content.appendChild(list);
}
