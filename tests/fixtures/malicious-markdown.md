# Content security fixture

Safe content remains visible.

<script>window.__nightOwlMarkdownXss = 'script';</script>
<p id="event-handler" onclick="window.__nightOwlMarkdownXss = 'click'">Event handler target</p>
<a id="unsafe-link" href="javascript:window.__nightOwlMarkdownXss = 'link'" target="_blank">Unsafe link</a>
<img id="unsafe-image" src="data:text/html;base64,PHNjcmlwdD4=" onerror="window.__nightOwlMarkdownXss = 'image'">
<iframe id="unsafe-frame" src="https://attacker.example/embed" srcdoc="<script>window.__nightOwlMarkdownXss = 'frame'</script>"></iframe>
<iframe id="allowed-frame" src="https://www.youtube-nocookie.com/embed/abc123" sandbox="allow-top-navigation"></iframe>
<img id="local-image" src="./fixture-image.png" alt="Local fixture image">

```notes
<p id="notes-event-handler" onclick="window.__nightOwlMarkdownXss = 'notes-click'">Safe speaker-note text remains visible.</p>
<img id="notes-unsafe-image" src="invalid://notes-image" onerror="window.__nightOwlMarkdownXss = 'notes-image'">
```

---

# Second safe slide

The presentation parser completed.
