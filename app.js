var App = {
  state: {
    year: null,
    month: null,
    data: null,
    editingContext: null,
    viewMode: "gantt" // "calendar" または "gantt"。既定は一覧表示
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

function isDateOff(dateKey) {
  var parts = dateKey.split("-").map(Number);
  var weekday = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  return weekday === 0 || weekday === 6 || !!Holidays.isHoliday(dateKey);
}

function makeTimePart(text, isOvertime) {
  if (!isOvertime) return document.createTextNode(text);
  var span = document.createElement("span");
  span.className = "overtime-part";
  span.textContent = text;
  return span;
}

async function initState() {
  var now = new Date();
  App.state.year = now.getFullYear();
  App.state.month = now.getMonth() + 1;
  App.state.data = await Storage.loadData();
}

async function refreshFromCloud() {
  App.state.data = await Storage.loadData();
  renderAll();
}

function persistAndRerender() {
  Storage.saveData(App.state.data);
  renderAll();
}

function renderAll() {
  document.getElementById("currentMonthLabel").textContent = App.state.year + "年" + App.state.month + "月";
  if (App.state.viewMode === "gantt") {
    if (typeof renderGanttView === "function") renderGanttView();
  } else {
    renderCalendar();
  }
  if (typeof renderSummary === "function") renderSummary();
}

function syncViewModeUI() {
  document.getElementById("calendarGrid").classList.toggle("hidden", App.state.viewMode !== "calendar");
  document.getElementById("ganttWrap").classList.toggle("hidden", App.state.viewMode !== "gantt");
  document.getElementById("viewToggleBtn").textContent = App.state.viewMode === "calendar" ? "一覧表示" : "カレンダー表示";
}

function toggleViewMode() {
  App.state.viewMode = App.state.viewMode === "calendar" ? "gantt" : "calendar";
  syncViewModeUI();
  renderAll();
}

function changeMonth(delta) {
  var m = App.state.month + delta;
  var y = App.state.year;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  App.state.month = m;
  App.state.year = y;
  autoFillWeekdaysForCurrentMonth();
  renderAll();
}

// 指定月の平日(祝日除く)のうち、まだ記録がない「日付×メンバー」の組み合わせを一覧にして返す(書き込みはしない)
function computeWeekdayFillPending(year, month) {
  var total = daysInMonth(year, month);
  var firstDay = new Date(year, month - 1, 1);
  var startWeekday = firstDay.getDay();

  var pending = [];
  for (var d = 1; d <= total; d++) {
    var weekday = (startWeekday + d - 1) % 7;
    var dk = dateKeyOf(year, month, d);
    if (weekday === 0 || weekday === 6) continue;
    if (Holidays.isHoliday(dk)) continue;

    App.state.data.members.forEach(function (member) {
      if (Storage.getRecord(App.state.data, dk, member.id)) return; // 既存の記録は上書きしない
      pending.push({ dateKey: dk, memberId: member.id });
    });
  }
  return pending;
}

function applyWeekdayFillPending(pending) {
  pending.forEach(function (item) {
    Storage.setRecord(App.state.data, item.dateKey, item.memberId, {
      status: "出勤",
      clockIn: "08:30",
      clockOut: "17:30",
      breakMin: 60,
      hourlyLeaveHours: 0,
      note: ""
    });
  });
}

function fillWeekdaysForMonth() {
  var year = App.state.year, month = App.state.month;
  var pending = computeWeekdayFillPending(year, month);

  if (pending.length === 0) {
    alert("入力対象がありませんでした(すべての平日に記録済みです)。");
    return;
  }
  if (!confirm(year + "年" + month + "月の平日のうち、未入力の" + pending.length + "件に 08:30-17:30 出勤を入力します。よろしいですか？")) {
    return;
  }

  applyWeekdayFillPending(pending);
  persistAndRerender();
}

// 表示中の月の平日を、確認ダイアログなしで裏側から自動的に埋める。
// 既に記録がある日はそのままなので、有給・欠勤などを上書きする心配はない。
function autoFillWeekdaysForCurrentMonth() {
  var pending = computeWeekdayFillPending(App.state.year, App.state.month);
  if (pending.length === 0) return;
  applyWeekdayFillPending(pending);
  Storage.saveData(App.state.data);
}

function goToToday() {
  var now = new Date();
  App.state.year = now.getFullYear();
  App.state.month = now.getMonth() + 1;
  autoFillWeekdaysForCurrentMonth();
  renderAll();
}

function renderCalendar() {
  var year = App.state.year, month = App.state.month;

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

      var dateNumSpan = document.createElement("span");
      dateNumSpan.textContent = dayNum + (holidayName ? " " + holidayName : "");
      dateLabel.appendChild(dateNumSpan);

      var dayNote = Storage.getDayNote(App.state.data, dk);
      var dayNoteSpan = document.createElement("span");
      dayNoteSpan.className = "day-note" + (dayNote ? "" : " day-note-empty");
      dayNoteSpan.textContent = dayNote ? " " + dayNote : " +";
      dayNoteSpan.title = "クリックしてこの日のコメントを編集";
      dayNoteSpan.addEventListener("click", (function (dkClosure) {
        return function (e) {
          e.stopPropagation();
          if (typeof editDayNote === "function") editDayNote(dkClosure);
        };
      })(dk));
      dateLabel.appendChild(dayNoteSpan);

      cell.appendChild(dateLabel);

      var isDayOff = weekday === 0 || weekday === 6 || !!holidayName;

      var memberList = document.createElement("div");
      memberList.className = "cell-member-list";

      App.state.data.members.forEach(function (member) {
        var record = Storage.getRecord(App.state.data, dk, member.id);

        // 土日祝は既定で「休み」扱いのため、実際に記録がある人だけ表示する
        // (誰も入力していない土日祝に全員分の名前が並んでしまうのを防ぐ)
        if (isDayOff && !record) return;

        var memberRow = document.createElement("div");
        memberRow.className = "cell-member-row status-" + (record ? record.status : "未入力");

        memberRow.appendChild(document.createTextNode(member.name.charAt(0) + " "));

        if (record && record.status === "出勤" && record.clockIn && record.clockOut) {
          // 時間外(8:30より前 / 17:30より後)の側だけを色付けする。土日祝は出退勤の両方を残業色にする。
          var inMin = Calc.timeToMinutes(record.clockIn);
          var outMin = Calc.timeToMinutes(record.clockOut);
          var isEarly = isDayOff || inMin < Calc.STANDARD_START_MIN;
          var isLate = isDayOff || outMin > Calc.STANDARD_END_MIN;

          memberRow.appendChild(makeTimePart(record.clockIn, isEarly));
          memberRow.appendChild(document.createTextNode("-"));
          memberRow.appendChild(makeTimePart(record.clockOut, isLate));

          var overtimeMin = Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status, isDayOff, record.breakMin);
          if (overtimeMin > 0) {
            var overtimeSpan = document.createElement("span");
            overtimeSpan.className = "overtime-badge";
            overtimeSpan.textContent = "+" + Calc.minutesToHoursLabel(overtimeMin);
            memberRow.appendChild(overtimeSpan);
          }
        } else if (record) {
          memberRow.appendChild(document.createTextNode(record.status));
        }

        if (record && record.note) {
          var noteSpan = document.createElement("span");
          noteSpan.className = "cell-note";
          noteSpan.textContent = " " + record.note;
          memberRow.appendChild(noteSpan);
        }

        memberRow.addEventListener("click", (function (dkClosure, memberIdClosure) {
          return function () {
            if (typeof openEditModal === "function") openEditModal(dkClosure, memberIdClosure);
          };
        })(dk, member.id));

        memberList.appendChild(memberRow);
      });

      if (isDayOff) {
        var addRow = document.createElement("div");
        addRow.className = "cell-add-row";
        addRow.textContent = "+ 記録を追加";
        addRow.addEventListener("click", (function (dkClosure) {
          return function () { openDayMemberPicker(dkClosure); };
        })(dk));
        memberList.appendChild(addRow);
      }

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
