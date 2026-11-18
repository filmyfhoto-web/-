/**
 * Detects that a newer build is live while the app stays open.
 *
 * The build writes `/version.json` (see vite-plugin-pwa-version.ts) with the
 * release tag. We poll it with `cache: "no-store"` and compare it to the tag
 * compiled into the running bundle — if they differ, a deploy happened and
 * the user is looking at an old shell.
 */
import { useEffect, useRef, useState } from "react";
import { BUILD_INFO } from "./buildInfo";

export const RUNNING_TAG = `${BUILD_INFO.version}-${BUILD_INFO.commit}`;

export type RemoteBuild = { tag: string; builtAt?: string };

/**
 * A tag is only comparable when it identifies a real release. Builds made
 * without git metadata fall back to the commit `local` (see
 * build-info.define.ts), so `1.2.0-local` can never be matched against
 * `1.2.0-<sha>` — treating it as "newer" made the app believe an update was
 * pending forever and reload itself in a loop.
 */
export function isComparableTag(tag: string | null | undefined): boolean {
  if (!tag || typeof tag !== "string") return false;
  const t = tag.trim().toLowerCase();
  if (!t) return false;
  return !(t === "local" || t === "dev" || t.endsWith("-local") || t.endsWith("-dev"));
}

/** True when the deployed tag is a real, different release. */
export function isNewerBuild(remoteTag: string | null | undefined, running = RUNNING_TAG): boolean {
  if (!isComparableTag(remoteTag) || !isComparableTag(running)) return false;
  return (remoteTag as string).trim() !== running.trim();
}

export async function fetchRemoteBuild(signal?: AbortSignal): Promise<RemoteBuild | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now().toString(36)}`, { cache: "no-store", signal });
    if (!res.ok) return null;
    const json = (await res.json()) as RemoteBuild;
    return json && typeof json.tag === "string" ? json : null;
  } catch {
    return null; // offline / dev server without the file — stay quiet
  }
}

/**
 * Polls for a new deploy (on mount, on focus/visibility, and hourly).
 * Returns the remote tag once it differs from the running bundle.
 */
export function useBuildUpdate(intervalMs = 30 * 60 * 1000) {
  const [remoteTag, setRemoteTag] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (busy.current || typeof document === "undefined") return;
      busy.current = true;
      const remote = await fetchRemoteBuild();
      busy.current = false;
      if (!alive) return;
      setCheckedAt(new Date());
      if (remote?.tag) setRemoteTag(remote.tag);
    };
    void check();
    const id = window.setInterval(check, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return { remoteTag, checkedAt, hasUpdate: isNewerBuild(remoteTag) };
}
