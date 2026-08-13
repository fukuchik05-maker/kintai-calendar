(function (root) {
  "use strict";

  var STORAGE_KEY = "kintai-data-v1";

  function defaultData() {
    return { members: [], records: {}, dayNotes: {} };
  }

  function loadData() {
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return defaultData();
    }
    if (!raw) return defaultData();
    try {
      var parsed = JSON.parse(raw);
      if (!parsed.members) parsed.members = [];
      if (!parsed.records) parsed.records = {};
      if (!parsed.dayNotes) parsed.dayNotes = {};
      return parsed;
    } catch (e) {
      return defaultData();
    }
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function generateMemberId(existingMembers) {
    var maxNum = 0;
    existingMembers.forEach(function (m) {
      var match = /^m(\d+)$/.exec(m.id);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    return "m" + (maxNum + 1);
  }

  function addMember(data, name, grantedLeaveDays) {
    var id = generateMemberId(data.members);
    data.members.push({ id: id, name: name, grantedLeaveDays: grantedLeaveDays });
    return id;
  }

  function updateMember(data, id, name, grantedLeaveDays) {
    var m = null;
    for (var i = 0; i < data.members.length; i++) {
      if (data.members[i].id === id) { m = data.members[i]; break; }
    }
    if (!m) return false;
    m.name = name;
    m.grantedLeaveDays = grantedLeaveDays;
    return true;
  }

  function removeMember(data, id) {
    data.members = data.members.filter(function (x) { return x.id !== id; });
    Object.keys(data.records).forEach(function (dk) {
      delete data.records[dk][id];
      if (Object.keys(data.records[dk]).length === 0) delete data.records[dk];
    });
  }

  function getRecord(data, dateKey, memberId) {
    return (data.records[dateKey] && data.records[dateKey][memberId]) || null;
  }

  function setRecord(data, dateKey, memberId, record) {
    if (!data.records[dateKey]) data.records[dateKey] = {};
    data.records[dateKey][memberId] = record;
  }

  function deleteRecord(data, dateKey, memberId) {
    if (data.records[dateKey]) {
      delete data.records[dateKey][memberId];
      if (Object.keys(data.records[dateKey]).length === 0) {
        delete data.records[dateKey];
      }
    }
  }

  function getDayNote(data, dateKey) {
    return (data.dayNotes && data.dayNotes[dateKey]) || "";
  }

  function setDayNote(data, dateKey, text) {
    if (!data.dayNotes) data.dayNotes = {};
    if (text) {
      data.dayNotes[dateKey] = text;
    } else {
      delete data.dayNotes[dateKey];
    }
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    defaultData: defaultData,
    loadData: loadData,
    saveData: saveData,
    generateMemberId: generateMemberId,
    addMember: addMember,
    updateMember: updateMember,
    removeMember: removeMember,
    getRecord: getRecord,
    setRecord: setRecord,
    deleteRecord: deleteRecord,
    getDayNote: getDayNote,
    setDayNote: setDayNote
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Storage = api;
  }
})(typeof window !== "undefined" ? window : this);
