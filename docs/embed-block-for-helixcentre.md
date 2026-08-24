# Publication Summaries — embed block for helixcentre.com

For whoever maintains the `helixcentre.com/publications` page.

**Replace the whole existing block** with the one below. The script finds the iframe by `id`, so the two parts have to stay together.

Only the deep-link handling has changed. The iframe tag itself is unchanged — if the existing tag matches, it can be left alone and only the `<script>` replaced.

---

## What changed and why

Readers can filter the table by **theme**, **project** and **keyword**. The old block only understood keywords, and sent them to a separate page that has since been retired.

Two changes:

1. **Reading the URL on load.** The hash is now parsed as a query string, so any combination of `#theme=` `#project=` `#keyword=` opens the table filtered accordingly — for example `#theme=Dementia&project=Minder`. Previously only `#keyword=` was recognised, and it opened a different page.

2. **Writing the URL as the reader filters.** The embed now sends the full set of active filters (`data.filters`), so the address bar keeps matching what's on screen and a filtered view can be copied and shared. The old `data.keyword` branch is kept so nothing breaks during the changeover.

Everything else — the resize behaviour, the `#001` short-reference links, and the scroll handling — is untouched.

---

## The block

The changed lines are marked `CHANGED` / `NEW`.

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
    // combination of #theme= #project= #keyword=, which open the filtered table.
    var filterKeys = ["theme", "project", "keyword"];              // NEW

    function filterParams(params) {                                // NEW
      var filters = new URLSearchParams();                         // NEW
      filterKeys.forEach(function (key) {                          // NEW
        if (params.get(key)) filters.set(key, params.get(key));    // NEW
      });                                                          // NEW
      return filters.toString();                                   // NEW
    }                                                              // NEW

    var hash = window.location.hash.slice(1);
    if (/^\d+$/.test(hash)) {
      iframe.src = base + "entry.html?ref=" + encodeURIComponent(hash);
    } else if (hash.indexOf("entry=") === 0) {
      iframe.src = base + "entry.html?id=" + encodeURIComponent(decodeURIComponent(hash.slice(6)));
    } else if (hash) {                                             // CHANGED
      var filters = filterParams(new URLSearchParams(hash));       // CHANGED
      if (filters) iframe.src = base + "index.html?" + filters;    // CHANGED
    }

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
        } else if (data.filters) {                                 // NEW
          // "theme=Dementia&project=Minder" — already encoded by the iframe.
          newHash = data.filters;                                  // NEW
        } else if (data.keyword) {                                 // CHANGED
          newHash = "keyword=" + encodeURIComponent(data.keyword);
        }
        history.replaceState(null, "", newHash ? "#" + newHash : window.location.pathname + window.location.search);

        if (data.scrollToTop) {
          iframe.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      }
    });
  })();
</script>
```

The `// NEW` and `// CHANGED` comments are only there to show what moved. They can be deleted, or left in — they're valid JavaScript comments either way.

---

## For the previous version

These three lines were removed:

```js
    } else if (hash.indexOf("keyword=") === 0) {
      iframe.src = base + "keyword.html?keyword=" + encodeURIComponent(decodeURIComponent(hash.slice(8)));
    }
```

and this condition was narrowed, because `data.page` is no longer used to decide the hash:

```js
        } else if ((data.page === "keyword" || data.page === "index") && data.keyword) {
```

---

## How to check it worked

With the new block in place, on `helixcentre.com/publications`:

1. Click a **theme** in the table. The address bar should become `…/publications#theme=Dementia`, and a removable chip should appear above the table.
2. Copy that URL, open it in a new tab. The table should load already filtered, with the chip showing.
3. Add a **project** filter as well. The address bar should show both, e.g. `#theme=Dementia&project=Minder`.
4. Click a row to open a summary. The address bar should become `…/publications#001`, and that link should open the same summary in a new tab.
5. Confirm the frame still grows and shrinks with the content, and there is no scrollbar inside it.

If step 1 shows a URL but step 2 loads the unfiltered table, the script half of the block hasn't been replaced.

---

Questions to Tori Simpson, victoria.simpson22@imperial.ac.uk.
