// 日付コメントの先頭が「16:30 部門長」のような「時刻+本文」の場合、時刻と本文を分けて返す。
// 時刻から始まっていない場合は本文のみとして扱う。
function splitDayNoteTimeText(note) {
  var match = /^(\d{1,2}:\d{2})\s*(.*)$/.exec(note);
  if (match) {
    return { time: match[1], text: match[2] };
  }
  return { time: "", text: note };
}

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

    if (holidayName) {
      var holidayDiv = document.createElement("div");
      holidayDiv.className = "gantt-holiday-name";
      holidayDiv.textContent = holidayName;
      th.appendChild(holidayDiv);
    }

    var dayNote = Storage.getDayNote(App.state.data, dk);
    if (dayNote) {
      var noteParts = splitDayNoteTimeText(dayNote);

      if (noteParts.time) {
        var timeDiv = document.createElement("div");
        timeDiv.className = "gantt-daynote-time";
        timeDiv.textContent = noteParts.time;
        timeDiv.title = dayNote;
        th.appendChild(timeDiv);
      }

      if (noteParts.text) {
        var textDiv = document.createElement("div");
        textDiv.className = "gantt-daynote-text";
        textDiv.textContent = noteParts.text;
        textDiv.title = dayNote;
        th.appendChild(textDiv);
      }
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

        // 時間外(8:30より前 / 17:30より後)の側だけを色付けする(カレンダー表示と同じ挙動)
        var inMin = Calc.timeToMinutes(record.clockIn);
        var outMin = Calc.timeToMinutes(record.clockOut);
        var isEarly = inMin < Calc.STANDARD_START_MIN;
        var isLate = outMin > Calc.STANDARD_END_MIN;

        var inDiv = document.createElement("div");
        if (isEarly) inDiv.className = "gantt-time-overtime";
        inDiv.textContent = record.clockIn;
        td.appendChild(inDiv);
        var outDiv = document.createElement("div");
        if (isLate) outDiv.className = "gantt-time-overtime";
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

      if (record && record.note) {
        var cellNoteDiv = document.createElement("div");
        cellNoteDiv.className = "gantt-cell-note";
        cellNoteDiv.textContent = record.note;
        td.appendChild(cellNoteDiv);
        titleParts.push(record.note);
      }
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
