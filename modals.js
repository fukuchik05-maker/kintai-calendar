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
