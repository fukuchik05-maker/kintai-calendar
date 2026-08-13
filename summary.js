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

function getRecentMonths(year, month, count) {
  var result = [];
  for (var i = count - 1; i >= 0; i--) {
    var m = month - i;
    var y = year;
    while (m < 1) { m += 12; y -= 1; }
    result.push({ year: y, month: m });
  }
  return result;
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

// 氏名/出勤日数/実労働時間/残業時間/有給消化/有給残/欠勤日数を、全メンバー横並びの表として組み立てる。
// カレンダー画面下の集計パネルと、月報の「当月サマリ」タブの両方から使う共通部品。
function buildSummaryTable(year, month) {
  var table = document.createElement("table");
  table.className = "summary-table";
  var thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>氏名</th><th>出勤日数</th><th>実労働時間</th><th>残業時間</th><th>有給消化</th><th>有給残</th><th>欠勤日数</th></tr>";
  table.appendChild(thead);

  var tbody = document.createElement("tbody");
  App.state.data.members.forEach(function (member) {
    var stats = computeMemberMonthStats(member.id, year, month);
    var balance = computeMemberLeaveBalance(member, year, month);
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
  return table;
}

// 直近数ヶ月分について、メンバーごとに「実労働・残業・有給消化」を横に並べた推移表を組み立てる。
function buildTrendTable(year, month, monthCount) {
  var months = getRecentMonths(year, month, monthCount);
  var members = App.state.data.members;

  var table = document.createElement("table");
  table.className = "summary-table trend-table";

  var thead = document.createElement("thead");
  var headRow1 = document.createElement("tr");
  var monthTh = document.createElement("th");
  monthTh.textContent = "月";
  monthTh.rowSpan = 2;
  headRow1.appendChild(monthTh);
  members.forEach(function (member) {
    var th = document.createElement("th");
    th.colSpan = 3;
    th.textContent = member.name;
    headRow1.appendChild(th);
  });
  thead.appendChild(headRow1);

  var headRow2 = document.createElement("tr");
  members.forEach(function () {
    ["実労働", "残業", "有給消化"].forEach(function (label) {
      var th = document.createElement("th");
      th.textContent = label;
      headRow2.appendChild(th);
    });
  });
  thead.appendChild(headRow2);
  table.appendChild(thead);

  var tbody = document.createElement("tbody");
  months.forEach(function (m) {
    var tr = document.createElement("tr");
    var monthTd = document.createElement("td");
    monthTd.textContent = m.year + "/" + pad2(m.month);
    tr.appendChild(monthTd);

    members.forEach(function (member) {
      var stats = computeMemberMonthStats(member.id, m.year, m.month);

      var workTd = document.createElement("td");
      workTd.textContent = Calc.minutesToHoursLabel(stats.workMinutes);
      tr.appendChild(workTd);

      var otTd = document.createElement("td");
      otTd.textContent = Calc.minutesToHoursLabel(stats.overtimeMinutes);
      if (stats.overtimeMinutes > 0) otTd.className = "cell-overtime";
      tr.appendChild(otTd);

      var leaveTd = document.createElement("td");
      leaveTd.textContent = stats.leaveDays;
      tr.appendChild(leaveTd);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function renderSummary() {
  var panel = document.getElementById("summaryPanel");
  panel.innerHTML = "";
  panel.appendChild(buildSummaryTable(App.state.year, App.state.month));
}

function openReportModal() {
  document.getElementById("reportTitle").textContent = App.state.year + "年" + App.state.month + "月 月報";
  switchReportTab("summary");
  document.getElementById("reportModal").classList.remove("hidden");
}

function closeReportModal() {
  document.getElementById("reportModal").classList.add("hidden");
}

function switchReportTab(tab) {
  var isSummary = tab === "summary";
  document.getElementById("reportSummaryTabBtn").classList.toggle("active", isSummary);
  document.getElementById("reportTrendTabBtn").classList.toggle("active", !isSummary);
  document.getElementById("reportSummaryContent").classList.toggle("hidden", !isSummary);
  document.getElementById("reportTrendContent").classList.toggle("hidden", isSummary);

  if (isSummary) {
    renderReportSummaryTab();
  } else {
    renderReportTrendTab();
  }
}

function renderReportSummaryTab() {
  var content = document.getElementById("reportSummaryContent");
  content.innerHTML = "";
  if (App.state.data.members.length === 0) {
    content.innerHTML = "<p>メンバーが登録されていません。</p>";
    return;
  }
  var wrap = document.createElement("div");
  wrap.className = "report-table-wrap";
  wrap.appendChild(buildSummaryTable(App.state.year, App.state.month));
  content.appendChild(wrap);
}

function renderReportTrendTab() {
  var content = document.getElementById("reportTrendContent");
  content.innerHTML = "";
  if (App.state.data.members.length === 0) {
    content.innerHTML = "<p>メンバーが登録されていません。</p>";
    return;
  }
  var wrap = document.createElement("div");
  wrap.className = "report-table-wrap";
  wrap.appendChild(buildTrendTable(App.state.year, App.state.month, 6));
  content.appendChild(wrap);
}
