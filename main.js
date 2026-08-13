document.addEventListener("DOMContentLoaded", function () {
  initState();
  renderAll();

  document.getElementById("prevMonthBtn").addEventListener("click", function () { changeMonth(-1); });
  document.getElementById("nextMonthBtn").addEventListener("click", function () { changeMonth(1); });
  document.getElementById("todayBtn").addEventListener("click", goToToday);
  document.getElementById("fillWeekdaysBtn").addEventListener("click", fillWeekdaysForMonth);

  document.getElementById("memberSettingsBtn").addEventListener("click", openMemberModal);
  document.getElementById("memberCloseBtn").addEventListener("click", closeMemberModal);
  document.getElementById("addMemberBtn").addEventListener("click", addMemberFromForm);

  document.getElementById("reportBtn").addEventListener("click", openReportModal);
  document.getElementById("reportCloseBtn").addEventListener("click", closeReportModal);
  document.getElementById("reportMemberSelect").addEventListener("change", renderReportContent);

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
});
