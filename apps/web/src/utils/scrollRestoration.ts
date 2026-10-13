export type PageScrollPosition = {
  windowX: number;
  windowY: number;
  mainX: number;
  mainY: number;
  tables: number[];
};

export function readPageScroll(): PageScrollPosition {
  const main = document.getElementById("main-content");
  return {
    windowX: window.scrollX, windowY: window.scrollY,
    mainX: main?.scrollLeft ?? 0, mainY: main?.scrollTop ?? 0,
    tables: Array.from(main?.querySelectorAll<HTMLElement>(".performance-table-scroll") ?? []).map((table) => table.scrollLeft)
  };
}

// Async pages initially render a short loading message. Wait for their content
// to grow before restoring, rather than letting the browser clamp the position.
export function restorePageScroll(position: PageScrollPosition, onFinish: () => void) {
  const main = document.getElementById("main-content");
  let stopped = false;
  let resize: ResizeObserver | undefined;
  let mutation: MutationObserver | undefined;
  let timeout: number | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    resize?.disconnect();
    mutation?.disconnect();
    window.clearTimeout(timeout);
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.removeEventListener(event, stop, true);
    onFinish();
  };
  const attempt = () => {
    if (stopped) return;
    const scrolling = document.scrollingElement || document.documentElement;
    if (scrolling.scrollHeight - scrolling.clientHeight + 1 < position.windowY) return;
    if (main && main.scrollHeight - main.clientHeight + 1 < position.mainY) return;
    window.scrollTo({ left: position.windowX, top: position.windowY, behavior: "instant" });
    main?.scrollTo({ left: position.mainX, top: position.mainY, behavior: "instant" });
    main?.querySelectorAll<HTMLElement>(".performance-table-scroll").forEach((table, index) => { table.scrollLeft = position.tables[index] ?? 0; });
    stop();
  };
  resize = new ResizeObserver(attempt);
  resize.observe(document.documentElement);
  if (main) {
    resize.observe(main);
    if (main.firstElementChild) resize.observe(main.firstElementChild);
    mutation = new MutationObserver(() => {
      if (main.firstElementChild) resize?.observe(main.firstElementChild);
      attempt();
    });
    mutation.observe(main, { childList: true, subtree: true });
  }
  for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) window.addEventListener(event, stop, { capture: true, passive: true });
  timeout = window.setTimeout(stop, 10000);
  attempt();
  return stop;
}
