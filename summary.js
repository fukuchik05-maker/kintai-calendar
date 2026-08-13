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

function openReportModal() {
  var members = App.state.data.members;
  var stillValid = members.some(function (m) { return m.id === App.state.reportActiveMemberId; });
  if (members.length > 0 && !stillValid) {
    App.state.reportActiveMemberId = members[0].id;
  }
  if (members.length === 0) {
    App.state.reportActiveMemberId = null;
  }
  renderReportTabs();
  renderReportContent();
  document.getElementById("reportModal").classList.remove("hidden");
}

function closeReportModal() {
  document.getElementById("reportModal").classList.add("hidden");
}

function switchReportMember(memberId) {
  App.state.reportActiveMemberId = memberId;
  renderReportTabs();
  renderReportContent();
}

function renderReportTabs() {
  var container = document.getElementById("reportMemberTabs");
  container.innerHTML = "";
  App.state.data.members.forEach(function (member) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab-btn" + (member.id === App.state.reportActiveMemberId ? " active" : "");
    btn.textContent = member.name;
    btn.addEventListener("click", (function (memberIdClosure) {
      return function () { switchReportMember(memberIdClosure); };
    })(member.id));
    container.appendChild(btn);
  });
}

function renderReportContent() {
  var memberId = App.state.reportActiveMemberId;
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
