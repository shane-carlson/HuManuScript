import assert from "node:assert/strict";
import { test } from "node:test";
import { waterLine, waterReminderTimes } from "./water.ts";

const at = (hours: number, minutes = 0, day = 9) => new Date(2026, 10, day, hours, minutes, 0, 0);
const clock = (date: Date) => `${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

test("phone reminders run every gap from the last drink until 9pm, then all of tomorrow from 8", () => {
  const times = waterReminderTimes(at(18, 30), at(18, 10).getTime(), 60);
  assert.deepEqual(
    times.filter((time) => !time.tomorrow).map((time) => clock(time.at)),
    ["9 19:11", "9 20:11"],
  );
  const tomorrow = times.filter((time) => time.tomorrow).map((time) => clock(time.at));
  assert.equal(tomorrow.length, 13);
  assert.equal(tomorrow[0], "10 08:00");
  assert.equal(tomorrow.at(-1), "10 20:00");
});

test("a reminder already overdue comes a minute from now, not in the past", () => {
  const times = waterReminderTimes(at(14, 0), at(9, 0).getTime(), 120);
  assert.equal(clock(times[0].at), "9 14:01");
  assert.equal(clock(times[1].at), "9 16:01");
});

test("before 8am nothing comes until the water day starts", () => {
  const times = waterReminderTimes(at(6, 15), 0, 120);
  assert.equal(clock(times[0].at), "9 08:01");
  assert.ok(times.every((time) => time.at.getHours() >= 8 && time.at.getHours() < 21));
});

test("a finished day gets no more reminders today, and tomorrow starts fresh", () => {
  const times = waterReminderTimes(at(13, 0), at(12, 50).getTime(), 60, true);
  assert.ok(times.length > 0);
  assert.ok(times.every((time) => time.tomorrow));
});

test("reminders turned off plan nothing", () => {
  assert.deepEqual(waterReminderTimes(at(10, 0), 0, 0), []);
});

test("each planned reminder carries the count as it will read at that hour", () => {
  const [first] = waterReminderTimes(at(15, 0), at(14, 30).getTime(), 60);
  assert.equal(waterLine(24, 64, "oz", first.at), "You’re at 24 of 64 oz. About 37 by now would be on pace, so have a glass.");
  assert.equal(waterLine(0, 64, "oz", at(8, 0, 10)), "Nothing logged yet today. 64 oz to go.");
});
