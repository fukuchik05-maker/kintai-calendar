document.addEventListener("DOMContentLoaded", async function () {
  await initState();
  syncViewModeUI();
  autoFillWeekdaysForCurrentMonth();
  renderAll();

  document.getElementById("appTitle").innerHTML =
    "勤怠管理カレンダー<span class=\"app-title-version\">v" + APP_VERSION + "</span>";

  document.getElementById("prevMonthBtn").addEventListener("click", function () { changeMonth(-1); });
  document.getElementById("nextMonthBtn").addEventListener("click", function () { changeMonth(1); });
  document.getElementById("todayBtn").addEventListener("click", goToToday);
  document.getElementById("viewToggleBtn").addEventListener("click", toggleViewMode);
  document.getElementById("refreshBtn").addEventListener("click", refreshFromCloud);
  document.getElementById("fillWeekdaysBtn").addEventListener("click", fillWeekdaysForMonth);
  document.getElementById("punchNowBtn").addEventListener("click", punchNow);
  document.getElementById("punchHistoryBtn").addEventListener("click", openPunchHistoryModal);
  document.getElementById("punchHistoryCloseBtn").addEventListener("click", closePunchHistoryModal);

  document.getElementById("memberSettingsBtn").addEventListener("click", openMemberModal);
  document.getElementById("memberCloseBtn").addEventListener("click", closeMemberModal);
  document.getElementById("addMemberBtn").addEventListener("click", addMemberFromForm);
  document.getElementById("qrCloseBtn").addEventListener("click", closeQrModal);

  document.getElementById("reportBtn").addEventListener("click", openReportModal);
  document.getElementById("reportCloseBtn").addEventListener("click", closeReportModal);
  document.getElementById("reportSummaryTabBtn").addEventListener("click", function () { switchReportTab("summary"); });
  document.getElementById("reportTrendTabBtn").addEventListener("click", function () { switchReportTab("trend"); });

  document.getElementById("editStatus").addEventListener("change", onEditStatusChange);
  document.getElementById("editSaveBtn").addEventListener("click", saveEditModal);
  document.getElementById("editDeleteBtn").addEventListener("click", deleteEditRecord);
  document.getElementById("editCancelBtn").addEventListener("click", closeEditModal);

  document.getElementById("csvExportBtn").addEventListener("click", exportCsv);
  document.getElementById("backupExportBtn").addEventListener("click", exportBackup);
  document.getElementById("backupImportBtn").addEventListener("click", function () {
    document.getElementById("backupFileInput").click();
  });
  document.getElementById("backupFileInput").addEventListener("change", function (e) {
    if (e.target.files && e.target.files[0]) {
      importBackupFile(e.target.files[0]);
      e.target.value = "";
    }
  });

  document.getElementById("versionInfoBtn").addEventListener("click", openVersionModal);
  document.getElementById("versionCloseBtn").addEventListener("click", closeVersionModal);
  document.getElementById("versionTabBtn").addEventListener("click", function () { switchVersionTab("version"); });
  document.getElementById("historyTabBtn").addEventListener("click", function () { switchVersionTab("history"); });
});
