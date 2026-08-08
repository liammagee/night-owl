/**
 * Media Embed
 * Renders audio and video elements inline in the markdown preview pane.
 * Supports local files and URLs. Recognized patterns:
 *
 *   ![video](path/to/video.mp4)
 *   ![audio](path/to/audio.mp3)
 *   @[video](https://youtube.com/watch?v=...)
 *   @[audio](path/to/file.ogg)
 *
 * Also enhances the preview pane's HTML rendering to convert matching
 * <img> tags into <video>/<audio> elements based on file extension.
 *
 * @module media-embed
 */

(function () {
  'use strict';

  const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov|avi|mkv)(\?.*)?$/i;
  const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|flac|aac|m4a|opus)(\?.*)?$/i;
  const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/;
  const VIMEO_RE = /vimeo\.com\/(\d+)/;

  /**
   * Process the preview pane HTML to convert media references into players.
   * Called after the preview is rendered.
   */
  function enhancePreview(container) {
    if (!container) return;

    // Convert <img> tags with video/audio extensions into proper elements
    const imgs = container.querySelectorAll('img');
    imgs.forEach(img => {
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';

      if (VIDEO_EXTENSIONS.test(src)) {
        const video = createVideoPlayer(src, alt);
        img.replaceWith(video);
      } else if (AUDIO_EXTENSIONS.test(src)) {
        const audio = createAudioPlayer(src, alt);
        img.replaceWith(audio);
      } else if (YOUTUBE_RE.test(src)) {
        const match = src.match(YOUTUBE_RE);
        if (match) {
          const iframe = createYouTubeEmbed(match[1], alt);
          img.replaceWith(iframe);
        }
      } else if (VIMEO_RE.test(src)) {
        const match = src.match(VIMEO_RE);
        if (match) {
          const iframe = createVimeoEmbed(match[1], alt);
          img.replaceWith(iframe);
        }
      }
    });

    // Also handle @[type](url) patterns that may have been rendered as text
    // These would appear as literal text if the markdown parser doesn't recognize them
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(node => {
      const text = node.textContent;
      const mediaMatch = text.match(/@\[(video|audio)\]\(([^)]+)\)/);
      if (mediaMatch) {
        const type = mediaMatch[1];
        const src = mediaMatch[2];
        const wrapper = document.createElement('span');

        if (type === 'video') {
          if (YOUTUBE_RE.test(src)) {
            const m = src.match(YOUTUBE_RE);
            wrapper.appendChild(createYouTubeEmbed(m[1], ''));
          } else if (VIMEO_RE.test(src)) {
            const m = src.match(VIMEO_RE);
            wrapper.appendChild(createVimeoEmbed(m[1], ''));
          } else {
            wrapper.appendChild(createVideoPlayer(src, ''));
          }
        } else {
          wrapper.appendChild(createAudioPlayer(src, ''));
        }

        node.parentNode.replaceChild(wrapper, node);
      }
    });
  }

  function createVideoPlayer(src, alt) {
    const container = document.createElement('div');
    container.style.cssText = 'margin:12px 0;max-width:100%;';

    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.style.cssText = 'max-width:100%;border-radius:6px;background:#000;';
    video.src = resolveMediaSrc(src);
    if (alt) video.title = alt;

    if (alt) {
      const caption = document.createElement('div');
      caption.textContent = alt;
      caption.style.cssText = 'font-size:12px;color:var(--text-muted,#888);margin-top:4px;text-align:center;';
      container.appendChild(video);
      container.appendChild(caption);
    } else {
      container.appendChild(video);
    }

    return container;
  }

  function createAudioPlayer(src, alt) {
    const container = document.createElement('div');
    container.style.cssText = 'margin:8px 0;padding:8px 12px;background:var(--bg-secondary,#f6f8fa);border-radius:6px;display:flex;align-items:center;gap:8px;';

    const icon = document.createElement('span');
    icon.textContent = '\u{1F3B5}';
    icon.style.fontSize = '16px';

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.style.cssText = 'flex:1;height:32px;';
    audio.src = resolveMediaSrc(src);

    container.appendChild(icon);
    if (alt) {
      const label = document.createElement('span');
      label.textContent = alt;
      label.style.cssText = 'font-size:12px;color:var(--text-secondary,#666);min-width:60px;';
      container.appendChild(label);
    }
    container.appendChild(audio);

    return container;
  }

  function createYouTubeEmbed(videoId, alt) {
    const container = document.createElement('div');
    container.style.cssText = 'margin:12px 0;position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:6px;';

    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}`;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:6px;';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('loading', 'lazy');
    if (alt) iframe.title = alt;

    container.appendChild(iframe);
    return container;
  }

  function createVimeoEmbed(videoId, alt) {
    const container = document.createElement('div');
    container.style.cssText = 'margin:12px 0;position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:6px;';

    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${videoId}`;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:6px;';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('loading', 'lazy');
    if (alt) iframe.title = alt;

    container.appendChild(iframe);
    return container;
  }

  function resolveMediaSrc(src) {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('blob:')) {
      return src;
    }
    const filePath = window.currentFilePath || '';
    if (!filePath) return src;
    const dir = filePath.replace(/[/\\][^/\\]*$/, '');
    return 'file://' + dir + '/' + src;
  }

  // ── Hook into preview rendering ──

  function hookPreview() {
    // Watch for preview content changes
    const observer = new MutationObserver(() => {
      const previewContent = document.getElementById('preview-content');
      if (previewContent) enhancePreview(previewContent);
    });

    const previewContent = document.getElementById('preview-content');
    if (previewContent) {
      observer.observe(previewContent, { childList: true, subtree: true });
      // Initial pass
      enhancePreview(previewContent);
    } else {
      // Wait for preview pane
      const interval = setInterval(() => {
        const pc = document.getElementById('preview-content');
        if (pc) {
          clearInterval(interval);
          observer.observe(pc, { childList: true, subtree: true });
          enhancePreview(pc);
        }
      }, 1000);
      setTimeout(() => clearInterval(interval), 30000);
    }
  }

  function init() {
    hookPreview();

    if (typeof window.registerCommand === 'function') {
      window.registerCommand(
        'media.insertVideo',
        'Media: Insert Video',
        () => {
          if (window.editor) {
            const pos = window.editor.getPosition();
            window.editor.executeEdits('media-embed', [{
              range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
              text: '![video](video.mp4)\n'
            }]);
          }
        }
      );
      window.registerCommand(
        'media.insertAudio',
        'Media: Insert Audio',
        () => {
          if (window.editor) {
            const pos = window.editor.getPosition();
            window.editor.executeEdits('media-embed', [{
              range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
              text: '![audio](audio.mp3)\n'
            }]);
          }
        }
      );
    }
  }

  window.mediaEmbed = {
    enhancePreview,
    createVideoPlayer,
    createAudioPlayer
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();
