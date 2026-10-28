"use client";

import { useEffect } from "react";

/** Posts one homepage stats hit; never blocks or throws. /api/hit drops unknown names and props. */
export function track(name: string, props: Record<string, string> = {}) {
  try {
    const body = JSON.stringify({ name, props });
    if (navigator.sendBeacon?.("/api/hit", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/hit", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  } catch {}
}

/**
 * The page view (referrer host and utm_* only, no path or query), the first
 * play of each video, the join section coming into view, and clicks on
 * elements with data-track (join_click with data-from, download_click with
 * data-platform).
 */
export function Track() {
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    let ref = "";
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.host !== location.host) ref = r.hostname;
    } catch {}
    track("view", {
      ref, utm_source: qs.get("utm_source") ?? "", utm_medium: qs.get("utm_medium") ?? "", utm_campaign: qs.get("utm_campaign") ?? "",
    });

    const played = new Set<string>();
    const onPlay = (e: Event) => {
      const id = (e.target as Element).closest?.(".vcard")?.id.replace(/^video-/, "");
      if (id && !played.has(id)) { played.add(id); track("video_play", { video: id }); }
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.<HTMLElement>("[data-track]");
      if (el?.dataset.track === "join_click") track("join_click", { from: el.dataset.from ?? "" });
      else if (el?.dataset.track === "download_click") track("download_click", { platform: el.dataset.platform ?? "" });
    };
    document.addEventListener("play", onPlay, true);
    document.addEventListener("click", onClick, true);

    const join = document.querySelector("#join .qrcard") ?? document.getElementById("join");
    const io = join && "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
        if (entries.some((x) => x.isIntersecting)) { track("join_view"); io?.disconnect(); }
      }, { threshold: 0.5 })
      : null;
    if (join) io?.observe(join);

    return () => {
      document.removeEventListener("play", onPlay, true);
      document.removeEventListener("click", onClick, true);
      io?.disconnect();
    };
  }, []);
  return null;
}
