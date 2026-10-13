import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { readPageScroll, restorePageScroll, type PageScrollPosition } from "../utils/scrollRestoration";

const positions = new Map<string, PageScrollPosition>();
const top: PageScrollPosition = { windowX: 0, windowY: 0, mainX: 0, mainY: 0, tables: [] };

export function usePageScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const page = location.pathname === "/performance" ? `${location.pathname}:${new URLSearchParams(location.search).get("focus") || "all"}` : location.pathname;
  const previous = useRef<{ key: string; page: string }>();

  useLayoutEffect(() => {
    const previousPolicy = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previousPolicy; };
  }, []);

  useLayoutEffect(() => {
    const last = previous.current;
    const samePage = last?.page === page;
    const target = navigationType === "POP" ? positions.get(location.key) || top
      : samePage && last ? positions.get(last.key) || readPageScroll() : top;
    previous.current = { key: location.key, page };
    let restoring = true;
    positions.set(location.key, target);
    const stop = restorePageScroll(target, () => { restoring = false; });
    const save = () => { if (!restoring) positions.set(location.key, readPageScroll()); };
    window.addEventListener("scroll", save, true);
    if (positions.size > 120) positions.delete(positions.keys().next().value!);
    return () => {
      window.removeEventListener("scroll", save, true);
      stop();
    };
  }, [location.key, page, navigationType]);
}
