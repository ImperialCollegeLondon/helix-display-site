(function () {
  const messageType = "helix-display-site:resize";
  let frameRequest = 0;
  let resizeTimer = 0;

  // The filters the table understands, in a fixed order so the same view
  // always produces the same shareable link.
  const FILTER_KEYS = ["theme", "project", "keyword"];

  function filterParams(params) {
    const filters = new URLSearchParams();
    FILTER_KEYS.forEach(key => {
      const value = params.get(key);
      if (value) {
        filters.set(key, value);
      }
    });
    return filters.toString();
  }

  // Deep links on the site itself: #entry=<id> or #keyword=<name> on the
  // homepage redirect to the matching page (mirrors the parent-page embed).
  (function handleDeepLinkHash() {
    const path = window.location.pathname.split("/").pop() || "index.html";
    if (path !== "index.html") {
      return;
    }

    const hash = window.location.hash.slice(1);
    if (/^\d+$/.test(hash)) {
      window.location.replace("entry.html?ref=" + encodeURIComponent(hash));
    } else if (hash.indexOf("entry=") === 0) {
      window.location.replace("entry.html?id=" + encodeURIComponent(decodeURIComponent(hash.slice(6))));
    } else {
      // Theme, project and keyword all filter the main table. They can be
      // combined ("#theme=Dementia&project=Minder"), so the hash is read as a
      // query string and passed straight through rather than handled one at a
      // time. Nothing here opens a differently designed page.
      const filters = filterParams(new URLSearchParams(hash));
      if (filters) {
        window.location.replace("index.html?" + filters);
      }
    }
  })();

  function isEmbedded() {
    return window.parent && window.parent !== window;
  }

  // Lets the stylesheet suppress scrollbars only when embedded (the parent
  // page grows the iframe to fit, so an internal scrollbar is never wanted).
  if (isEmbedded()) {
    document.documentElement.classList.add("is-embedded");
  }

  function getPageHeight() {
    const body = document.body;

    if (!body) {
      return 0;
    }

    // Measure the content only. The <html> element's clientHeight/scrollHeight
    // are at least the height of the iframe itself, so including them meant the
    // reported height could only ever grow — leaving white space under short
    // pages. Measuring the body (plus its bottom margin) lets the frame shrink.
    const rect = body.getBoundingClientRect();
    const marginBottom = parseFloat(getComputedStyle(body).marginBottom) || 0;

    return Math.ceil(Math.max(
      body.scrollHeight,
      body.offsetHeight,
      rect.height + marginBottom
    ));
  }

  function postHeight() {
    if (frameRequest) {
      window.cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    }

    if (resizeTimer) {
      window.clearTimeout(resizeTimer);
      resizeTimer = 0;
    }

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
    // Both a frame callback and a timer: requestAnimationFrame is smoother,
    // but browsers pause it while the iframe is scrolled out of view, which
    // would leave an embed below the fold never reporting its height. The
    // timer keeps working in that case; whichever fires first cancels the other.
    if (frameRequest) {
      window.cancelAnimationFrame(frameRequest);
    }

    if (resizeTimer) {
      window.clearTimeout(resizeTimer);
    }

    frameRequest = window.requestAnimationFrame(postHeight);
    resizeTimer = window.setTimeout(postHeight, 120);
  }

  const navigateMessageType = "helix-display-site:navigate";

  function postNavigation(options) {
    if (!isEmbedded()) {
      return;
    }

    // Used directly as a DOMContentLoaded listener, so the argument may be an
    // Event rather than an options object.
    const settings = (options && !(options instanceof Event)) ? options : {};

    const path = window.location.pathname.split("/").pop() || "index.html";
    const params = new URLSearchParams(window.location.search);
    // Only ask the parent to scroll when this page was reached from another
    // page of the tool (e.g. clicking a row, or the back link on a detail
    // page). On first load the reader hasn't clicked anything, so moving the
    // parent page would be unwelcome.
    let cameFromInsideFrame = false;
    try {
      cameFromInsideFrame = Boolean(document.referrer) &&
        new URL(document.referrer).origin === window.location.origin;
    } catch {
      cameFromInsideFrame = false;
    }

    const message = {
      type: navigateMessageType,
      page: "index",
      scrollToTop: settings.scrollToTop === undefined
        ? cameFromInsideFrame
        : settings.scrollToTop
    };

    if (path === "entry.html" && (params.get("ref") || params.get("id"))) {
      message.page = "entry";
      if (params.get("ref")) {
        message.ref = params.get("ref");
      }
      if (params.get("id")) {
        message.id = params.get("id");
      }
    } else if (path === "keyword.html" && params.get("keyword")) {
      message.page = "keyword";
      message.keyword = params.get("keyword");
    } else {
      const filters = filterParams(params);
      if (filters) {
        message.page = "index";
        message.filters = filters;
        // Kept for the embed block already live on helixcentre.com, which only
        // knows about keywords. Harmless for the newer block, which reads
        // message.filters.
        if (params.get("keyword")) {
          message.keyword = params.get("keyword");
        }
      }
    }

    window.parent.postMessage(message, "*");
  }

  window.HelixEmbed = {
    messageType,
    navigateMessageType,
    scheduleResize,
    // Called by the table after a filter is added or removed, so the parent
    // page's address bar keeps matching what is on screen.
    notifyNavigation: () => postNavigation({ scrollToTop: false })
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
