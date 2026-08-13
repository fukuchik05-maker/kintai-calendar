var assert = require("assert");
var Storage = require("../storage.js");

function test(name, fn) {
  try {
    fn();
    console.log("OK: " + name);
  } catch (e) {
    console.error("FAIL: " + name);
    console.error(e);
    process.exitCode = 1;
  }
}

test("defaultData returns empty members and records", function () {
  var data = Storage.defaultData();
  assert.deepStrictEqual(data.members, []);
  assert.deepStrictEqual(data.records, {});
});

test("generateMemberId returns m1 for empty list and increments", function () {
  assert.strictEqual(Storage.generateMemberId([]), "m1");
  assert.strictEqual(Storage.generateMemberId([{ id: "m1" }, { id: "m2" }]), "m3");
  assert.strictEqual(Storage.generateMemberId([{ id: "m1" }, { id: "m5" }]), "m6");
});

test("addMember appends a member with generated id and returns the id", function () {
  var data = Storage.defaultData();
  var id = Storage.addMember(data, "田中", 20);
  assert.strictEqual(id, "m1");
  assert.strictEqual(data.members.length, 1);
  assert.strictEqual(data.members[0].name, "田中");
  assert.strictEqual(data.members[0].grantedLeaveDays, 20);
});

test("updateMember changes name and grantedLeaveDays", function () {
  var data = Storage.defaultData();
  var id = Storage.addMember(data, "田中", 20);
  var ok = Storage.updateMember(data, id, "田中太郎", 15);
  assert.strictEqual(ok, true);
  assert.strictEqual(data.members[0].name, "田中太郎");
  assert.strictEqual(data.members[0].grantedLeaveDays, 15);
});

test("updateMember returns false for unknown id", function () {
  var data = Storage.defaultData();
  assert.strictEqual(Storage.updateMember(data, "nope", "x", 0), false);
});

test("removeMember deletes member and their records", function () {
  var data = Storage.defaultData();
  var id = Storage.addMember(data, "田中", 20);
  Storage.setRecord(data, "2026-08-13", id, { status: "出勤" });
  Storage.removeMember(data, id);
  assert.strictEqual(data.members.length, 0);
  assert.strictEqual(Storage.getRecord(data, "2026-08-13", id), null);
});

test("setRecord/getRecord/deleteRecord round-trip correctly", function () {
  var data = Storage.defaultData();
  var id = Storage.addMember(data, "田中", 20);
  assert.strictEqual(Storage.getRecord(data, "2026-08-13", id), null);

  Storage.setRecord(data, "2026-08-13", id, { status: "出勤", clockIn: "08:30" });
  var record = Storage.getRecord(data, "2026-08-13", id);
  assert.strictEqual(record.status, "出勤");

  Storage.deleteRecord(data, "2026-08-13", id);
  assert.strictEqual(Storage.getRecord(data, "2026-08-13", id), null);
  assert.strictEqual(data.records["2026-08-13"], undefined);
});

console.log("storage.test.js done");
