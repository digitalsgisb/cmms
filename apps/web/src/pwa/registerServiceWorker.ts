export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("/sw.js")
      .then((registration) => {
        void registration.update();
        window.setInterval(() => void registration.update(), 60 * 60 * 1000);
      })
      .catch((error) => {
        console.info("Service worker registration skipped.", error);
      });
  });
}
