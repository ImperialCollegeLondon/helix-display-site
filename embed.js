(function () {
  const messageType = "helix-display-site:resize";
  let frameRequest = 0;

  function isEmbedded() {
    return window.parent && window.parent !== window;
  }

  function getPageHeight() {
    const body = document.body;
    const html = document.documentElement;

    return Math.ceil(Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      html ? html.clientHeight : 0,
      html ? html.scrollHeight : 0,
      html ? html.offsetHeight : 0
    ));
  }

  function postHeight() {
    frameRequest = 0;

    if (!isEmbedded()) {
      return;
    }

    window.parent.postMessage({
      type: messageType,
      height: getPageHeight(),
      href: window.location.href
    }, "*");
  }

  function scheduleResize() {
    if (frameRequest) {
      window.cancelAnimationFrame(frameRequest);
    }

    frameRequest = window.requestAnimationFrame(postHeight);
  }

  window.HelixEmbed = {
    messageType,
    scheduleResize
  };

  window.addEventListener("load", scheduleResize);
  window.addEventListener("resize", scheduleResize);

  window.addEventListener("message", event => {
    if (event.data && event.data.type === "helix-display-site:measure") {
      scheduleResize();
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    const mutationObserver = new MutationObserver(scheduleResize);
    mutationObserver.observe(document.body, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true
    });

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(scheduleResize);
      resizeObserver.observe(document.documentElement);
      resizeObserver.observe(document.body);
    }

    document.querySelectorAll("img").forEach(image => {
      image.addEventListener("load", scheduleResize);
      image.addEventListener("error", scheduleResize);
    });

    scheduleResize();
  });
})();
