const CAPTURE_ENDPOINTS = [
  'http://127.0.0.1:27124/capture',
  'http://localhost:27124/capture'
];

async function showStatus(tabId, text, color, title) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    await chrome.action.setBadgeText({ text, tabId });
    if (title) {
      await chrome.action.setTitle({ tabId, title });
    }
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
    }, 2500);
  } catch (_) {
    // Badge updates are best-effort
  }
}

function extractCitationPayloadFromPage() {
  const selection = (window.getSelection ? window.getSelection().toString() : '').trim();
  const bodyText = (document.body && document.body.innerText) || '';
  const bibMatch = bodyText.match(/@[A-Za-z]+\s*[{(][\s\S]{0,15000}[})]/);

  const meta = (name, attr = 'name') => {
    const node = document.querySelector(`meta[${attr}="${name}"]`);
    return node && typeof node.content === 'string' ? node.content.trim() : '';
  };

  const doi =
    meta('citation_doi') ||
    meta('dc.identifier') ||
    meta('dc.identifier.doi') ||
    '';
  const canonicalUrl =
    meta('og:url', 'property') ||
    document.querySelector('link[rel="canonical"]')?.href ||
    location.href;

  const title =
    meta('citation_title') ||
    meta('og:title', 'property') ||
    document.title ||
    '';

  let text = '';
  if (bibMatch && bibMatch[0]) {
    text = bibMatch[0].trim();
  } else if (selection) {
    text = selection;
  } else if (doi) {
    text = doi;
  } else {
    text = `${title}\n${canonicalUrl}`.trim();
  }

  return {
    text,
    title,
    url: canonicalUrl,
    source: 'chrome-extension'
  };
}

async function postCapture(payload) {
  for (const endpoint of CAPTURE_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        return { success: true, endpoint };
      }
    } catch (_) {
      // Try the next endpoint
    }
  }

  return { success: false };
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractCitationPayloadFromPage
    });

    const payload = result?.result;
    if (!payload || !payload.text) {
      await showStatus(tab.id, '!', '#b91c1c', 'NightOwl: no citation text found');
      return;
    }

    const sent = await postCapture(payload);
    if (sent.success) {
      await showStatus(tab.id, 'OK', '#166534', 'NightOwl: citation captured');
      return;
    }

    await showStatus(tab.id, 'ERR', '#b91c1c', 'NightOwl: app not reachable on localhost:27124');
  } catch (error) {
    await showStatus(tab.id, 'ERR', '#b91c1c', `NightOwl capture failed: ${error.message || error}`);
  }
});
