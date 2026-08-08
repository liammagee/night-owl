# Rendered content and navigation security

NightOwl treats Markdown and generated HTML as untrusted content. Every path
that turns document content into live DOM must pass through
`services/contentSecurity.js`. The module uses DOMPurify for structural HTML
sanitization, then applies NightOwl's narrower URL and embed policy.

## Allowed content

- Ordinary HTML-profile Markdown elements and safe attributes.
- Links using relative paths, fragments, `file:`, `http:`, `https:`, or
  `mailto:`. External web and mail links are forced into a denied popup and are
  handed to the operating system only after main-process validation.
- Images using relative paths, `file:`, `http:`, `https:`, or base64 raster data
  for PNG, JPEG, GIF, and WebP. Relative document images resolve against the
  current Markdown file's directory.
- HTTPS iframes from YouTube, YouTube No-Cookie, Vimeo Player, and `zoom.us`
  subdomains. NightOwl replaces author-supplied iframe permissions with its own
  sandbox, referrer, and feature-policy attributes.

## Blocked content

Scripts, event attributes, active forms, embedded objects, SVG/MathML input,
active CSS URLs, unsupported data URLs, protocol-relative URLs, arbitrary
iframe origins, and unrecognized URI schemes are removed. Audio and video tags
are blocked; supported hosted media uses the iframe allowlist above.

The main window also refuses every popup in-app, blocks navigation away from
its loaded `index.html`, and opens only `http:`, `https:`, and `mailto:` targets
externally. The explicit `open-external` IPC retains local file support but
rejects every other explicit URI scheme before invoking Electron's shell APIs.

If the sanitizer is unavailable during startup, renderer paths fail closed by
showing inert text. Preview zoom, slide thumbnails, presentation slides,
citations/internal links flowing through preview, and speaker notes all use the
same boundary.

## Regression coverage

`tests/fixtures/malicious-markdown.md` is rendered through preview and
presentation in both source and packaged Electron suites. The fixture checks
that no handler executes, unsafe URLs and frames disappear, the iframe sandbox
cannot be relaxed, and local images still resolve.
