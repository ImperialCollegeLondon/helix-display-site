(function () {
  const messageType = "helix-display-site:resize";
  let frameRequest = 0;

  // Deep links on the site itself: #entry=<id> or #keyword=<name> on the
  // homepage redirect to the matching page (mirrors the parent-page embed).
  (function handleDeepLinkHash() {
    const path = window.location.pathname.split("/").pop() || "index.html";
    if (path !== "index.html") {
      return;
    }

    const hash = window.location.hash.slice(1);
    if (hash.indexOf("entry=") === 0) {
      window.location.replace("entry.html?id=" + encodeURIComponent(decodeURIComponent(hash.slice(6))));
    } else if (hash.indexOf("keyword=") === 0) {
      window.location.replace("keyword.html?keyword=" + encodeURIComponent(decodeURIComponent(hash.slice(8))));
    }
  })();

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

  const navigateMessageType = "helix-display-site:navigate";

  function postNavigation() {
    if (!isEmbedded()) {
      return;
    }

    const path = window.location.pathname.split("/").pop() || "index.html";
    const params = new URLSearchParams(window.location.search);
    const message = { type: navigateMessageType, page: "index" };

    if (path === "entry.html" && params.get("id")) {
      message.page = "entry";
      message.id = params.get("id");
    } else if (path === "keyword.html" && params.get("keyword")) {
      message.page = "keyword";
      message.keyword = params.get("keyword");
    } else if (params.get("keyword")) {
      message.page = "index";
      message.keyword = params.get("keyword");
    }

    window.parent.postMessage(message, "*");
  }

  window.HelixEmbed = {
    messageType,
    navigateMessageType,
    scheduleResize
  };

  window.addEventListener("load", scheduleResize);
  document.addEventListener("DOMContentLoaded", postNavigation);
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
