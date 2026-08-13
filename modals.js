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
