---
title: API reference
hide: [navigation, toc]
---

<iframe class="kf-reference" id="kf-reference" title="API reference"></iframe>
<noscript><iframe class="kf-reference" src="../api-reference.html" title="API reference"></iframe></noscript>
<script>
  // A link to an operation is this page plus Scalar's hash (#tag/<tag>/<METHOD><path>):
  // hand the hash to the reference inside the frame, now and when it changes.
  (function () {
    var frame = document.getElementById('kf-reference');
    frame.src = '../api-reference.html' + window.location.hash;
    window.addEventListener('hashchange', function () {
      try {
        if (frame.contentWindow.location.hash !== window.location.hash) {
          frame.contentWindow.location.hash = window.location.hash;
        }
      } catch (e) {
        frame.src = '../api-reference.html' + window.location.hash;
      }
    });
  })();
</script>

Download the spec: [`openapi.yaml`](openapi.yaml) — import it into Postman or your code generator.

To link to an endpoint, open it and copy the address from the browser, or use the link icon next to its title.
