// 一覧表示(ガンチャート風): 縦=メンバー、横=1日〜月末までの日付を並べたシフト表。
function renderGanttView() {
  var year = App.state.year, month = App.state.month;
  var table = document.getElementById("ganttTable");
  table.innerHTML = "";

  var totalDays = daysInMonth(year, month);
  var weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];
  var today = new Date();
  var todayKey = dateKeyOf(today.getFullYear(), today.getMonth() + 1, today.getDate());

  var thead = document.createElement("thead");
  var headRow = document.createElement("tr");

  var cornerTh = document.createElement("th");
  cornerTh.className = "gantt-member-col gantt-corner";
  cornerTh.textContent = "氏名";
  headRow.appendChild(cornerTh);

  for (var d = 1; d <= totalDays; d++) {
    var dk = dateKeyOf(year, month, d);
    var weekday = new Date(year, month - 1, d).getDay();
    var holidayName = Holidays.isHoliday(dk);

    var th = document.createElement("th");
    th.className = "gantt-date-col";
    if (weekday === 0 || holidayName) th.classList.add("cell-sunday-holiday");
    if (weekday === 6) th.classList.add("cell-saturday");
    if (dk === todayKey) th.classList.add("cell-today");
    if (holidayName) th.title = holidayName;

    var dayDiv = document.createElement("div");
    dayDiv.textContent = d;
    th.appendChild(dayDiv);

    var wdDiv = document.createElement("div");
    wdDiv.className = "gantt-weekday";
    wdDiv.textContent = weekdayNames[weekday];
    th.appendChild(wdDiv);

    var dayNote = Storage.getDayNote(App.state.data, dk);
    if (dayNote) {
      var noteDiv = document.createElement("div");
      noteDiv.className = "gantt-daynote";
      noteDiv.textContent = dayNote;
      noteDiv.title = dayNote;
      th.appendChild(noteDiv);
    }

    th.addEventListener("click", (function (dkClosure) {
      return function () { editDayNote(dkClosure); };
    })(dk));

    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  var tbody = document.createElement("tbody");
  App.state.data.members.forEach(function (member) {
    var tr = document.createElement("tr");

    var nameTd = document.createElement("td");
    nameTd.className = "gantt-member-col";
    nameTd.textContent = member.name;
    tr.appendChild(nameTd);

    for (var d2 = 1; d2 <= totalDays; d2++) {
      var dk2 = dateKeyOf(year, month, d2);
      var weekday2 = new Date(year, month - 1, d2).getDay();
      var holidayName2 = Holidays.isHoliday(dk2);
      var record = Storage.getRecord(App.state.data, dk2, member.id);

      var td = document.createElement("td");
      td.className = "gantt-cell status-" + (record ? record.status : "未入力");
      if (weekday2 === 0 || holidayName2) td.classList.add("cell-sunday-holiday");
      if (weekday2 === 6) td.classList.add("cell-saturday");
      if (dk2 === todayKey) td.classList.add("cell-today");

      var titleParts = [];

      if (record && record.status === "出勤" && record.clockIn && record.clockOut) {
        var overtimeMin = Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status);
        if (overtimeMin > 0) td.classList.add("gantt-overtime");

        var inDiv = document.createElement("div");
        inDiv.textContent = record.clockIn;
        td.appendChild(inDiv);
        var outDiv = document.createElement("div");
        outDiv.textContent = record.clockOut;
        td.appendChild(outDiv);

        if (overtimeMin > 0) {
          var otDiv = document.createElement("div");
          otDiv.className = "gantt-overtime-badge";
          otDiv.textContent = "+" + Calc.minutesToHoursLabel(overtimeMin);
          td.appendChild(otDiv);
        }

        titleParts.push(record.clockIn + "-" + record.clockOut);
        if (overtimeMin > 0) titleParts.push("残業" + Calc.minutesToHoursLabel(overtimeMin));
      } else if (record) {
        td.textContent = record.status;
        titleParts.push(record.status);
      }

      if (record && record.note) titleParts.push(record.note);
      if (titleParts.length > 0) td.title = titleParts.join(" / ");

      td.addEventListener("click", (function (dkClosure, memberIdClosure) {
        return function () { openEditModal(dkClosure, memberIdClosure); };
      })(dk2, member.id));

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}
