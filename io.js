function downloadTextFile(filename, content, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCsv() {
  var year = App.state.year, month = App.state.month;
  var keys = getMonthDateKeys(year, month);
  var rows = [];

  keys.forEach(function (dk) {
    App.state.data.members.forEach(function (member) {
      var record = Storage.getRecord(App.state.data, dk, member.id);
      if (!record) return;
      var workMin = Calc.calcActualWorkMinutes(record.clockIn, record.clockOut, record.breakMin);
      var overtimeMin = Calc.calcOvertimeMinutes(record.clockIn, record.clockOut, record.status);
      rows.push({
        date: dk,
        name: member.name,
        status: record.status,
        clockIn: record.clockIn,
        clockOut: record.clockOut,
        breakMin: record.breakMin,
        hourlyLeaveHours: record.hourlyLeaveHours,
        workLabel: Calc.minutesToHoursLabel(workMin),
        overtimeLabel: Calc.minutesToHoursLabel(overtimeMin),
        note: record.note
      });
    });
  });

  var csv = Calc.buildCsvContent(rows);
  var filename = year + "-" + pad2(month) + "-kintai.csv";
  var BOM = String.fromCharCode(0xFEFF); // Excelで開いた際に日本語が文字化けしないためのBOM
  downloadTextFile(filename, BOM + csv, "text/csv;charset=utf-8;");
}
