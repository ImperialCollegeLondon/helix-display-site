# Publication Summaries — embed block for helixcentre.com

For whoever maintains the `helixcentre.com/publications` page.

**Replace the whole existing block** with the one below. The script finds the iframe by `id`, so the two parts have to stay together. The `<iframe>` tag itself is unchanged from the original — if yours matches, only the `<script>` needs replacing.

---

## What changed since the first version

1. **Filtering.** Readers can filter the table by theme, project, type of publication and keyword, and can group it with an "Organise by" control. Any combination travels in the address bar — `#theme=Dementia&project=Minder` — so a filtered view can be copied and shared. The old block only understood `#keyword=` and sent it to a page that has since been retired.

2. **The Back button.** Moving from the list to a summary now adds a history entry on *this* page, and going back tells the embed to show the list again. Without this, pressing Back on a phone leaves helixcentre.com altogether instead of returning to the publications list — browsers don't reliably record navigation that happens inside an iframe. Filter changes deliberately don't add entries, or the history would fill with near-identical ones.

Everything else — the resize behaviour, the `#001` short-reference links, the scroll handling — is unchanged.

---

## The block

```html
<iframe
  id="helix-publication-summaries-embed"
  title="Publication Summaries"
  src="https://imperialcollegelondon.github.io/helix-display-site/"
  loading="lazy"
  allowtransparency="true"
  referrerpolicy="strict-origin-when-cross-origin"
  style="width: 100%; min-height: 200px; border: 0; display: block; background: transparent;"
></iframe>

<script>
  (function () {
    var iframe = document.getElementById("helix-publication-summaries-embed");
    var allowedOrigin = "https://imperialcollegelondon.github.io";
    var base = allowedOrigin + "/helix-display-site/";

    // Deep links: #001 (short reference), #entry=<response id>, and any
    // combination of #theme= #project= #type= #keyword=, which open the filtered table.
    var filterKeys = ["theme", "project", "type", "keyword", "organise"];

    function filterParams(params) {
      var filters = new URLSearchParams();
      filterKeys.forEach(function (key) {
        if (params.get(key)) filters.set(key, params.get(key));
      });
      return filters.toString();
    }

    var hash = window.location.hash.slice(1);
    if (/^\d+$/.test(hash)) {
      iframe.src = base + "entry.html?ref=" + encodeURIComponent(hash);
    } else if (hash.indexOf("entry=") === 0) {
      iframe.src = base + "entry.html?id=" + encodeURIComponent(decodeURIComponent(hash.slice(6)));
    } else if (hash) {
      var filters = filterParams(new URLSearchParams(hash));
      if (filters) iframe.src = base + "index.html?" + filters;
    }

    // Which page of the embed a given hash means.
    function srcForHash(hash) {
      if (/^\d+$/.test(hash)) {
        return base + "entry.html?ref=" + encodeURIComponent(hash);
      }
      if (hash.indexOf("entry=") === 0) {
        return base + "entry.html?id=" + encodeURIComponent(decodeURIComponent(hash.slice(6)));
      }
      var filters = hash ? filterParams(new URLSearchParams(hash)) : "";
      return filters ? base + "index.html?" + filters : base + "index.html";
    }

    // The Back button. Inside an iframe the browser's own history is
    // unreliable — on some mobile browsers, going back from a summary leaves
    // the site entirely instead of returning to the list. So this page keeps
    // its own entry per view and tells the frame what to show.
    window.addEventListener("popstate", function () {
      iframe.contentWindow.postMessage(
        { type: "helix-display-site:show", path: srcForHash(window.location.hash.slice(1)) },
        allowedOrigin
      );
    });

    window.addEventListener("message", function (event) {
      if (event.origin !== allowedOrigin) return;
      var data = event.data || {};

      // Grow and shrink the frame to fit its content.
      if (data.type === "helix-display-site:resize" && typeof data.height === "number") {
        iframe.style.height = Math.max(200, Math.ceil(data.height)) + "px";
      }

      // Keep the page URL in step with what the reader is looking at.
      if (data.type === "helix-display-site:navigate") {
        var newHash = "";
        if (data.page === "entry" && (data.ref || data.id)) {
          newHash = data.ref ? String(data.ref) : "entry=" + encodeURIComponent(data.id);
        } else if (data.filters) {
          // "theme=Dementia&project=Minder" — already encoded by the iframe.
          newHash = data.filters;
        } else if (data.keyword) {
          newHash = "keyword=" + encodeURIComponent(data.keyword);
        }

        var url = newHash ? "#" + newHash : window.location.pathname + window.location.search;
        var changed = ("#" + window.location.hash.slice(1)) !== ("#" + newHash);

        // A new view gets its own history entry so Back returns to the list;
        // adding or removing a filter just updates the current one, or the
        // history would fill with near-identical entries.
        if (data.history === "push" && changed) {
          history.pushState(null, "", url);
        } else {
          history.replaceState(null, "", url);
        }

        if (data.scrollToTop) {
          iframe.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      }
    });
  })();
</script>
```

---

## How to check it worked

On `helixcentre.com/publications`:

1. Click a **theme** in the table. The address bar should become `…/publications#theme=Dementia`, with a removable chip above the table.
2. Copy that URL and open it in a new tab. The table should load already filtered.
3. Add a **project** filter too. The address bar should show both: `#theme=Dementia&project=Minder`.
4. Click a row to open a summary. The address bar should become `…/publications#001`, and that link should open the same summary in a new tab.
5. **Press the browser Back button.** You should return to the publications list — not to whatever site you were on before.
6. Confirm the frame still grows and shrinks with its content, with no scrollbar inside it.

If step 1 works but step 2 loads the unfiltered table, the `<script>` half wasn't replaced. If step 5 leaves the site, the same.

---

Questions to Tori Simpson, victoria.simpson22@imperial.ac.uk.
