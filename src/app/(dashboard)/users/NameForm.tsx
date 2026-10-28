import { NAME_MAX } from "@/lib/users";

/** Inline 备注名 editor; posts to /api/users/name and comes back to `back`. */
export function NameForm({ deviceId, name, back }: { deviceId: string; name: string | null; back: string }) {
  return (
    <form className="nameform" method="post" action="/api/users/name">
      <input type="hidden" name="device_id" value={deviceId} />
      <input type="hidden" name="back" value={back} />
      <input name="name" defaultValue={name ?? ""} maxLength={NAME_MAX} placeholder="备注名" aria-label="备注名" autoComplete="off" />
      <button type="submit">保存</button>
    </form>
  );
}
