function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function dateKeyOf(year, month, day) {
  return year + "-" + pad2(month) + "-" + pad2(day);
}

function findMemberByEmployeeCode(members, code) {
  for (var i = 0; i < members.length; i++) {
    if (members[i].employeeCode && members[i].employeeCode === code) return members[i];
  }
  return null;
}

var kioskData = null;

function showKioskMessage(text, isError) {
  var el = document.getElementById("kioskMessage");
  el.textContent = text;
  el.className = "kiosk-message" + (isError ? " kiosk-message-error" : " kiosk-message-success");
}

function focusKioskInput() {
  var input = document.getElementById("kioskInput");
  input.value = "";
  input.focus();
}

async function handleKioskScan(code) {
  var trimmed = code.trim();
  if (!trimmed) return;

  var member = findMemberByEmployeeCode(kioskData.members, trimmed);
  if (!member) {
    showKioskMessage("職員コード「" + trimmed + "」に一致するメンバーが見つかりません", true);
    focusKioskInput();
    return;
  }

  var now = new Date();
  var todayKey = dateKeyOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
  var nowTime = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
  var field = Calc.determinePunchField(now);

  // ローカルのkioskDataがどれだけ古くても他の欄を消さないよう、Firestoreの現在値を
  // 取り直してから該当欄だけを更新する専用の経路(punchRecord)を使う。
  var record = await Storage.punchRecord(kioskData, todayKey, member.id, member.name, field, nowTime, "kiosk");
  if (!record) {
    focusKioskInput();
    return;
  }

  var label = field === "clockIn" ? "出勤" : "退勤";
  showKioskMessage(member.name + "さん " + label + " " + nowTime + " を記録しました", false);
  focusKioskInput();
}

document.addEventListener("DOMContentLoaded", async function () {
  kioskData = await Storage.loadData();

  var input = document.getElementById("kioskInput");
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      handleKioskScan(input.value);
    }
  });
  focusKioskInput();

  // 他端末での職員コード追加・変更を取りこぼさないよう、5分おきにメンバー一覧だけ再取得する
  setInterval(async function () {
    var fresh = await Storage.loadData();
    kioskData.members = fresh.members;
  }, 5 * 60 * 1000);
});
