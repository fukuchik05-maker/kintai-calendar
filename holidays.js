(function (root) {
  "use strict";

  var FIXED_HOLIDAYS = [
    [1, 1, "元日"],
    [2, 11, "建国記念の日"],
    [2, 23, "天皇誕生日"],
    [4, 29, "昭和の日"],
    [5, 3, "憲法記念日"],
    [5, 4, "みどりの日"],
    [5, 5, "こどもの日"],
    [8, 11, "山の日"],
    [11, 3, "文化の日"],
    [11, 23, "勤労感謝の日"]
  ];

  var NTH_MONDAY_HOLIDAYS = [
    [1, 2, "成人の日"],
    [7, 3, "海の日"],
    [9, 3, "敬老の日"],
    [10, 2, "スポーツの日"]
  ];

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function dateKey(year, month, day) {
    return year + "-" + pad2(month) + "-" + pad2(day);
  }

  function nthMondayOfMonth(year, month, nth) {
    var d = new Date(year, month - 1, 1);
    var offset = (1 - d.getDay() + 7) % 7;
    var firstMonday = 1 + offset;
    return firstMonday + (nth - 1) * 7;
  }

  function vernalEquinoxDay(year) {
    // 1980-2099年で有効な近似式(国立天文台の公表値と一致することを確認済み)
    return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  function autumnalEquinoxDay(year) {
    return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  function buildBaseHolidays(year) {
    var map = {};
    FIXED_HOLIDAYS.forEach(function (h) {
      map[dateKey(year, h[0], h[1])] = h[2];
    });
    NTH_MONDAY_HOLIDAYS.forEach(function (h) {
      var day = nthMondayOfMonth(year, h[0], h[1]);
      map[dateKey(year, h[0], day)] = h[2];
    });
    map[dateKey(year, 3, vernalEquinoxDay(year))] = "春分の日";
    map[dateKey(year, 9, autumnalEquinoxDay(year))] = "秋分の日";
    return map;
  }

  function addDays(y, m, d, delta) {
    var dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), weekday: dt.getDay() };
  }

  function applyCitizenHolidays(map, year) {
    var toAdd = {};
    Object.keys(map).forEach(function (key) {
      var parts = key.split("-").map(Number);
      var mid = addDays(parts[0], parts[1], parts[2], 1);
      var midKey = dateKey(mid.y, mid.m, mid.d);
      var after = addDays(mid.y, mid.m, mid.d, 1);
      var afterKey = dateKey(after.y, after.m, after.d);
      if (!map[midKey] && map[afterKey] && mid.weekday !== 0) {
        toAdd[midKey] = "国民の休日";
      }
    });
    Object.keys(toAdd).forEach(function (k) {
      map[k] = toAdd[k];
    });
  }

  function applySubstituteHolidays(map, year) {
    var keys = Object.keys(map).sort();
    keys.forEach(function (key) {
      var parts = key.split("-").map(Number);
      var weekday = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
      if (weekday !== 0) return;
      var next = addDays(parts[0], parts[1], parts[2], 1);
      var nextKey = dateKey(next.y, next.m, next.d);
      while (map[nextKey]) {
        next = addDays(next.y, next.m, next.d, 1);
        nextKey = dateKey(next.y, next.m, next.d);
      }
      map[nextKey] = "振替休日";
    });
  }

  var cache = {};
  function getHolidaysForYear(year) {
    if (cache[year]) return cache[year];
    var map = buildBaseHolidays(year);
    applyCitizenHolidays(map, year);
    applySubstituteHolidays(map, year);
    cache[year] = map;
    return map;
  }

  function isHoliday(dateStr) {
    var year = parseInt(dateStr.slice(0, 4), 10);
    var map = getHolidaysForYear(year);
    return map[dateStr] || null;
  }

  var api = {
    getHolidaysForYear: getHolidaysForYear,
    isHoliday: isHoliday
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Holidays = api;
  }
})(typeof window !== "undefined" ? window : this);
