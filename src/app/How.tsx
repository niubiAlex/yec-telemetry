"use client";
import { useState, type ReactNode } from "react";

/** A small 「怎么算」 button with a popover. It sits inside <summary>, so clicks must not toggle the parent <details>. */
export function How({ children, right }: { children: ReactNode; right?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`how${open ? " open" : ""}${right ? " right" : ""}`} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}>ⓘ 怎么算</button>
      <span className="pop" role="note">{children}</span>
    </span>
  );
}
