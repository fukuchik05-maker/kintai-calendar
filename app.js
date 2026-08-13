var App = {
  state: {
    year: null,
    month: null,
    data: null,
    editingContext: null
  }
};

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function dateKeyOf(year, month, day) {
  return year + "-" + pad2(month) + "-" + pad2(day);
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function initState() {
  var now = new Date();
  App.state.year = now.getFullYear();
  App.state.month = now.getMonth() + 1;
  App.state.data = Storage.loadData();
}

function persistAndRerender() {
  Storage.saveData(App.state.data);
  renderAll();
}

function renderAll() {
  renderCalendar();
  if (typeof renderSummary === "function") renderSummary();
}

function changeMonth(delta) {
  var m = App.state.month + delta;
  var y = App.state.year;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  App.state.month = m;
  App.state.year = y;
  renderAll();
}

function goToToday() {
  var now = new Date();
  App.state.year = now.getFullYear();
  App.state.month = now.getMonth() + 1;
  renderAll();
}

function renderCalendar() {
  var year = App.state.year, month = App.state.month;
  document.getElementById("currentMonthLabel").textContent = year + "年" + month + "月";

  var grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  var weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];
  var headerRow = document.createElement("div");
  headerRow.className = "calendar-row calendar-header-row";
  weekdayNames.forEach(function (wd) {
    var cell = document.createElement("div");
    cell.className = "calendar-header-cell";
    cell.textContent = wd;
    headerRow.appendChild(cell);
  });
  grid.appendChild(headerRow);

  var firstDay = new Date(year, month - 1, 1);
  var startWeekday = firstDay.getDay();
  var totalDays = daysInMonth(year, month);
  var cellsCount = Math.ceil((startWeekday + totalDays) / 7) * 7;

  var today = new Date();
  var todayKey = dateKeyOf(today.getFullYear(), today.getMonth() + 1, today.getDate());

  var row = document.createElement("div");
  row.className = "calendar-row";

  for (var i = 0; i < cellsCount; i++) {
    var dayNum = i - startWeekday + 1;
    var cell = document.createElement("div");
    cell.className = "calendar-cell";

    if (dayNum >= 1 && dayNum <= totalDays) {
      var dk = dateKeyOf(year, month, dayNum);
      var weekday = (startWeekday + dayNum - 1) % 7;
      var holidayName = Holidays.isHoliday(dk);

      if (weekday === 0 || holidayName) cell.classList.add("cell-sunday-holiday");
      if (weekday === 6) cell.classList.add("cell-saturday");
      if (dk === todayKey) cell.classList.add("cell-today");

      var dateLabel = document.createElement("div");
      dateLabel.className = "cell-date-label";
      dateLabel.textContent = dayNum + (holidayName ? " " + holidayName : "");
      cell.appendChild(dateLabel);

      var memberList = document.createElement("div");
      memberList.className = "cell-member-list";

      App.state.data.members.forEach(function (member) {
        var record = Storage.getRecord(App.state.data, dk, member.id);
        var memberRow = document.createElement("div");
        memberRow.className = "cell-member-row status-" + (record ? record.status : "未入力");

        var overtimeMin = record ? Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status) : 0;
        if (overtimeMin > 0) memberRow.classList.add("has-overtime");

        var timeText = "";
        if (record && record.status === "出勤" && record.clockIn && record.clockOut) {
          timeText = record.clockIn + "-" + record.clockOut;
        } else if (record) {
          timeText = record.status;
        }
        memberRow.textContent = member.name.charAt(0) + " " + timeText;

        memberRow.addEventListener("click", (function (dkClosure, memberIdClosure) {
          return function () {
            if (typeof openEditModal === "function") openEditModal(dkClosure, memberIdClosure);
          };
        })(dk, member.id));

        memberList.appendChild(memberRow);
      });

      cell.appendChild(memberList);
    } else {
      cell.classList.add("cell-empty");
    }

    row.appendChild(cell);
    if ((i + 1) % 7 === 0) {
      grid.appendChild(row);
      row = document.createElement("div");
      row.className = "calendar-row";
    }
  }
}
