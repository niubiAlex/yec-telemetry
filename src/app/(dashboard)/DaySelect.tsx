"use client";

/** The day picker: choosing a day loads it, so the select never shows a day the tiles are not showing. */
export function DaySelect({ days, day, today, yesterday }: { days: string[]; day: string; today: string; yesterday: string }) {
  return (
    <select id="day" name="day" defaultValue={day} autoComplete="off" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {[...days].reverse().map((d) => (
        <option key={d} value={d}>{d}{d === today ? "（今天，未完）" : d === yesterday ? "（昨天）" : ""}</option>
      ))}
    </select>
  );
}
