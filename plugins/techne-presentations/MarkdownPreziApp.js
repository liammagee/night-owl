"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _readOnlyError(r) { throw new TypeError('"' + r + '" is read-only'); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i.return) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t.return || t.return(); } finally { if (u) throw o; } } }; }
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
// React presentation component
// Using global React and ReactDOM instead of imports
var React = window.React;
var ReactDOM = window.ReactDOM;
var useState = React.useState,
  useRef = React.useRef,
  useEffect = React.useEffect,
  useLayoutEffect = React.useLayoutEffect,
  useCallback = React.useCallback;
var sanitizeRenderedHTML = function sanitizeRenderedHTML(html) {
  var contentSecurity = window.NightOwlContentSecurity;
  if (contentSecurity !== null && contentSecurity !== void 0 && contentSecurity.sanitizeRenderedHTML) {
    var _window$appSettings;
    return contentSecurity.sanitizeRenderedHTML(html, {
      baseDir: window.currentFileDirectory || ((_window$appSettings = window.appSettings) === null || _window$appSettings === void 0 ? void 0 : _window$appSettings.workingDirectory)
    });
  }
  return String(html || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};
var setSanitizedHTML = function setSanitizedHTML(element, html) {
  if (!element) return '';
  var contentSecurity = window.NightOwlContentSecurity;
  if (contentSecurity !== null && contentSecurity !== void 0 && contentSecurity.setSanitizedHTML) {
    var _window$appSettings2;
    return contentSecurity.setSanitizedHTML(element, html, {
      baseDir: window.currentFileDirectory || ((_window$appSettings2 = window.appSettings) === null || _window$appSettings2 === void 0 ? void 0 : _window$appSettings2.workingDirectory)
    });
  }
  element.textContent = String(html || '');
  return element.textContent;
};

// Lucide React icons as simple SVG components
var ChevronLeft = function ChevronLeft() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "15,18 9,12 15,6"
  }));
};
var ChevronRight = function ChevronRight() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "9,18 15,12 9,6"
  }));
};
var Upload = function Upload() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "7,10 12,15 17,10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "15",
    x2: "12",
    y2: "3"
  }));
};
var ZoomIn = function ZoomIn() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.35-4.35"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "11",
    y1: "8",
    x2: "11",
    y2: "14"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "8",
    y1: "11",
    x2: "14",
    y2: "11"
  }));
};
var ZoomOut = function ZoomOut() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.35-4.35"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "8",
    y1: "11",
    x2: "14",
    y2: "11"
  }));
};
var presentationViewport = window.NightOwlPresentationViewport;
var SLIDE_WIDTH = (presentationViewport === null || presentationViewport === void 0 ? void 0 : presentationViewport.SLIDE_WIDTH) || 864;
var SLIDE_HEIGHT = (presentationViewport === null || presentationViewport === void 0 ? void 0 : presentationViewport.SLIDE_HEIGHT) || 486;
var SLIDE_HALF_WIDTH = SLIDE_WIDTH / 2;
var SLIDE_HALF_HEIGHT = SLIDE_HEIGHT / 2;
var SLIDE_SPACING = SLIDE_WIDTH + 240;
var presentationSessionKey = function presentationSessionKey(kind) {
  var identity = window.currentFilePath || 'untitled-presentation';
  return "nightowl:presentation:".concat(kind, ":").concat(identity);
};
var readStoredList = function readStoredList(key) {
  try {
    var _window$localStorage;
    var value = JSON.parse(((_window$localStorage = window.localStorage) === null || _window$localStorage === void 0 ? void 0 : _window$localStorage.getItem(key)) || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch (_) {
    return [];
  }
};
var writeStoredList = function writeStoredList(key, values) {
  try {
    var _window$localStorage2;
    (_window$localStorage2 = window.localStorage) === null || _window$localStorage2 === void 0 || _window$localStorage2.setItem(key, JSON.stringify(_toConsumableArray(new Set(values)).sort()));
  } catch (_) {
    // Suppressions remain active for this mount when storage is unavailable.
  }
};
var slideTextPreview = function slideTextPreview(slide) {
  return String((slide === null || slide === void 0 ? void 0 : slide.cleanContent) || '').replace(/<!--[^]*?-->/g, ' ').replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/<[^>]+>/g, ' ').replace(/[`*_>#-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
};
var escapeSpeakerNotesText = function escapeSpeakerNotesText(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
var speakerNotesHTML = function speakerNotesHTML(notes) {
  var noteText = String(notes || '').trim();
  if (!noteText) return sanitizeRenderedHTML('<em>No speaker notes for this slide.</em>');
  var rendered = typeof window.markdownToHtml === 'function' ? window.markdownToHtml(noteText) : "<p>".concat(escapeSpeakerNotesText(noteText).replace(/\n/g, '<br>'), "</p>");
  return sanitizeRenderedHTML(rendered);
};
var SpeakerNotesContent = function SpeakerNotesContent(_ref) {
  var notes = _ref.notes;
  return /*#__PURE__*/React.createElement("div", {
    className: "presentation-speaker-notes-html",
    "data-render-format": "html",
    onClick: function onClick(event) {
      var _window$handleInterna, _window;
      return (_window$handleInterna = (_window = window).handleInternalLinkClick) === null || _window$handleInterna === void 0 ? void 0 : _window$handleInterna.call(_window, event);
    },
    dangerouslySetInnerHTML: {
      __html: speakerNotesHTML(notes)
    }
  });
};
var PresentationSlideContent = function PresentationSlideContent(_ref2) {
  var html = _ref2.html,
    isPresenting = _ref2.isPresenting;
  var frameRef = useRef(null);
  var contentRef = useRef(null);
  var _useState = useState(1),
    _useState2 = _slicedToArray(_useState, 2),
    contentScale = _useState2[0],
    setContentScale = _useState2[1];
  var sanitizedHtml = sanitizeRenderedHTML(html);
  useLayoutEffect(function () {
    var frame = frameRef.current;
    var element = contentRef.current;
    if (!frame || !element) return undefined;
    var slideElement = element.closest('.slide');
    var animationFrame = null;
    var measure = function measure() {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(function () {
        var _window$NightOwlPrese, _window$NightOwlPrese2, _window$NightOwlPrese3;
        animationFrame = null;
        var availableWidth = Math.min(frame.clientWidth, element.clientWidth);
        var availableHeight = Math.min(frame.clientHeight, element.clientHeight);
        var descendants = Array.from(element.querySelectorAll('*'));
        var contentWidth = descendants.reduce(function (maximum, child) {
          return Math.max(maximum, child.scrollWidth || 0);
        }, Math.max(availableWidth, element.scrollWidth));
        var contentHeight = descendants.reduce(function (maximum, child) {
          return Math.max(maximum, (child.offsetTop || 0) + (child.scrollHeight || 0));
        }, Math.max(availableHeight, element.scrollHeight));
        var nextScale = (_window$NightOwlPrese = (_window$NightOwlPrese2 = window.NightOwlPresentationViewport) === null || _window$NightOwlPrese2 === void 0 || (_window$NightOwlPrese3 = _window$NightOwlPrese2.calculateContentScale) === null || _window$NightOwlPrese3 === void 0 ? void 0 : _window$NightOwlPrese3.call(_window$NightOwlPrese2, {
          availableWidth: availableWidth,
          availableHeight: availableHeight,
          contentWidth: contentWidth,
          contentHeight: contentHeight
        })) !== null && _window$NightOwlPrese !== void 0 ? _window$NightOwlPrese : 1;
        var overflows = nextScale < 0.999;
        if (slideElement) {
          slideElement.dataset.contentOverflow = overflows ? 'true' : 'false';
        }
        setContentScale(function (previous) {
          return Math.abs(previous - nextScale) > 0.001 ? nextScale : previous;
        });
      });
    };
    measure();
    var resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    resizeObserver === null || resizeObserver === void 0 || resizeObserver.observe(frame);
    resizeObserver === null || resizeObserver === void 0 || resizeObserver.observe(element);
    var mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true
    });
    element.querySelectorAll('img').forEach(function (image) {
      return image.addEventListener('load', measure);
    });
    window.addEventListener('resize', measure);
    return function () {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver === null || resizeObserver === void 0 || resizeObserver.disconnect();
      mutationObserver.disconnect();
      element.querySelectorAll('img').forEach(function (image) {
        return image.removeEventListener('load', measure);
      });
      window.removeEventListener('resize', measure);
      if (slideElement) delete slideElement.dataset.contentOverflow;
    };
  }, [sanitizedHtml, isPresenting]);
  return /*#__PURE__*/React.createElement("div", {
    ref: frameRef,
    className: "slide-content-frame",
    style: {
      height: '100%',
      width: '100%',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: contentRef,
    className: "slide-content ".concat(isPresenting ? 'slide-content-delivery' : 'slide-content-authoring'),
    "data-content-scale": contentScale.toFixed(4),
    style: {
      height: '100%',
      width: '100%',
      transform: isPresenting ? "scale(".concat(contentScale, ")") : 'none',
      transformOrigin: 'top left'
    },
    onClick: function onClick(event) {
      var _window$handleInterna2, _window2;
      return (_window$handleInterna2 = (_window2 = window).handleInternalLinkClick) === null || _window$handleInterna2 === void 0 ? void 0 : _window$handleInterna2.call(_window2, event);
    },
    dangerouslySetInnerHTML: {
      __html: sanitizedHtml
    }
  }));
};
var Home = function Home() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "9,22 9,12 15,12 15,22"
  }));
};
var Play = function Play() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("polygon", {
    points: "5,3 19,12 5,21"
  }));
};
var StickyNote = function StickyNote() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 3v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V3z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 7h8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 11h8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 15h5"
  }));
};
var Eye = function Eye() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }));
};
var EyeOff = function EyeOff() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9.88 9.88a3 3 0 1 0 4.24 4.24"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 8 11 8a13.16 13.16 0 0 1-1.67 2.68"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6.61 6.61A13.526 13.526 0 0 0 1 12s4 8 11 8a9.74 9.74 0 0 0 5.39-1.61"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "2",
    y1: "2",
    x2: "22",
    y2: "22"
  }));
};
var Speaker = function Speaker() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("polygon", {
    points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"
  }));
};
var SpeakerOff = function SpeakerOff() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("polygon", {
    points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "23",
    y1: "1",
    x2: "1",
    y2: "23"
  }));
};
var LoadingSpinner = function LoadingSpinner() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    className: "animate-spin",
    style: {
      display: 'inline-block'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10",
    strokeOpacity: "0.25"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2a10 10 0 0 1 10 10",
    strokeLinecap: "round"
  }));
};
var RecordIcon = function RecordIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "currentColor",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }));
};
var StopIcon = function StopIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "currentColor",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "6",
    width: "12",
    height: "12"
  }));
};
var PauseIcon = function PauseIcon() {
  return /*#__PURE__*/React.createElement("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "4",
    width: "4",
    height: "16"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14",
    y: "4",
    width: "4",
    height: "16"
  }));
};
var MarkdownPreziApp = function MarkdownPreziApp() {
  var _slides$currentSlide9, _slides, _slides$currentSlide0;
  var _ref3 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
    _ref3$markdown = _ref3.markdown,
    markdown = _ref3$markdown === void 0 ? '' : _ref3$markdown,
    _ref3$onPresentationE = _ref3.onPresentationError,
    onPresentationError = _ref3$onPresentationE === void 0 ? null : _ref3$onPresentationE;
  console.log('[Presentation] *** COMPONENT LOADING ***');

  // Set up the global handler immediately, not in useEffect
  if (!window.handleInternalLinkClick) {
    window.handleInternalLinkClick = function (event) {
      var _event$target, _event$target$closest;
      var linkElement = (_event$target = event.target) === null || _event$target === void 0 || (_event$target$closest = _event$target.closest) === null || _event$target$closest === void 0 ? void 0 : _event$target$closest.call(_event$target, '.internal-link');
      console.log('[Internal Link] *** CLICK DETECTED *** Global handler called:', {
        target: linkElement || event.target,
        tagName: linkElement === null || linkElement === void 0 ? void 0 : linkElement.tagName,
        className: linkElement === null || linkElement === void 0 ? void 0 : linkElement.className,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        hasInternalLinkClass: Boolean(linkElement)
      });

      // Check if this is a click on an internal link with Cmd/Ctrl modifier
      if ((event.metaKey || event.ctrlKey) && linkElement) {
        console.log('[Internal Link] *** CMD/CTRL+CLICK DETECTED ***');
        event.preventDefault();
        event.stopPropagation();
        var linkPath = linkElement.getAttribute('data-link');
        if (linkPath) {
          var _window$electronAPI;
          var decodedPath = decodeURIComponent(linkPath);
          console.log('[Internal Link] Opening:', decodedPath);

          // Use the existing window API to open the file
          if (window.openFile) {
            console.log('[Internal Link] Using window.openFile');
            window.openFile(decodedPath);
          } else if ((_window$electronAPI = window.electronAPI) !== null && _window$electronAPI !== void 0 && (_window$electronAPI = _window$electronAPI.files) !== null && _window$electronAPI !== void 0 && _window$electronAPI.openFile) {
            // Fallback for Electron API
            console.log('[Internal Link] Using electronAPI');
            window.electronAPI.files.openFile(decodedPath);
          } else {
            console.warn('[Internal Link] No file opening API available');
          }
        } else {
          console.warn('[Internal Link] No data-link attribute found');
        }
      } else if (linkElement) {
        // Regular click on internal link - prevent default but don't open
        console.log('[Internal Link] Regular click on internal link - preventing default');
        event.preventDefault();
      }
    };
    console.log('[Internal Link] *** GLOBAL HANDLER SET UP ***');
  }

  // Check if running in Electron
  var isElectron = window.electronAPI && window.electronAPI.isElectron;

  // React component rendering
  var _useState3 = useState([]),
    _useState4 = _slicedToArray(_useState3, 2),
    slides = _useState4[0],
    setSlides = _useState4[1];
  var _useState5 = useState(0),
    _useState6 = _slicedToArray(_useState5, 2),
    currentSlide = _useState6[0],
    setCurrentSlide = _useState6[1];
  var _useState7 = useState(1),
    _useState8 = _slicedToArray(_useState7, 2),
    zoom = _useState8[0],
    setZoom = _useState8[1];
  var _useState9 = useState({
      x: 0,
      y: 0
    }),
    _useState0 = _slicedToArray(_useState9, 2),
    pan = _useState0[0],
    setPan = _useState0[1];
  var _useState1 = useState(false),
    _useState10 = _slicedToArray(_useState1, 2),
    isZooming = _useState10[0],
    setIsZooming = _useState10[1];
  var _useState11 = useState(false),
    _useState12 = _slicedToArray(_useState11, 2),
    isDragging = _useState12[0],
    setIsDragging = _useState12[1];
  var _useState13 = useState({
      x: 0,
      y: 0
    }),
    _useState14 = _slicedToArray(_useState13, 2),
    dragStart = _useState14[0],
    setDragStart = _useState14[1];
  var _useState15 = useState({
      x: 0,
      y: 0
    }),
    _useState16 = _slicedToArray(_useState15, 2),
    panStart = _useState16[0],
    setPanStart = _useState16[1];
  var _useState17 = useState(false),
    _useState18 = _slicedToArray(_useState17, 2),
    isPresenting = _useState18[0],
    setIsPresenting = _useState18[1];
  var _useState19 = useState('spiral'),
    _useState20 = _slicedToArray(_useState19, 2),
    layoutType = _useState20[0],
    setLayoutType = _useState20[1];
  var _useState21 = useState(null),
    _useState22 = _slicedToArray(_useState21, 2),
    focusedSlide = _useState22[0],
    setFocusedSlide = _useState22[1];
  var _useState23 = useState(true),
    _useState24 = _slicedToArray(_useState23, 2),
    speakerNotesVisible = _useState24[0],
    setSpeakerNotesVisible = _useState24[1];
  var _useState25 = useState(false),
    _useState26 = _slicedToArray(_useState25, 2),
    speakerNotesWindowVisible = _useState26[0],
    setSpeakerNotesWindowVisible = _useState26[1];
  var _useState27 = useState(markdown || ''),
    _useState28 = _slicedToArray(_useState27, 2),
    sourceMarkdown = _useState28[0],
    setSourceMarkdown = _useState28[1];
  var _useState29 = useState(false),
    _useState30 = _slicedToArray(_useState29, 2),
    preflightOpen = _useState30[0],
    setPreflightOpen = _useState30[1];
  var _useState31 = useState(false),
    _useState32 = _slicedToArray(_useState31, 2),
    preflightRunning = _useState32[0],
    setPreflightRunning = _useState32[1];
  var _useState33 = useState(null),
    _useState34 = _slicedToArray(_useState33, 2),
    preflightReport = _useState34[0],
    setPreflightReport = _useState34[1];
  var _useState35 = useState(function () {
      return readStoredList(presentationSessionKey('preflight-suppressions'));
    }),
    _useState36 = _slicedToArray(_useState35, 2),
    preflightSuppressions = _useState36[0],
    setPreflightSuppressions = _useState36[1];
  var _useState37 = useState(function () {
      try {
        var _window$sessionStorag;
        return ((_window$sessionStorag = window.sessionStorage) === null || _window$sessionStorag === void 0 ? void 0 : _window$sessionStorag.getItem(presentationSessionKey('console'))) === 'open';
      } catch (_) {
        return false;
      }
    }),
    _useState38 = _slicedToArray(_useState37, 2),
    presenterConsoleOpen = _useState38[0],
    setPresenterConsoleOpen = _useState38[1];
  var _useState39 = useState(0),
    _useState40 = _slicedToArray(_useState39, 2),
    presenterElapsed = _useState40[0],
    setPresenterElapsed = _useState40[1];
  var _useState41 = useState(false),
    _useState42 = _slicedToArray(_useState41, 2),
    ttsEnabled = _useState42[0],
    setTtsEnabled = _useState42[1];
  var _useState43 = useState(false),
    _useState44 = _slicedToArray(_useState43, 2),
    isSpeaking = _useState44[0],
    setIsSpeaking = _useState44[1];
  var _useState45 = useState(false),
    _useState46 = _slicedToArray(_useState45, 2),
    isLoadingTTS = _useState46[0],
    setIsLoadingTTS = _useState46[1];
  var _useState47 = useState('sarah'),
    _useState48 = _slicedToArray(_useState47, 2),
    selectedVoice = _useState48[0],
    setSelectedVoice = _useState48[1]; // Default voice
  var ttsStateRef = useRef({
    isAdvancing: false,
    currentSpeakingSlide: -1
  });
  var MIN_ZOOM = 0.1;
  var MAX_ZOOM = 3;

  // Video recording state
  var _useState49 = useState(false),
    _useState50 = _slicedToArray(_useState49, 2),
    isRecording = _useState50[0],
    setIsRecording = _useState50[1];
  var _useState51 = useState(false),
    _useState52 = _slicedToArray(_useState51, 2),
    isPaused = _useState52[0],
    setIsPaused = _useState52[1];
  var _useState53 = useState(0),
    _useState54 = _slicedToArray(_useState53, 2),
    recordingDuration = _useState54[0],
    setRecordingDuration = _useState54[1];
  var recordingTimerRef = useRef(null);

  // Current slides and slide index state
  var canvasRef = useRef(null);
  var containerRef = useRef(null);
  var stageRef = useRef(null);
  var presentationControlsRef = useRef(null);
  var navigationControlsRef = useRef(null);
  var presenterConsoleRef = useRef(null);
  var presenterStartedAtRef = useRef(null);
  var previousFocusRef = useRef(null);
  var currentSlideRef = useRef(currentSlide);
  var pendingContentSlideRef = useRef(null);
  var zoomInteractionTimeoutRef = useRef(null);
  var zoomRef = useRef(zoom);
  var panRef = useRef(pan);
  var authoringPreferredZoomRef = useRef(1.2);
  var _useState55 = useState({
      top: 16,
      right: 16,
      bottom: 16,
      left: 16
    }),
    _useState56 = _slicedToArray(_useState55, 2),
    presentationInsets = _useState56[0],
    setPresentationInsets = _useState56[1];
  var _useState57 = useState({
      scale: 1,
      pan: {
        x: 0,
        y: 0
      }
    }),
    _useState58 = _slicedToArray(_useState57, 2),
    presentationFit = _useState58[0],
    setPresentationFit = _useState58[1];
  var _useState59 = useState(false),
    _useState60 = _slicedToArray(_useState59, 2),
    presentationFitReady = _useState60[0],
    setPresentationFitReady = _useState60[1];

  // Sample markdown content for demo
  var sampleMarkdown = "# SAMPLE CONTENT TEST\nThis is sample content to test speaker notes.\n\n```notes\n\uD83D\uDD34 SAMPLE SPEAKER NOTES: If you can see this, the speaker notes parsing is working correctly!\n\nThis is a test of the speaker notes functionality in presentation mode.\n```\n\n---\n\n## What is This?\n- Advanced Markdown editor with AI assistance\n- Interactive presentation capabilities\n- Integrated file management\n- Philosophical content support\n\n```notes\nExplain each bullet point briefly:\n\n1. Advanced editor - mention Monaco editor, syntax highlighting\n2. Presentation capabilities - this is what they're seeing now!\n3. File management - integrated file tree, folder operations\n4. Philosophical content - specifically designed for philosophy education\n\nAsk if anyone has questions about the core features before moving on.\n```\n\n---\n\n## Key Features\n### Editor Mode\n- Monaco editor with syntax highlighting\n- Real-time preview\n- AI chat integration\n- Document structure navigation\n\n### Presentation Mode\n- Zoomable presentation canvas\n- Multiple layout types\n- Smooth transitions\n- Interactive navigation\n\n```notes\nDemonstrate the dual modes:\n\nEditor Mode:\n- Show how the editor looks\n- Mention real-time preview\n- AI chat for philosophical discussions\n\nPresentation Mode:\n- This is what we're in right now\n- Mention zoom capabilities (demonstrate if needed)\n- Different layouts available (spiral, grid, linear, circle)\n\nTransition: \"Now let's talk about the philosophical foundation...\"\n```\n\n---\n\n## Philosophical Focus\n### Hegelian Dialectic\n- **Thesis**: Initial position or concept\n- **Antithesis**: Negation or contradiction\n- **Synthesis**: Higher unity transcending both\n\n### AI & Pedagogy\nIntegration of artificial intelligence with philosophical education.\n\n```notes\nThis is the core philosophical concept we're exploring:\n\nHegelian Dialectic explanation:\n- Thesis: Starting point, initial idea\n- Antithesis: Opposition, contradiction, challenge\n- Synthesis: Resolution that preserves and transcends both\n\nGive a concrete example if time permits - maybe democracy/authoritarianism -> constitutional democracy.\n\nAI & Pedagogy:\n- Not replacing human instruction\n- Augmenting and enhancing learning\n- Helping students explore complex philosophical concepts\n```\n\n---\n\n## Getting Started\n1. Switch between Editor and Presentation views\n2. Load your Markdown files\n3. Use AI chat for assistance\n4. Create engaging presentations\n5. Explore philosophical concepts\n\n```notes\nPractical steps for new users:\n\n1. Mode switching - use the buttons at the top\n2. File loading - integrated file system\n3. AI assistance - context-aware help for philosophical concepts\n4. Presentations - what they're experiencing now\n5. Exploration - encourage experimentation\n\nRemind them that speaker notes like these are available in presentation mode!\n\nNext: Thank them and open for questions.\n```\n\n---\n\n## Thank You!\nWelcome to the future of philosophical education.\n\n*Happy learning and presenting!*\n\n```notes\nClosing remarks:\n\n- Thank the audience for their attention\n- Emphasize the innovative nature of combining AI with philosophy\n- Invite questions and discussion\n- Mention that this is just the beginning\n\nEnd with: \"Are there any questions about the platform or its philosophical applications?\"\n\nNote: You can press 'N' to toggle these speaker notes on/off during presentation.\n```";
  useEffect(function () {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(function () {
    panRef.current = pan;
  }, [pan]);
  useLayoutEffect(function () {
    if (!isPresenting) {
      setPresentationInsets({
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      });
      return undefined;
    }
    var notesPanel = document.getElementById('speaker-notes-panel');
    var observedElements = [containerRef.current, presentationControlsRef.current, navigationControlsRef.current, presenterConsoleRef.current, notesPanel].filter(Boolean);
    var animationFrame = null;
    var measureChrome = function measureChrome() {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(function () {
        var _presentationControls, _presentationControls2, _navigationControlsRe, _navigationControlsRe2;
        animationFrame = null;
        var controlsHeight = ((_presentationControls = presentationControlsRef.current) === null || _presentationControls === void 0 || (_presentationControls2 = _presentationControls.getBoundingClientRect) === null || _presentationControls2 === void 0 ? void 0 : _presentationControls2.call(_presentationControls).height) || 0;
        var navigationHeight = ((_navigationControlsRe = navigationControlsRef.current) === null || _navigationControlsRe === void 0 || (_navigationControlsRe2 = _navigationControlsRe.getBoundingClientRect) === null || _navigationControlsRe2 === void 0 ? void 0 : _navigationControlsRe2.call(_navigationControlsRe).height) || 0;
        var notesStyle = notesPanel ? window.getComputedStyle(notesPanel) : null;
        var notesHeight = notesPanel && (notesStyle === null || notesStyle === void 0 ? void 0 : notesStyle.display) !== 'none' && (notesStyle === null || notesStyle === void 0 ? void 0 : notesStyle.visibility) !== 'hidden' ? notesPanel.getBoundingClientRect().height : 0;
        var consoleStyle = presenterConsoleRef.current ? window.getComputedStyle(presenterConsoleRef.current) : null;
        var consoleWidth = presenterConsoleRef.current && (consoleStyle === null || consoleStyle === void 0 ? void 0 : consoleStyle.display) !== 'none' && (consoleStyle === null || consoleStyle === void 0 ? void 0 : consoleStyle.visibility) !== 'hidden' ? presenterConsoleRef.current.getBoundingClientRect().width : 0;
        var next = {
          top: controlsHeight > 0 ? controlsHeight + 28 : 16,
          right: consoleWidth > 0 ? consoleWidth + 28 : 16,
          bottom: Math.max(navigationHeight > 0 ? navigationHeight + 28 : 16, notesHeight > 0 ? notesHeight + 12 : 0),
          left: 16
        };
        setPresentationInsets(function (previous) {
          return previous.top === next.top && previous.right === next.right && previous.bottom === next.bottom && previous.left === next.left ? previous : next;
        });
      });
    };
    measureChrome();
    var resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(measureChrome) : null;
    observedElements.forEach(function (element) {
      return resizeObserver === null || resizeObserver === void 0 ? void 0 : resizeObserver.observe(element);
    });
    var mutationObserver = new MutationObserver(measureChrome);
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true
    });
    if (notesPanel) {
      mutationObserver.observe(notesPanel, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
    window.addEventListener('resize', measureChrome);
    return function () {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver === null || resizeObserver === void 0 || resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', measureChrome);
    };
  }, [isPresenting, speakerNotesWindowVisible, presenterConsoleOpen]);
  useLayoutEffect(function () {
    if (!isPresenting || slides.length === 0) {
      setPresentationFitReady(false);
      return undefined;
    }
    var stage = stageRef.current;
    var slide = slides[currentSlide];
    if (!stage || !slide) return undefined;
    var animationFrame = null;
    var readyFrame = null;
    var readinessToken = null;
    var updateFit = function updateFit() {
      var _window$NightOwlPerfo, _window$NightOwlPerfo2;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (readyFrame) cancelAnimationFrame(readyFrame);
      (_window$NightOwlPerfo = window.NightOwlPerformance) === null || _window$NightOwlPerfo === void 0 || (_window$NightOwlPerfo = _window$NightOwlPerfo.readiness) === null || _window$NightOwlPerfo === void 0 || _window$NightOwlPerfo.cancel(readinessToken, {
        reason: 'presentation-fit-recalculated'
      });
      readinessToken = ((_window$NightOwlPerfo2 = window.NightOwlPerformance) === null || _window$NightOwlPerfo2 === void 0 || (_window$NightOwlPerfo2 = _window$NightOwlPerfo2.readiness) === null || _window$NightOwlPerfo2 === void 0 ? void 0 : _window$NightOwlPerfo2.begin('presentation-fit', {
        slideIndex: currentSlide,
        viewportWidth: stage.clientWidth,
        viewportHeight: stage.clientHeight
      })) || null;
      setPresentationFitReady(false);
      animationFrame = requestAnimationFrame(function () {
        var _window$NightOwlPrese4, _window$NightOwlPrese5;
        animationFrame = null;
        if (!stage.clientWidth || !stage.clientHeight) return;
        var next = (_window$NightOwlPrese4 = window.NightOwlPresentationViewport) === null || _window$NightOwlPrese4 === void 0 || (_window$NightOwlPrese5 = _window$NightOwlPrese4.calculateFitTransform) === null || _window$NightOwlPrese5 === void 0 ? void 0 : _window$NightOwlPrese5.call(_window$NightOwlPrese4, {
          viewportWidth: stage.clientWidth,
          viewportHeight: stage.clientHeight,
          slideX: slide.position.x,
          slideY: slide.position.y,
          slideWidth: SLIDE_WIDTH,
          slideHeight: SLIDE_HEIGHT,
          padding: 12
        });
        if (!next) return;
        setPresentationFit(function (previous) {
          return Math.abs(previous.scale - next.scale) < 0.0001 && Math.abs(previous.pan.x - next.pan.x) < 0.1 && Math.abs(previous.pan.y - next.pan.y) < 0.1 ? previous : {
            scale: next.scale,
            pan: next.pan
          };
        });
        readyFrame = requestAnimationFrame(function () {
          var _window$NightOwlPerfo3;
          readyFrame = null;
          setPresentationFitReady(true);
          (_window$NightOwlPerfo3 = window.NightOwlPerformance) === null || _window$NightOwlPerfo3 === void 0 || (_window$NightOwlPerfo3 = _window$NightOwlPerfo3.readiness) === null || _window$NightOwlPerfo3 === void 0 || _window$NightOwlPerfo3.complete(readinessToken, {
            scale: next.scale,
            slideIndex: currentSlide
          });
          readinessToken = null;
        });
      });
    };
    updateFit();
    var resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateFit) : null;
    resizeObserver === null || resizeObserver === void 0 || resizeObserver.observe(stage);
    window.addEventListener('resize', updateFit);
    return function () {
      var _window$NightOwlPerfo4;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (readyFrame) cancelAnimationFrame(readyFrame);
      (_window$NightOwlPerfo4 = window.NightOwlPerformance) === null || _window$NightOwlPerfo4 === void 0 || (_window$NightOwlPerfo4 = _window$NightOwlPerfo4.readiness) === null || _window$NightOwlPerfo4 === void 0 || _window$NightOwlPerfo4.cancel(readinessToken, {
        reason: 'presentation-fit-unmounted'
      });
      resizeObserver === null || resizeObserver === void 0 || resizeObserver.disconnect();
      window.removeEventListener('resize', updateFit);
    };
  }, [isPresenting, slides, currentSlide, presentationInsets]);
  var markZoomInteraction = useCallback(function () {
    setIsZooming(true);
    if (zoomInteractionTimeoutRef.current) {
      clearTimeout(zoomInteractionTimeoutRef.current);
    }
    zoomInteractionTimeoutRef.current = setTimeout(function () {
      setIsZooming(false);
    }, 180);
  }, []);
  useEffect(function () {
    return function () {
      if (zoomInteractionTimeoutRef.current) {
        clearTimeout(zoomInteractionTimeoutRef.current);
      }
    };
  }, []);

  // Calculate slide positioning based on layout type
  var calculateSlidePosition = function calculateSlidePosition(index, total) {
    var spacing = SLIDE_SPACING;
    switch (layoutType) {
      case 'linear':
        return {
          x: index * spacing,
          y: 0
        };
      case 'grid':
        var cols = Math.ceil(Math.sqrt(total));
        var gridRow = Math.floor(index / cols);
        var col = index % cols;
        return {
          x: col * spacing,
          y: gridRow * spacing
        };
      case 'circle':
        var circleAngle = index / total * 2 * Math.PI - Math.PI / 2;
        var circleRadius = spacing * 0.6;
        return {
          x: Math.cos(circleAngle) * circleRadius,
          y: Math.sin(circleAngle) * circleRadius
        };
      case 'spiral':
        if (index === 0) return {
          x: 0,
          y: 0
        };
        var spiralAngle = index / total * 4 * Math.PI;
        var spiralRadius = SLIDE_HALF_WIDTH * 0.75 + index * (SLIDE_HALF_WIDTH * 0.6);
        return {
          x: Math.cos(spiralAngle) * spiralRadius,
          y: Math.sin(spiralAngle) * spiralRadius
        };
      case 'tree':
        if (index === 0) return {
          x: 0,
          y: 0
        };
        var level = Math.floor(Math.log2(index + 1));
        var posInLevel = index - (Math.pow(2, level) - 1);
        var maxInLevel = Math.pow(2, level);
        var branchWidth = spacing * maxInLevel;
        return {
          x: (posInLevel - maxInLevel / 2 + 0.5) * (branchWidth / maxInLevel),
          y: level * spacing
        };
      case 'zigzag':
        var zigzagRow = Math.floor(index / 3);
        var zigzagCol = index % 3;
        var isEvenRow = zigzagRow % 2 === 0;
        return {
          x: isEvenRow ? zigzagCol * spacing : (2 - zigzagCol) * spacing,
          y: zigzagRow * spacing
        };
      default:
        return {
          x: 0,
          y: 0
        };
    }
  };

  // Process nested lists properly
  var processNestedLists = function processNestedLists(html) {
    var lines = html.split('\n');
    var processedLines = [];
    var inListMode = false;
    var currentListHtml = '';

    // First, extract just the list portions and process them
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmedLine = line.trim();

      // Check if this is a list item
      var isListItem = /^(\s*)[-*+]\s+(.+)$/.test(line) || /^(\s*)(\d+)\.\s+(.+)$/.test(line);
      if (isListItem) {
        if (!inListMode) {
          inListMode = true;
          currentListHtml = '';
        }
        currentListHtml += line + '\n';
      } else {
        if (inListMode && trimmedLine === '') {
          // Allow blank lines within a list without breaking numbering
          currentListHtml += '\n';
          continue;
        }
        // End of list section
        if (inListMode) {
          // Process the accumulated list HTML
          processedLines.push(processListSection(currentListHtml.trim()));
          inListMode = false;
          currentListHtml = '';
        }

        // Add non-list line as is
        if (trimmedLine) {
          processedLines.push(line);
        }
      }
    }

    // Handle any remaining list at end of content
    if (inListMode && currentListHtml.trim()) {
      processedLines.push(processListSection(currentListHtml.trim()));
    }
    return processedLines.join('\n');
  };

  // Process a section of list items into proper nested HTML
  var processListSection = function processListSection(listMarkdown) {
    // Prefer the full Marked parser to preserve correct nesting semantics
    if (window.marked && typeof window.marked.parse === 'function') {
      try {
        var parsedHtml = window.marked.parse(listMarkdown, {
          breaks: false
        });
        // Normalize spacing and add our presentation-specific classes
        parsedHtml = parsedHtml.replace(/<ul>/g, '<ul class="markdown-list">').replace(/<ol>/g, '<ol class="markdown-list markdown-list-ordered">').replace(/<li>/g, '<li class="markdown-list-item">');
        return parsedHtml.trim();
      } catch (error) {
        console.error('[MarkdownParser] Failed to parse list section via marked:', error);
      }
    }

    // Fallback: basic nested list handling (maintained for offline safety)
    var lines = listMarkdown.split('\n');
    var processedLines = [];
    var listStack = [];
    var closeToIndent = function closeToIndent(targetIndent) {
      while (listStack.length > 0 && listStack[listStack.length - 1].indent > targetIndent) {
        processedLines.push('</li>');
        processedLines.push("</".concat(listStack.pop().type, ">"));
      }
    };
    var _iterator = _createForOfIteratorHelper(lines),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var rawLine = _step.value;
        if (!rawLine.trim()) continue;
        var unorderedMatch = rawLine.match(/^(\s*)[-*+]\s+(.+)$/);
        var orderedMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.+)$/);
        if (!unorderedMatch && !orderedMatch) continue;
        var indent = (unorderedMatch || orderedMatch)[1].length;
        var content = unorderedMatch ? unorderedMatch[2] : orderedMatch[3];
        var listType = orderedMatch ? 'ol' : 'ul';
        closeToIndent(indent);
        var current = listStack[listStack.length - 1];
        if (!current || current.indent < indent || current.type !== listType) {
          if (current && current.indent === indent && current.type !== listType) {
            processedLines.push('</li>');
            processedLines.push("</".concat(listStack.pop().type, ">"));
            current = listStack[listStack.length - 1];
          }
          processedLines.push("<".concat(listType, " class=\"markdown-list\">"));
          listStack.push({
            type: listType,
            indent: indent
          });
          current = listStack[listStack.length - 1];
        } else {
          processedLines.push('</li>');
        }
        processedLines.push("<li class=\"markdown-list-item\">".concat(content));
      }

      // Close any remaining open tags
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
    closeToIndent(-1);
    // Ensure we close the final item and list if any remain open
    while (listStack.length > 0) {
      processedLines.push('</li>');
      processedLines.push("</".concat(listStack.pop().type, ">"));
    }
    return processedLines.join('\n');
  };

  // Primary markdown parser — delegates to the shared marked library when
  // available so that preview and presentation rendering stay in sync.
  // Falls back to the built-in regex parser when marked isn't loaded.
  var parseMarkdownContent = function parseMarkdownContent(content) {
    if (window.marked && typeof window.marked.parse === 'function') {
      try {
        var html = window.marked.parse(content, {
          breaks: false
        });

        // Fix image paths — convert relative to file:// URLs
        html = html.replace(/<img\s+src="([^"]+)"/g, function (match, src) {
          if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('file://') && !src.startsWith('data:')) {
            var _window$appSettings3;
            var baseDir = window.currentFileDirectory || ((_window$appSettings3 = window.appSettings) === null || _window$appSettings3 === void 0 ? void 0 : _window$appSettings3.workingDirectory);
            if (baseDir) return "<img src=\"file://".concat(baseDir, "/").concat(src, "\"");
          }
          return match;
        });

        // Auto-embed YouTube URLs that are sole content of a paragraph
        html = html.replace(/<p>\s*(?:<a[^>]*>)?\s*https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)(?:[^<\s]*)?\s*(?:<\/a>)?\s*<\/p>/gi, function (match, videoId) {
          return "<div class=\"slide-video-wrapper\"><iframe src=\"https://www.youtube.com/embed/".concat(videoId, "\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\" allowfullscreen></iframe></div>");
        });

        // Auto-embed Zoom meeting/recording links
        html = html.replace(/<p>\s*(?:<a[^>]*>)?\s*(https?:\/\/[\w.-]*zoom\.us\/(?:j|rec\/(?:share|play))\/[^\s<]+)\s*(?:<\/a>)?\s*<\/p>/gi, function (match, url) {
          return "<div class=\"slide-video-wrapper\"><iframe src=\"".concat(url, "\" frameborder=\"0\" allow=\"microphone; camera; fullscreen\" allowfullscreen sandbox=\"allow-same-origin allow-scripts allow-forms allow-popups\"></iframe></div>");
        });
        return sanitizeRenderedHTML(html);
      } catch (error) {
        console.warn('[MarkdownParser] marked.parse failed, using fallback:', error);
      }
    }
    return _fallbackParseMarkdown(content);
  };

  // Fallback regex-based markdown parser (used when marked is not available)
  var _fallbackParseMarkdown = function _fallbackParseMarkdown(content) {
    var html = content;

    // Handle code blocks first
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');

    // Headers
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Fix image paths - convert relative paths to absolute file:// URLs
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (match, altText, imagePath) {
      // Check if this is a relative path
      if (imagePath && !imagePath.startsWith('http') && !imagePath.startsWith('/') && !imagePath.startsWith('file://')) {
        var _window$appSettings4;
        // Use current file directory if available, otherwise fallback to working directory
        var baseDir = window.currentFileDirectory || ((_window$appSettings4 = window.appSettings) === null || _window$appSettings4 === void 0 ? void 0 : _window$appSettings4.workingDirectory);
        if (baseDir) {
          var fullPath = "file://".concat(baseDir, "/").concat(imagePath);
          console.log("[React Presentation] Converting image path: ".concat(imagePath, " -> ").concat(fullPath));
          return "<img src=\"".concat(fullPath, "\" alt=\"").concat(altText, "\" />");
        }
      }
      return "<img src=\"".concat(imagePath, "\" alt=\"").concat(altText, "\" />");
    });

    // YouTube video embeds — bare URL on its own line becomes an iframe
    html = html.replace(/^(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)(?:[&?][^\s]*)?)$/gm, function (match, url, videoId) {
      return "<div class=\"slide-video-wrapper\"><iframe src=\"https://www.youtube.com/embed/".concat(videoId, "\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\" allowfullscreen></iframe></div>");
    });

    // Zoom meeting/recording embeds — bare URL on its own line
    html = html.replace(/^(https?:\/\/[\w.-]*zoom\.us\/(?:j|rec\/(?:share|play))\/[^\s]+)$/gm, function (match, url) {
      return "<div class=\"slide-video-wrapper\"><iframe src=\"".concat(url, "\" frameborder=\"0\" allow=\"microphone; camera; fullscreen\" allowfullscreen sandbox=\"allow-same-origin allow-scripts allow-forms allow-popups\"></iframe></div>");
    });

    // Process math expressions before other markdown to preserve them
    // Note: We preserve LaTeX math syntax for MathJax to process later
    // This ensures math expressions don't get processed as other markdown

    // Store math expressions to protect them from markdown processing
    var mathExpressions = [];
    var mathCounter = 0;

    // Preserve display math ($$...$$)
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, function (match) {
      var placeholder = "MATH_DISPLAY_".concat(mathCounter++);
      mathExpressions.push({
        placeholder: placeholder,
        content: match
      });
      return placeholder;
    });

    // Preserve inline math ($...$)
    html = html.replace(/\$([^$\n]+?)\$/g, function (match) {
      var placeholder = "MATH_INLINE_".concat(mathCounter++);
      mathExpressions.push({
        placeholder: placeholder,
        content: match
      });
      return placeholder;
    });

    // Process Obsidian-style [[]] internal links first
    html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (match, link, displayText) {
      var cleanLink = link.trim();
      var display = displayText ? displayText.trim() : cleanLink;
      var filePath = cleanLink;
      if (!filePath.endsWith('.md') && !filePath.includes('.')) {
        filePath += '.md';
      }

      // Create full path for internal links, similar to image path logic
      if (!filePath.startsWith('/') && !filePath.startsWith('http')) {
        var _window$appSettings5;
        var baseDir = window.currentFileDirectory || ((_window$appSettings5 = window.appSettings) === null || _window$appSettings5 === void 0 ? void 0 : _window$appSettings5.workingDirectory);
        if (baseDir) {
          filePath = "".concat(baseDir, "/").concat(filePath);
        }
      }
      return "<a href=\"#\" class=\"internal-link\" data-link=\"".concat(encodeURIComponent(filePath), "\" data-original-link=\"").concat(encodeURIComponent(cleanLink), "\" title=\"Open ").concat(display, "\">").concat(display, "</a>");
    });

    // Regular markdown links
    html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Handle tables - simpler approach
    // First, let's collect all table-related lines
    var lines = html.split('\n');
    var processedLines = [];
    var currentTable = [];
    var inTable = false;
    var _loop = function _loop() {
      var line = lines[i].trim();

      // Check if this is a table row (starts and ends with |)
      if (line.startsWith('|') && line.endsWith('|') && line.includes('|')) {
        // Check if this is a separator row (contains only |, -, and spaces)
        var isSeparator = /^\|[\s\-\|]+\|$/.test(line);
        if (!isSeparator) {
          if (!inTable) {
            inTable = true;
            currentTable = [];
          }

          // Parse the row
          var cells = line.slice(1, -1).split('|').map(function (cell) {
            return cell.trim();
          });

          // Check if next line is a separator to determine if this is header
          var nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
          var nextIsSeparator = /^\|[\s\-\|]+\|$/.test(nextLine);
          var isHeader = nextIsSeparator && currentTable.length === 0;
          var cellTag = isHeader ? 'th' : 'td';
          var htmlRow = "<tr>".concat(cells.map(function (cell) {
            return "<".concat(cellTag, ">").concat(cell, "</").concat(cellTag, ">");
          }).join(''), "</tr>");
          currentTable.push(htmlRow);
        }
        // Skip separator rows
      } else {
        // Not a table row
        if (inTable && currentTable.length > 0) {
          // End current table
          processedLines.push("<table class=\"presentation-table\">".concat(currentTable.join(''), "</table>"));
          currentTable = [];
          inTable = false;
        }
        if (line || !inTable) {
          processedLines.push(lines[i]); // Keep original line with spacing
        }
      }
    };
    for (var i = 0; i < lines.length; i++) {
      _loop();
    }

    // Handle table at end of content
    if (inTable && currentTable.length > 0) {
      processedLines.push("<table class=\"presentation-table\">".concat(currentTable.join(''), "</table>"));
    }
    html = processedLines.join('\n');

    // Handle nested lists properly
    console.log('[MarkdownParser] Before list processing:', html.substring(0, 200));
    html = processNestedLists(html);
    console.log('[MarkdownParser] After list processing:', html.substring(0, 400));

    // Blockquotes - handle multi-line blockquotes properly
    // First, collect all blockquote lines and group them
    var blockquoteLines_raw = html.split('\n');
    var inBlockquote = false;
    var blockquoteLines = [];
    var blockquoteProcessedLines = [];
    for (var _i = 0; _i < blockquoteLines_raw.length; _i++) {
      var line = blockquoteLines_raw[_i];
      var blockquoteMatch = line.match(/^>\s*(.*)/);
      if (blockquoteMatch) {
        // This is a blockquote line
        if (!inBlockquote) {
          inBlockquote = true;
          blockquoteLines = [];
        }
        blockquoteLines.push(blockquoteMatch[1]); // Content after '> '
      } else {
        // Not a blockquote line
        if (inBlockquote) {
          // End of blockquote, process accumulated lines
          var blockquoteContent = blockquoteLines.join('<br>').trim();
          blockquoteProcessedLines.push("<blockquote class=\"presentation-blockquote\">".concat(blockquoteContent, "</blockquote>"));
          inBlockquote = false;
          blockquoteLines = [];
        }
        blockquoteProcessedLines.push(line);
      }
    }

    // Handle case where blockquote is at the end of content
    if (inBlockquote && blockquoteLines.length > 0) {
      var _blockquoteContent = blockquoteLines.join('<br>').trim();
      blockquoteProcessedLines.push("<blockquote class=\"presentation-blockquote\">".concat(_blockquoteContent, "</blockquote>"));
    }
    html = blockquoteProcessedLines.join('\n');

    // Horizontal rules
    html = html.replace(/^---\s*$/gm, '<hr>');

    // Convert remaining text to paragraphs
    var paragraphLines = html.split('\n');
    var finalProcessedLines = paragraphLines.map(function (line) {
      var trimmed = line.trim();
      if (!trimmed || trimmed.match(/^<(h[1-6]|ul|ol|li|blockquote|pre|hr|div)/)) {
        return line;
      }
      return trimmed ? "<p>".concat(trimmed, "</p>") : '';
    });
    html = finalProcessedLines.join('\n');
    html = html.replace(/\n+/g, '\n');
    html = html.replace(/<p>\s*<\/p>/g, '');

    // Restore math expressions
    mathExpressions.forEach(function (_ref4) {
      var placeholder = _ref4.placeholder,
        content = _ref4.content;
      html = html.replace(placeholder, content);
    });
    return sanitizeRenderedHTML(html);
  };

  // Extract speaker notes from slide content
  var extractSpeakerNotes = function extractSpeakerNotes(slideContent) {
    // Extracting speaker notes

    // More flexible regex pattern for speaker notes
    var notesRegex = /```notes\s*\n([\s\S]*?)\n```/g;
    var notes = [];
    var match;
    while ((match = notesRegex.exec(slideContent)) !== null) {
      var noteContent = match[1].trim();
      // Found speaker note
      notes.push(noteContent);
    }

    // Remove speaker notes from slide content (more flexible pattern)
    var cleanContent = slideContent.replace(/```notes\s*\n[\s\S]*?\n```/g, '').trim();
    var result = {
      cleanContent: cleanContent,
      speakerNotes: notes.join('\n\n')
    };

    // Speaker notes extraction complete
    return result;
  };

  // Extract slide directives (e.g., background image) from HTML comments
  var extractSlideDirectives = function extractSlideDirectives(slideContent) {
    var bgRegex = /<!--\s*bg:\s*(.+?)\s*-->/i;
    var match = bgRegex.exec(slideContent);
    var backgroundImage = null;
    if (match) {
      var _window$appSettings6, _contentSecurity;
      var imagePath = match[1].trim();
      var baseDir = window.currentFileDirectory || ((_window$appSettings6 = window.appSettings) === null || _window$appSettings6 === void 0 ? void 0 : _window$appSettings6.workingDirectory);
      backgroundImage = (_contentSecurity = contentSecurity) !== null && _contentSecurity !== void 0 && _contentSecurity.resolveImageUrl ? contentSecurity.resolveImageUrl(imagePath, baseDir) : null;
    }

    // Remove bg directive and all remaining HTML comments from visible content
    var cleanContent = slideContent.replace(/<!--\s*bg:\s*.+?\s*-->\s*/gi, '').replace(/<!--[\s\S]*?-->\s*/g, '').trim();
    return {
      cleanContent: cleanContent,
      backgroundImage: backgroundImage
    };
  };
  var calculateAuthoringFocus = useCallback(function (slide) {
    var _navigationControlsRe3, _navigationControlsRe4, _window$NightOwlPrese6, _window$NightOwlPrese7;
    var preferredZoom = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1.2;
    var canvas = canvasRef.current;
    var container = containerRef.current;
    if (!canvas || !container || !slide || !canvas.clientWidth || !canvas.clientHeight) {
      return null;
    }
    var containerBounds = container.getBoundingClientRect();
    var topControls = Array.from(container.querySelectorAll('[aria-label="Presentation layout"], [aria-label="Presentation editor controls"]'));
    var controlsBottom = topControls.reduce(function (maximum, element) {
      return Math.max(maximum, element.getBoundingClientRect().bottom);
    }, containerBounds.top);
    var navigationBounds = (_navigationControlsRe3 = navigationControlsRef.current) === null || _navigationControlsRe3 === void 0 || (_navigationControlsRe4 = _navigationControlsRe3.getBoundingClientRect) === null || _navigationControlsRe4 === void 0 ? void 0 : _navigationControlsRe4.call(_navigationControlsRe3);
    var insets = {
      top: Math.max(16, controlsBottom - containerBounds.top + 12),
      right: 16,
      bottom: navigationBounds ? Math.max(16, containerBounds.bottom - navigationBounds.top + 12) : 16,
      left: 16
    };
    var fit = (_window$NightOwlPrese6 = window.NightOwlPresentationViewport) === null || _window$NightOwlPrese6 === void 0 || (_window$NightOwlPrese7 = _window$NightOwlPrese6.calculateFitTransform) === null || _window$NightOwlPrese7 === void 0 ? void 0 : _window$NightOwlPrese7.call(_window$NightOwlPrese6, {
      viewportWidth: canvas.clientWidth,
      viewportHeight: canvas.clientHeight,
      slideX: slide.position.x,
      slideY: slide.position.y,
      slideWidth: SLIDE_WIDTH,
      slideHeight: SLIDE_HEIGHT,
      padding: 12,
      insets: insets
    });
    if (!fit) {
      var _zoomLevel = Number(preferredZoom) || 1;
      return {
        zoom: _zoomLevel,
        pan: {
          x: canvas.clientWidth / 2 - slide.position.x * _zoomLevel,
          y: canvas.clientHeight / 2 - slide.position.y * _zoomLevel
        }
      };
    }
    var zoomLevel = Math.min(Number(preferredZoom) || fit.scale, fit.scale);
    var center = {
      x: fit.pan.x + slide.position.x * fit.scale,
      y: fit.pan.y + slide.position.y * fit.scale
    };
    return {
      zoom: zoomLevel,
      pan: {
        x: center.x - slide.position.x * zoomLevel,
        y: center.y - slide.position.y * zoomLevel
      }
    };
  }, []);
  useLayoutEffect(function () {
    if (isPresenting || slides.length === 0) return undefined;
    var stage = stageRef.current;
    var container = containerRef.current;
    if (!stage || !container) return undefined;
    var animationFrame = null;
    var refitAuthoringView = function refitAuthoringView() {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(function () {
        animationFrame = null;
        var slideIndex = Math.min(currentSlideRef.current, slides.length - 1);
        var focus = calculateAuthoringFocus(slides[slideIndex], authoringPreferredZoomRef.current);
        if (!focus) return;
        zoomRef.current = focus.zoom;
        panRef.current = focus.pan;
        setZoom(function (previous) {
          return Math.abs(previous - focus.zoom) > 0.0001 ? focus.zoom : previous;
        });
        setPan(function (previous) {
          return Math.abs(previous.x - focus.pan.x) > 0.1 || Math.abs(previous.y - focus.pan.y) > 0.1 ? focus.pan : previous;
        });
      });
    };
    refitAuthoringView();
    var resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(refitAuthoringView) : null;
    resizeObserver === null || resizeObserver === void 0 || resizeObserver.observe(stage);
    resizeObserver === null || resizeObserver === void 0 || resizeObserver.observe(container);
    window.addEventListener('resize', refitAuthoringView);
    return function () {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver === null || resizeObserver === void 0 || resizeObserver.disconnect();
      window.removeEventListener('resize', refitAuthoringView);
    };
  }, [isPresenting, slides, currentSlide, calculateAuthoringFocus]);

  // Parse markdown into slides
  var parseMarkdown = function parseMarkdown(markdown) {
    try {
      var _window$NightOwlPrese8, _window$NightOwlPrese9;
      // Strip trailing whitespace from the entire markdown content first
      var trimmedMarkdown = markdown.replace(/[ \t]+$/gm, '');

      // Preflight owns the canonical slide boundaries so rendering, source-line
      // navigation, and diagnostics cannot disagree about front matter or
      // CommonMark thematic breaks.
      var sourceSlides = ((_window$NightOwlPrese8 = window.NightOwlPresentationPreflight) === null || _window$NightOwlPrese8 === void 0 || (_window$NightOwlPrese9 = _window$NightOwlPrese8.splitSlides) === null || _window$NightOwlPrese9 === void 0 ? void 0 : _window$NightOwlPrese9.call(_window$NightOwlPrese8, trimmedMarkdown)) || [];
      var renderSlides = sourceSlides.length > 0 ? sourceSlides : [{
        markdown: trimmedMarkdown.trim(),
        startLine: 1,
        title: 'Slide 1'
      }].filter(function (slide) {
        return slide.markdown;
      });
      return renderSlides.map(function (sourceSlide, index) {
        var text = sourceSlide.markdown;
        var _extractSpeakerNotes = extractSpeakerNotes(text),
          afterNotes = _extractSpeakerNotes.cleanContent,
          speakerNotes = _extractSpeakerNotes.speakerNotes;
        var _extractSlideDirectiv = extractSlideDirectives(afterNotes),
          cleanContent = _extractSlideDirectiv.cleanContent,
          backgroundImage = _extractSlideDirectiv.backgroundImage;
        return {
          id: index,
          content: text,
          cleanContent: cleanContent,
          speakerNotes: speakerNotes,
          backgroundImage: backgroundImage,
          title: (sourceSlide === null || sourceSlide === void 0 ? void 0 : sourceSlide.title) || "Slide ".concat(index + 1),
          sourceLine: (sourceSlide === null || sourceSlide === void 0 ? void 0 : sourceSlide.startLine) || 1,
          position: calculateSlidePosition(index, renderSlides.length),
          parsed: parseMarkdownContent(cleanContent)
        };
      });
    } catch (error) {
      console.error('[Presentation] Failed to parse slide content:', error);
      if (typeof onPresentationError === 'function') {
        onPresentationError(error);
      }
      return [];
    }
  };

  // Initialize - wait for content from editor or use sample as fallback
  useEffect(function () {
    // Initializing presentation component

    // Brief delay to allow content synchronization from editor
    var initTimeout = setTimeout(function () {
      // Prefer the mount prop so a newly mounted component receives the current
      // document exactly once. The pending global remains a compatibility path
      // for older callers that do not supply a prop.
      var initialContent = markdown || window.pendingPresentationContent || sampleMarkdown;
      setSourceMarkdown(initialContent);
      setSlides(parseMarkdown(initialContent));
      window.pendingPresentationContent = null;
    }, 100); // Small delay to allow content synchronization

    return function () {
      return clearTimeout(initTimeout);
    };
  }, []);

  // Navigate to specific slide with smooth transition
  var goToSlide = useCallback(function (slideIndex) {
    var _retries = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    if (slideIndex < 0 || slideIndex >= slides.length) return;
    var MAX_RETRIES = 20;
    var slide = slides[slideIndex];
    var canvas = canvasRef.current;
    if (!isPresenting) {
      // The overview needs canvas geometry to calculate pan. Delivery mode
      // does not: blocking its state transition on a hidden or resizing canvas
      // makes presenter Next/Previous silently exhaust their retries.
      if (!canvas) {
        if (_retries < MAX_RETRIES) {
          setTimeout(function () {
            return goToSlide(slideIndex, _retries + 1);
          }, 50);
        }
        return;
      }
      if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
        if (_retries < MAX_RETRIES) {
          setTimeout(function () {
            return goToSlide(slideIndex, _retries + 1);
          }, 50);
        }
        return;
      }
      var focus = calculateAuthoringFocus(slide, 1.2);
      if (!focus) return;
      authoringPreferredZoomRef.current = 1.2;
      var targetZoom = focus.zoom;
      var targetPan = focus.pan;
      console.log('[Presentation] Fitting slide', slideIndex, 'at position:', targetPan, 'zoom:', targetZoom);
      markZoomInteraction();
      zoomRef.current = targetZoom;
      panRef.current = targetPan;
      setZoom(targetZoom);
      setPan(targetPan);
    }
    currentSlideRef.current = slideIndex;
    setCurrentSlide(slideIndex);
    setFocusedSlide(null);

    // Mark slide transition in recording if recording is active
    if (isRecording && window.videoRecordingService) {
      var _slides$slideIndex;
      var slideTitle = ((_slides$slideIndex = slides[slideIndex]) === null || _slides$slideIndex === void 0 ? void 0 : _slides$slideIndex.content.split('\n')[0]) || "Slide ".concat(slideIndex + 1);
      window.videoRecordingService.markSlideTransition(slideIndex + 1, slideTitle);
      console.log('[VIDEO] Marked slide transition:', slideIndex + 1, slideTitle);
    }

    // Ensure speaker notes are updated immediately when slide changes
    // This is especially important on second presentation load
    if (isPresenting && window.updateSpeakerNotes && typeof window.updateSpeakerNotes === 'function' && slides.length > 0) {
      var currentContent = slides.map(function (slide) {
        return slide.content;
      }).join('\n\n---\n\n');
      // Use setTimeout to ensure state update completes first
      setTimeout(function () {
        window.updateSpeakerNotes(slideIndex, currentContent);
      }, 50);
    }
  }, [slides, isPresenting, isRecording, markZoomInteraction, calculateAuthoringFocus]);
  var runPreflight = useCallback(/*#__PURE__*/_asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
    var preflight, unavailable, _window$appSettings7, _window$electronAPI2, report, failure, _t;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          preflight = window.NightOwlPresentationPreflight;
          if (preflight !== null && preflight !== void 0 && preflight.run) {
            _context.n = 1;
            break;
          }
          unavailable = {
            success: false,
            error: 'Presentation preflight engine is unavailable',
            warnings: []
          };
          setPreflightReport(unavailable);
          return _context.a(2, unavailable);
        case 1:
          setPreflightRunning(true);
          _context.p = 2;
          _context.n = 3;
          return new Promise(function (resolve) {
            return requestAnimationFrame(function () {
              return requestAnimationFrame(resolve);
            });
          });
        case 3:
          _context.n = 4;
          return preflight.run({
            markdown: sourceMarkdown || slides.map(function (slide) {
              return slide.content;
            }).join('\n\n---\n\n'),
            root: containerRef.current,
            baseDir: window.currentFileDirectory || ((_window$appSettings7 = window.appSettings) === null || _window$appSettings7 === void 0 ? void 0 : _window$appSettings7.workingDirectory),
            suppressions: preflightSuppressions,
            assetExists: (_window$electronAPI2 = window.electronAPI) !== null && _window$electronAPI2 !== void 0 && (_window$electronAPI2 = _window$electronAPI2.files) !== null && _window$electronAPI2 !== void 0 && _window$electronAPI2.checkFileExists ? function (filePath) {
              return window.electronAPI.files.checkFileExists(filePath);
            } : null
          });
        case 4:
          report = _context.v;
          setPreflightReport(report);
          return _context.a(2, report);
        case 5:
          _context.p = 5;
          _t = _context.v;
          failure = {
            success: false,
            error: _t.message || String(_t),
            warnings: []
          };
          setPreflightReport(failure);
          return _context.a(2, failure);
        case 6:
          _context.p = 6;
          setPreflightRunning(false);
          return _context.f(6);
        case 7:
          return _context.a(2);
      }
    }, _callee, null, [[2, 5, 6, 7]]);
  })), [sourceMarkdown, slides, preflightSuppressions]);
  var suppressPreflightWarning = useCallback(function (warningId) {
    setPreflightSuppressions(function (previous) {
      var next = _toConsumableArray(new Set([].concat(_toConsumableArray(previous), [warningId])));
      writeStoredList(presentationSessionKey('preflight-suppressions'), next);
      return next;
    });
  }, []);
  var resetPreflightSuppressions = useCallback(function () {
    writeStoredList(presentationSessionKey('preflight-suppressions'), []);
    setPreflightSuppressions([]);
  }, []);
  var navigateToPreflightWarning = useCallback(function (item) {
    var _window$editor;
    goToSlide(item.slideIndex);
    setFocusedSlide(item.slideIndex);
    if (item.sourceLine && (_window$editor = window.editor) !== null && _window$editor !== void 0 && _window$editor.setPosition) {
      var _window$editor$reveal, _window$editor2;
      window.editor.setPosition({
        lineNumber: item.sourceLine,
        column: 1
      });
      (_window$editor$reveal = (_window$editor2 = window.editor).revealLineInCenter) === null || _window$editor$reveal === void 0 || _window$editor$reveal.call(_window$editor2, item.sourceLine);
    }
  }, [goToSlide]);
  useEffect(function () {
    if (!preflightOpen) return undefined;
    var timer = setTimeout(runPreflight, 50);
    return function () {
      return clearTimeout(timer);
    };
  }, [preflightOpen, sourceMarkdown, slides.length, preflightSuppressions, runPreflight]);
  useEffect(function () {
    if (!isPresenting) {
      presenterStartedAtRef.current = null;
      setPresenterElapsed(0);
      return undefined;
    }
    presenterStartedAtRef.current = Date.now();
    var update = function update() {
      setPresenterElapsed(Math.max(0, Math.floor((Date.now() - presenterStartedAtRef.current) / 1000)));
    };
    update();
    var timer = setInterval(update, 1000);
    return function () {
      return clearInterval(timer);
    };
  }, [isPresenting]);
  useEffect(function () {
    try {
      var _window$sessionStorag2, _window$sessionStorag3;
      if (presenterConsoleOpen) (_window$sessionStorag2 = window.sessionStorage) === null || _window$sessionStorag2 === void 0 || _window$sessionStorag2.setItem(presentationSessionKey('console'), 'open');else (_window$sessionStorag3 = window.sessionStorage) === null || _window$sessionStorag3 === void 0 || _window$sessionStorag3.removeItem(presentationSessionKey('console'));
    } catch (_) {
      // Console state still survives content refreshes and viewport changes.
    }
  }, [presenterConsoleOpen]);
  useEffect(function () {
    var controller = Object.freeze({
      runPreflight: runPreflight,
      startPresentation: function startPresentation() {
        previousFocusRef.current = document.activeElement;
        setIsPresenting(true);
      },
      openPreflight: function openPreflight() {
        return setPreflightOpen(true);
      },
      closePreflight: function closePreflight() {
        return setPreflightOpen(false);
      },
      openPresenterConsole: function openPresenterConsole() {
        return setPresenterConsoleOpen(true);
      },
      closePresenterConsole: function closePresenterConsole() {
        return setPresenterConsoleOpen(false);
      },
      getState: function getState() {
        return {
          currentSlide: currentSlide,
          isPresenting: isPresenting,
          preflightOpen: preflightOpen,
          preflightRunning: preflightRunning,
          preflightReport: preflightReport,
          presenterConsoleOpen: presenterConsoleOpen,
          presenterElapsed: presenterElapsed,
          slideCount: slides.length
        };
      }
    });
    window.NightOwlPresentationTools = controller;
    return function () {
      if (window.NightOwlPresentationTools === controller) delete window.NightOwlPresentationTools;
    };
  }, [currentSlide, isPresenting, preflightOpen, preflightReport, preflightRunning, presenterConsoleOpen, presenterElapsed, runPreflight, slides.length]);

  // Center the selected slide when the overview canvas becomes active.
  useEffect(function () {
    var centeringTimer = null;
    var checkIfPresentationActive = function checkIfPresentationActive() {
      var presentationContent = document.getElementById('presentation-content');
      if (presentationContent && presentationContent.classList.contains('active')) {
        // Delivery mode fits its own stage. Scheduling canvas navigation there
        // can overwrite a presenter's Next/Previous action after live reload.
        if (!isPresenting && slides.length > 0 && pan.x === 0 && pan.y === 0 && zoom === 1) {
          console.log('[Presentation] Presentation view activated, centering selected slide');
          clearTimeout(centeringTimer);
          centeringTimer = setTimeout(function () {
            if (canvasRef.current && canvasRef.current.clientWidth > 0) {
              goToSlide(Math.min(currentSlideRef.current, slides.length - 1));
            }
          }, 150); // Slightly longer delay to ensure view is fully active
        }
      }
    };

    // Set up a mutation observer to watch for class changes on the presentation content
    var presentationContent = document.getElementById('presentation-content');
    if (presentationContent) {
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            checkIfPresentationActive();
          }
        });
      });
      observer.observe(presentationContent, {
        attributes: true,
        attributeFilter: ['class']
      });

      // Also check immediately in case it's already active
      checkIfPresentationActive();
      return function () {
        observer.disconnect();
        clearTimeout(centeringTimer);
      };
    }
    return function () {
      return clearTimeout(centeringTimer);
    };
  }, [slides.length, pan.x, pan.y, zoom, isPresenting, goToSlide]);

  // Listen for content updates from the lecture summary generator
  useEffect(function () {
    var handleContentUpdate = function handleContentUpdate(event) {
      var _event$detail;
      // Received content update event
      var newContent = (_event$detail = event.detail) === null || _event$detail === void 0 ? void 0 : _event$detail.content;
      if (newContent && newContent.trim()) {
        // Parsing new content into slides
        var newSlides = parseMarkdown(newContent);
        var nextSlideIndex = Math.min(currentSlideRef.current, Math.max(0, newSlides.length - 1));
        setSourceMarkdown(newContent);
        setSlides(newSlides);
        currentSlideRef.current = nextSlideIndex;
        pendingContentSlideRef.current = nextSlideIndex;
        setCurrentSlide(nextSlideIndex);
        authoringPreferredZoomRef.current = 1.2;
        zoomRef.current = 1;
        panRef.current = {
          x: 0,
          y: 0
        };
        setZoom(1);
        setPan({
          x: 0,
          y: 0
        });
        setFocusedSlide(null);
        // Successfully updated slides
      } else {
        console.warn('[React Presentation] No valid content received');
      }
    };

    // Setting up content update listener
    window.addEventListener('updatePresentationContent', handleContentUpdate);
    return function () {
      // Removing content update listener
      window.removeEventListener('updatePresentationContent', handleContentUpdate);
    };
  }, []);

  // Reconcile navigation only after React has committed the newly parsed deck.
  // This avoids a stale delayed callback overwriting a presenter action taken
  // immediately after a live content refresh.
  useEffect(function () {
    if (pendingContentSlideRef.current === null || slides.length === 0) return;
    var slideIndex = Math.min(pendingContentSlideRef.current, slides.length - 1);
    pendingContentSlideRef.current = null;
    // Delivery mode has no overview canvas to reconcile. The state and ref were
    // committed in handleContentUpdate; navigating again from this passive
    // effect can race a presenter Next/Previous action after live reload.
    if (isPresenting) return;
    goToSlide(slideIndex);
  }, [slides, isPresenting, goToSlide]);
  useEffect(function () {
    if (slides.length === 0) return;
    window.dispatchEvent(new CustomEvent('nightowl:presentation-content-ready', {
      detail: {
        slides: slides.length
      }
    }));
  }, [slides]);

  // Set up Electron API listeners (only once)
  useEffect(function () {
    var _window$electronAPI3;
    var unsubscribers = [];
    if (isElectron && (_window$electronAPI3 = window.electronAPI) !== null && _window$electronAPI3 !== void 0 && _window$electronAPI3.events) {
      // File loading
      unsubscribers.push(window.electronAPI.events.loadPresentationFile(function (content, filePath, error) {
        if (error) {
          console.error('Error loading file:', error);
          return;
        }
        if (content) {
          var newSlides = parseMarkdown(content);
          setSourceMarkdown(content);
          setSlides(newSlides);
          setCurrentSlide(0);
          // Ensure canvas is ready before centering first slide
          setTimeout(function () {
            if (canvasRef.current && newSlides.length > 0) {
              console.log('[Presentation] Centering first slide on presentation start');
              goToSlide(0);
            }
          }, 100); // Give more time for canvas to be ready
        }
      }));

      // Presentation controls
      unsubscribers.push(window.electronAPI.events.startPresentation(function () {
        setIsPresenting(true);
      }));
      unsubscribers.push(window.electronAPI.events.exitPresentation(function () {
        console.log('[PRESENTATION] External exit presentation triggered...');

        // Stop TTS audio
        stopSpeaking();

        // Stop video recording if active
        if (isRecording && window.videoRecordingService) {
          console.log('[VIDEO] Stopping recording on external exit');
          stopRecording();
        }
        setIsPresenting(false);
      }));
      unsubscribers.push(window.electronAPI.events.togglePresentationMode(function () {
        // Switch to presentation mode
        switchToMode('presentation');
      }));

      // Auto-generate and show statistics
      unsubscribers.push(window.electronAPI.events.showPresentationStatistics(function () {
        console.log('[PRESENTATION] Auto-generating and showing statistics');
        // Auto-switch to statistics view and display immediately
        if (window.switchStructureView) {
          window.switchStructureView('statistics');
        }
      }));

      // Zoom controls
      unsubscribers.push(window.electronAPI.events.zoomIn(function () {
        handleZoomIn();
      }));
      unsubscribers.push(window.electronAPI.events.zoomOut(function () {
        handleZoomOut();
      }));
      unsubscribers.push(window.electronAPI.events.resetZoom(function () {
        _resetView();
      }));

      // Layout changes
      unsubscribers.push(window.electronAPI.events.changeLayout(function (layout) {
        setLayoutType(layout);
      }));
    }
    return function () {
      unsubscribers.forEach(function (unsubscribe) {
        return unsubscribe === null || unsubscribe === void 0 ? void 0 : unsubscribe();
      });
    };
  }, []);

  // Reset the legacy navigation flag without disturbing listeners owned by
  // other renderer features.
  useEffect(function () {
    window.navigationListenersSetup = false;
  }, []); // Run once on mount

  // Recalculate positions when layout changes
  useEffect(function () {
    if (slides.length > 0) {
      var updatedSlides = slides.map(function (slide, index) {
        return _objectSpread(_objectSpread({}, slide), {}, {
          position: calculateSlidePosition(index, slides.length)
        });
      });
      setSlides(updatedSlides);
    }
  }, [layoutType]);

  // Center view on first slide when slides are initially loaded
  useEffect(function () {
    if (isPresenting || slides.length === 0 || !canvasRef.current) return undefined;
    if (pan.x !== 0 || pan.y !== 0 || zoom !== 1 || currentSlide !== 0) return undefined;
    console.log('[Presentation] Initial slides loaded, centering on first slide');
    var timer = setTimeout(function () {
      if (canvasRef.current && canvasRef.current.clientWidth > 0) {
        goToSlide(0);
      }
    }, 100);
    return function () {
      return clearTimeout(timer);
    };
  }, [slides.length, pan.x, pan.y, zoom, currentSlide, isPresenting, goToSlide]);

  // Render math in slides whenever slides change or current slide changes
  useEffect(function () {
    if (slides.length > 0 && window.MathJax && window.MathJax.typesetPromise) {
      console.log('[MathJax] Triggering math rendering for', slides.length, 'slides');

      // Small delay to ensure slides are rendered in DOM
      var timer = setTimeout(function () {
        var presentationContainer = document.getElementById('presentation-content');
        if (presentationContainer) {
          console.log('[MathJax] Rendering math in presentation container');
          window.MathJax.typesetPromise([presentationContainer]).then(function () {
            return console.log('[MathJax] Math rendering completed successfully');
          }).catch(function (err) {
            return console.error('[MathJax] Error rendering math in presentation:', err);
          });
        } else {
          console.warn('[MathJax] Presentation container not found');
        }
      }, 200);
      return function () {
        return clearTimeout(timer);
      };
    } else {
      var _window$MathJax;
      if (slides.length === 0) console.log('[MathJax] No slides to render');
      if (!window.MathJax) console.log('[MathJax] MathJax not available');
      if (!((_window$MathJax = window.MathJax) !== null && _window$MathJax !== void 0 && _window$MathJax.typesetPromise)) console.log('[MathJax] typesetPromise not available');
    }
  }, [slides, currentSlide]);

  // Handle double click on slide to zoom in and focus
  var computeCenteredPan = function computeCenteredPan(slide, zoomLevel) {
    var fallbackPan = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : panRef.current;
    var canvas = canvasRef.current;
    if (!canvas || !slide) {
      return fallbackPan;
    }
    var viewportCenterX = canvas.clientWidth / 2;
    var viewportCenterY = canvas.clientHeight / 2;
    return {
      x: viewportCenterX - slide.position.x * zoomLevel,
      y: viewportCenterY - slide.position.y * zoomLevel
    };
  };
  var handleSlideDoubleClick = function handleSlideDoubleClick(slideIndex) {
    var slide = slides[slideIndex];
    if (!slide) return;
    markZoomInteraction();
    var targetZoom = 2;
    var targetPan = computeCenteredPan(slide, targetZoom);
    setCurrentSlide(slideIndex);
    setFocusedSlide(slideIndex);
    zoomRef.current = targetZoom;
    panRef.current = targetPan;
    setZoom(targetZoom);
    setPan(targetPan);
  };

  // Zoom handlers - zoom from current slide center
  var handleZoomIn = function handleZoomIn() {
    var newZoom = Math.min(MAX_ZOOM, zoom * 1.1);
    zoomFromCurrentSlide(newZoom);
  };
  var handleZoomOut = function handleZoomOut() {
    var newZoom = Math.max(MIN_ZOOM, zoom / 1.1);
    zoomFromCurrentSlide(newZoom);
  };

  // Helper function to zoom from current slide center
  var zoomFromCurrentSlide = function zoomFromCurrentSlide(requestedZoom) {
    var clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedZoom));
    if (Math.abs(clampedZoom - zoomRef.current) < 0.0001) {
      return;
    }
    markZoomInteraction();
    if (slides.length === 0 || currentSlide >= slides.length) {
      zoomRef.current = clampedZoom;
      setZoom(clampedZoom);
      return;
    }
    var slide = slides[currentSlide];
    var newPan = computeCenteredPan(slide, clampedZoom);
    zoomRef.current = clampedZoom;
    panRef.current = newPan;
    setZoom(clampedZoom);
    setPan(newPan);
  };
  var _resetView = function resetView() {
    var canvas = canvasRef.current;
    if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      setTimeout(function () {
        return _resetView();
      }, 50);
      return;
    }
    var baseSlideIndex = slides.length > 0 ? 0 : currentSlide;
    var focus = calculateAuthoringFocus(slides[baseSlideIndex], 1);
    var targetZoom = (focus === null || focus === void 0 ? void 0 : focus.zoom) || 1;
    var centeredPan = (focus === null || focus === void 0 ? void 0 : focus.pan) || computeCenteredPan(slides[baseSlideIndex], targetZoom, {
      x: 0,
      y: 0
    });
    markZoomInteraction();
    authoringPreferredZoomRef.current = 1;
    zoomRef.current = targetZoom;
    panRef.current = centeredPan;
    setZoom(targetZoom);
    setPan(centeredPan);
    if (slides.length > 0) {
      setCurrentSlide(baseSlideIndex);
    }
    setFocusedSlide(null);
    if (slides.length > 0 && isPresenting && window.updateSpeakerNotes && typeof window.updateSpeakerNotes === 'function') {
      var currentContent = slides.map(function (slide) {
        return slide.content;
      }).join('\n\n---\n\n');
      setTimeout(function () {
        window.updateSpeakerNotes(baseSlideIndex, currentContent);
      }, 50);
    }
  };

  // Wheel zoom effect with cursor-aware panning
  useEffect(function () {
    var container = containerRef.current;
    if (!container) return;
    var handleWheel = function handleWheel(e) {
      if (!containerRef.current) {
        return;
      }
      e.preventDefault();
      if (isPresenting) return;
      markZoomInteraction();
      var previousZoom = zoomRef.current || 1;
      var deltaModeMultiplier = e.deltaMode === 1 ? 33 : 1;
      var rawDelta = e.deltaY * deltaModeMultiplier;
      if (rawDelta === 0) {
        return;
      }
      var normalizedDelta = Math.max(-1, Math.min(1, rawDelta / 120));
      var zoomStep = e.ctrlKey || e.metaKey ? 0.12 : 0.08;
      var deltaMagnitude = Math.max(0.02, Math.abs(normalizedDelta) * zoomStep);
      var zoomFactor = 1 + deltaMagnitude;
      var targetZoom = normalizedDelta < 0 ? previousZoom * zoomFactor : previousZoom / zoomFactor;
      targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
      if (Math.abs(targetZoom - previousZoom) < 0.0001) {
        return;
      }
      var slide = slides[currentSlide];
      var newPan = computeCenteredPan(slide, targetZoom, panRef.current);
      zoomRef.current = targetZoom;
      panRef.current = newPan;
      setZoom(targetZoom);
      setPan(newPan);
    };
    container.addEventListener('wheel', handleWheel, {
      passive: false
    });
    return function () {
      return container.removeEventListener('wheel', handleWheel);
    };
  }, [markZoomInteraction, MAX_ZOOM, MIN_ZOOM, slides, currentSlide, isPresenting]);

  // Keyboard navigation
  useEffect(function () {
    var handleKeyPress = function handleKeyPress(e) {
      var _containerRef$current, _e$target$closest, _e$target;
      // Only handle keyboard events if we're in presentation view and not focused on an input element
      var isInPresentationView = Boolean(document.body.classList.contains('presentation-mode') && ((_containerRef$current = containerRef.current) === null || _containerRef$current === void 0 ? void 0 : _containerRef$current.isConnected));
      var isInputFocused = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
      var isInteractiveControl = Boolean((_e$target$closest = (_e$target = e.target).closest) === null || _e$target$closest === void 0 ? void 0 : _e$target$closest.call(_e$target, 'button, a[href], select, [role="button"], [role="menuitem"], [role="option"]'));
      if (!isInPresentationView || isInputFocused || isInteractiveControl) {
        return; // Preserve native keyboard behavior for focused controls.
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goToSlide(currentSlide + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToSlide(currentSlide - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToSlide(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToSlide(slides.length - 1);
      } else if (e.key === 'Escape') {
        console.log('[PRESENTATION] Escaping presentation mode...');

        // Stop TTS audio
        stopSpeaking();

        // Stop video recording if active
        if (isRecording && window.videoRecordingService) {
          console.log('[VIDEO] Stopping recording on escape');
          stopRecording();
        }
        setIsPresenting(false);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return function () {
      return window.removeEventListener('keydown', handleKeyPress);
    };
  }, [currentSlide, goToSlide, slides.length]);

  // Control body class for presenting mode
  useEffect(function () {
    if (isPresenting) {
      if (!previousFocusRef.current) previousFocusRef.current = document.activeElement;
      document.body.classList.add('is-presenting');
      console.log('[Presentation] Added is-presenting class to body');

      // Focus the main window to ensure keyboard navigation works immediately (multiple attempts)
      var focusMainWindow = function focusMainWindow() {
        var _window$electronAPI4;
        if ((_window$electronAPI4 = window.electronAPI) !== null && _window$electronAPI4 !== void 0 && (_window$electronAPI4 = _window$electronAPI4.presentation) !== null && _window$electronAPI4 !== void 0 && _window$electronAPI4.focusMainWindow) {
          window.electronAPI.presentation.focusMainWindow();
          console.log('[Presentation] Focused main window for keyboard navigation');
        } else {
          // Fallback for non-Electron environments
          window.focus();
        }
      };

      // Immediate focus
      focusMainWindow();
      requestAnimationFrame(function () {
        var _containerRef$current2;
        (_containerRef$current2 = containerRef.current) === null || _containerRef$current2 === void 0 || (_containerRef$current2 = _containerRef$current2.querySelector('[data-current-slide="true"]')) === null || _containerRef$current2 === void 0 || _containerRef$current2.focus({
          preventScroll: true
        });
      });

      // Additional focus attempts to override any focus stealing
      setTimeout(focusMainWindow, 100);
      setTimeout(focusMainWindow, 300);
      setTimeout(focusMainWindow, 600);

      // Hide sidebar speaker notes pane when entering presentation mode
      var sidebarPane = document.getElementById('speaker-notes-pane');
      if (sidebarPane) {
        sidebarPane.style.display = 'none';
        console.log('[Presentation] Hidden sidebar speaker notes pane on presentation start');
      }

      // Hide content toolbar (high z-index floating elements on right side)
      document.querySelectorAll('[class*="z-[12"]').forEach(function (el) {
        el.dataset.hiddenByPresentation = 'true';
        el.style.display = 'none';
      });
      // Also hide by checking fixed elements on right side with buttons
      document.querySelectorAll('body > div').forEach(function (el) {
        var style = window.getComputedStyle(el);
        var right = parseInt(style.right) || 999;
        var zIndex = parseInt(style.zIndex) || 0;
        var buttons = el.querySelectorAll('button');
        if (style.position === 'fixed' && right < 50 && zIndex > 1000 && buttons.length >= 3) {
          el.dataset.hiddenByPresentation = 'true';
          el.style.display = 'none';
        }
      });
      console.log('[Presentation] Hidden content toolbar');

      // Create speaker notes data if it doesn't exist (after flag reset, this should work properly)
      console.log('[Presentation] DEBUG: Checking speaker notes data creation:', {
        hasSpeakerNotesData: !!window.speakerNotesData,
        reactControlsFlag: window.REACT_CONTROLS_SPEAKER_NOTES,
        slidesLength: slides.length,
        slidesHaveNotes: slides.map(function (slide) {
          return !!slide.speakerNotes;
        })
      });
      if (!window.speakerNotesData && slides.length > 0) {
        var allNotes = slides.map(function (slide) {
          return slide.speakerNotes || '';
        });
        window.speakerNotesData = {
          allNotes: allNotes,
          currentSlide: 0,
          content: slides.map(function (slide) {
            return slide.content;
          }).join('\n\n---\n\n')
        };
        // Set flag to prevent legacy system from clearing our data
        window.REACT_CONTROLS_SPEAKER_NOTES = true;
        console.log('[Presentation] Created initial speaker notes data:', allNotes.length, 'slides with notes:', allNotes.filter(function (n) {
          return n;
        }).length);
        console.log('[Presentation] DEBUG: Sample notes preview:', allNotes.map(function (note, i) {
          return {
            slideIndex: i,
            hasNotes: !!note,
            length: note.length,
            preview: note ? note.substring(0, 50) + '...' : 'empty'
          };
        }));
      } else if (slides.length === 0) {
        console.log('[Presentation] DEBUG: No slides available for speaker notes creation');
      } else {
        console.log('[Presentation] DEBUG: Speaker notes data already exists, using existing data');
      }

      // Wait for legacy system to open window, then sync React state with it
      setTimeout(function () {
        if (window.speakerNotesData && window.SPEAKER_NOTES_WINDOW_OPEN) {
          var _window$electronAPI5;
          // Legacy system opened the window, sync our state
          setSpeakerNotesWindowVisible(true);
          window.explicitlySeparateWindow = true;
          console.log('[Presentation] React synced with legacy speaker notes window');

          // Focus main window after speaker notes window has opened and stolen focus
          if ((_window$electronAPI5 = window.electronAPI) !== null && _window$electronAPI5 !== void 0 && (_window$electronAPI5 = _window$electronAPI5.presentation) !== null && _window$electronAPI5 !== void 0 && _window$electronAPI5.focusMainWindow) {
            window.electronAPI.presentation.focusMainWindow();
            console.log('[Presentation] Re-focused main window after speaker notes window opened');
          } else {
            window.focus();
          }

          // Add additional aggressive focus attempts
          setTimeout(function () {
            var _window$electronAPI6;
            if ((_window$electronAPI6 = window.electronAPI) !== null && _window$electronAPI6 !== void 0 && (_window$electronAPI6 = _window$electronAPI6.presentation) !== null && _window$electronAPI6 !== void 0 && _window$electronAPI6.focusMainWindow) {
              window.electronAPI.presentation.focusMainWindow();
              console.log('[Presentation] Additional focus attempt at 1.5s');
            }
          }, 500); // 1.5 seconds total

          setTimeout(function () {
            var _window$electronAPI7;
            if ((_window$electronAPI7 = window.electronAPI) !== null && _window$electronAPI7 !== void 0 && (_window$electronAPI7 = _window$electronAPI7.presentation) !== null && _window$electronAPI7 !== void 0 && _window$electronAPI7.focusMainWindow) {
              window.electronAPI.presentation.focusMainWindow();
              console.log('[Presentation] Final focus attempt at 2s');
            }
          }, 1000); // 2 seconds total
        }
      }, 1000); // Wait for legacy system to finish

      console.log('[Presentation] Entering presentation mode - current speakerNotesWindowVisible:', speakerNotesWindowVisible);
    } else {
      document.body.classList.remove('is-presenting');
      console.log('[Presentation] Removed is-presenting class from body');

      // Restore content toolbar and other hidden elements
      document.querySelectorAll('[data-hidden-by-presentation="true"]').forEach(function (el) {
        el.style.display = '';
        delete el.dataset.hiddenByPresentation;
      });
      console.log('[Presentation] Restored content toolbar');
      var previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus) {
        requestAnimationFrame(function () {
          var _containerRef$current3;
          var target = previousFocus.isConnected ? previousFocus : (_containerRef$current3 = containerRef.current) === null || _containerRef$current3 === void 0 ? void 0 : _containerRef$current3.querySelector('.presentation-present-btn');
          target === null || target === void 0 || target.focus({
            preventScroll: true
          });
        });
      }
    }
  }, [isPresenting]);

  // Listen for external exit presentation events
  useEffect(function () {
    var handleExitPresenting = function handleExitPresenting() {
      console.log('[PRESENTATION] External exit presenting event...');

      // Stop TTS audio
      stopSpeaking();

      // Stop video recording if active
      if (isRecording && window.videoRecordingService) {
        console.log('[VIDEO] Stopping recording on external exit event');
        stopRecording();
      }
      setIsPresenting(false);
    };
    window.addEventListener('exitPresenting', handleExitPresenting);
    return function () {
      return window.removeEventListener('exitPresenting', handleExitPresenting);
    };
  }, []);

  // Listen for speaker notes window being closed externally
  useEffect(function () {
    if (isElectron && window.electronAPI) {
      var _window$electronAPI$e;
      var handleSpeakerNotesWindowClosed = function handleSpeakerNotesWindowClosed() {
        // Ignore close events during controlled toggle to prevent race condition
        if (window.REACT_CONTROLLED_TOGGLE) {
          console.log('[React Presentation] Speaker notes window close ignored - controlled toggle in progress');
          window.REACT_CONTROLLED_TOGGLE = false; // Reset flag
          return;
        }

        // Only handle external close if React is actually managing the window
        // Ignore closes during initial setup when legacy system is in control
        if (window.explicitlySeparateWindow) {
          setSpeakerNotesWindowVisible(false);
          window.explicitlySeparateWindow = false;
          console.log('[React Presentation] Speaker notes window was closed externally by user');
        } else {
          console.log('[React Presentation] Speaker notes window close ignored - not managed by React');
        }
      };

      // Set up listener for speaker notes window close event
      if ((_window$electronAPI$e = window.electronAPI.events) !== null && _window$electronAPI$e !== void 0 && _window$electronAPI$e.speakerNotesWindowClosed) {
        var cleanup = window.electronAPI.events.speakerNotesWindowClosed(handleSpeakerNotesWindowClosed);
        return cleanup;
      }
    }
  }, [isElectron]);

  // Speak notes when slide changes if TTS is enabled
  useEffect(function () {
    var _slides$currentSlide, _slides$currentSlide5;
    console.log('[PRESENTATION-TTS] ⚡ useEffect triggered - currentSlide:', currentSlide, 'ttsEnabled:', ttsEnabled, 'isSpeaking:', isSpeaking, 'isAdvancing:', ttsStateRef.current.isAdvancing);

    // Only trigger TTS on slide changes, not on isSpeaking state changes
    if (ttsEnabled && (_slides$currentSlide = slides[currentSlide]) !== null && _slides$currentSlide !== void 0 && _slides$currentSlide.speakerNotes) {
      // Stop any current speech before starting new one
      if (window.ttsService && window.ttsService.isSpeaking) {
        console.log('[PRESENTATION-TTS] 🛑 Stopping previous TTS before starting new slide');
        window.ttsService.stop();
        setIsSpeaking(false);
      }

      // Start TTS for new slide after a brief delay to ensure state is clean
      setTimeout(function () {
        var _slides$currentSlide2, _slides$currentSlide3, _slides$currentSlide4;
        var currentTtsEnabled = ttsStateRef.current.ttsEnabled !== undefined ? ttsStateRef.current.ttsEnabled : ttsEnabled;
        console.log('[PRESENTATION-TTS] 🔍 Checking TTS start conditions:', {
          currentTtsEnabled: currentTtsEnabled,
          ttsEnabled: ttsEnabled,
          hasNotes: !!((_slides$currentSlide2 = slides[currentSlide]) !== null && _slides$currentSlide2 !== void 0 && _slides$currentSlide2.speakerNotes),
          isAdvancing: ttsStateRef.current.isAdvancing,
          currentSlide: currentSlide,
          noteLength: (_slides$currentSlide3 = slides[currentSlide]) === null || _slides$currentSlide3 === void 0 || (_slides$currentSlide3 = _slides$currentSlide3.speakerNotes) === null || _slides$currentSlide3 === void 0 ? void 0 : _slides$currentSlide3.length
        });
        if (currentTtsEnabled && (_slides$currentSlide4 = slides[currentSlide]) !== null && _slides$currentSlide4 !== void 0 && _slides$currentSlide4.speakerNotes && !ttsStateRef.current.isAdvancing) {
          console.log('[PRESENTATION-TTS] 📢 Starting TTS for slide:', currentSlide);
          speakText(slides[currentSlide].speakerNotes, currentSlide);
        } else {
          console.log('[PRESENTATION-TTS] ❌ TTS start blocked - conditions not met');
        }
      }, 100);
    } else if (ttsEnabled && !((_slides$currentSlide5 = slides[currentSlide]) !== null && _slides$currentSlide5 !== void 0 && _slides$currentSlide5.speakerNotes) && !ttsStateRef.current.isAdvancing) {
      console.log('[PRESENTATION-TTS] 📝 Slide', currentSlide, 'has no speaker notes, scheduling 10-second auto-advance');
      // If current slide has no notes but TTS is enabled, auto-advance after 10 seconds
      if (currentSlide < slides.length - 1) {
        ttsStateRef.current.isAdvancing = true;
        setTimeout(function () {
          // Get current ttsEnabled state to avoid closure issues
          var currentTtsEnabled = ttsStateRef.current.ttsEnabled !== undefined ? ttsStateRef.current.ttsEnabled : ttsEnabled;
          if (currentTtsEnabled) {
            console.log('[PRESENTATION-TTS] ⏩ Auto-advancing past slide with no notes:', currentSlide, '→', currentSlide + 1);
            goToSlide(currentSlide + 1);
            ttsStateRef.current.isAdvancing = false;
          } else {
            console.log('[PRESENTATION-TTS] ❌ Auto-advance canceled - TTS disabled');
            ttsStateRef.current.isAdvancing = false;
          }
        }, 10000); // 10 seconds
      }
    } else {
      var _slides$currentSlide6;
      console.log('[PRESENTATION-TTS] ⏸️ Conditions not met for TTS:', {
        ttsEnabled: ttsEnabled,
        hasNotes: !!((_slides$currentSlide6 = slides[currentSlide]) !== null && _slides$currentSlide6 !== void 0 && _slides$currentSlide6.speakerNotes),
        isSpeaking: isSpeaking,
        isAdvancing: ttsStateRef.current.isAdvancing
      });
    }
  }, [currentSlide, ttsEnabled]); // Removed isSpeaking from dependency array to prevent loops

  // Update speaker notes display when current slide changes
  useEffect(function () {
    var updateSpeakerNotes = /*#__PURE__*/function () {
      var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
        var notesPanel, notesContent, noteText, formattedNotes, currentContent, shouldShowInlinePanel, presentationContent, currentSlideNotes, _t2;
        return _regenerator().w(function (_context2) {
          while (1) switch (_context2.p = _context2.n) {
            case 0:
              notesPanel = document.getElementById('speaker-notes-panel');
              notesContent = document.getElementById('current-slide-notes'); // Update separate speaker notes window if in presenting mode and window is visible
              if (!(isPresenting && speakerNotesWindowVisible && window.electronAPI && window.speakerNotesData)) {
                _context2.n = 5;
                break;
              }
              _context2.p = 1;
              noteText = '';
              if (slides.length > 0 && slides[currentSlide] && slides[currentSlide].speakerNotes) {
                noteText = slides[currentSlide].speakerNotes.trim();
              }

              // Format for HTML display - call the markdown converter

              if (noteText) {
                // Use the markdownToHtml function from speaker-notes.js
                if (window.markdownToHtml && typeof window.markdownToHtml === 'function') {
                  formattedNotes = window.markdownToHtml(noteText);
                } else {
                  // Fallback to simple formatting
                  formattedNotes = noteText.split('\n').map(function (line) {
                    return line.trim();
                  }).filter(function (line) {
                    return line;
                  }).join('<br>');
                }
              } else {
                formattedNotes = '<em>No speaker notes for this slide.</em>';
              }
              _context2.n = 2;
              return window.electronAPI.presentation.updateSpeakerNotes({
                html: formattedNotes,
                notes: formattedNotes,
                slideNumber: currentSlide + 1
              });
            case 2:
              if (!(window.updateSpeakerNotes && typeof window.updateSpeakerNotes === 'function')) {
                _context2.n = 3;
                break;
              }
              currentContent = slides.map(function (slide) {
                return slide.content;
              }).join('\n\n---\n\n');
              _context2.n = 3;
              return window.updateSpeakerNotes(currentSlide, currentContent);
            case 3:
              _context2.n = 5;
              break;
            case 4:
              _context2.p = 4;
              _t2 = _context2.v;
              console.error('[React Presentation] Failed to update separate speaker notes window:', _t2);
            case 5:
              // Update inline panel if it's visible (when separate window is hidden)  
              // Only show inline panel if explicitly requested (not during initial setup)
              shouldShowInlinePanel = !speakerNotesWindowVisible && isPresenting && window.speakerNotesData && !window.explicitlySeparateWindow && window.REACT_READY_FOR_INLINE;
              if (shouldShowInlinePanel) {
                // Recreate panel if it was removed
                if (!notesPanel && window.speakerNotesPanel_HTML) {
                  presentationContent = document.getElementById('presentation-content');
                  if (presentationContent) {
                    presentationContent.insertAdjacentHTML('beforeend', window.speakerNotesPanel_HTML);
                    document.getElementById('speaker-notes-panel'), _readOnlyError("notesPanel");
                    document.getElementById('current-slide-notes'), _readOnlyError("notesContent");
                  }
                }
                if (notesPanel && notesContent) {
                  // Only show inline panel when separate window is not visible
                  notesPanel.style.setProperty('display', 'block', 'important');
                  currentSlideNotes = window.speakerNotesData.allNotes[currentSlide] || '';
                  if (currentSlideNotes) {
                    // Use HTML conversion for inline panel too
                    if (window.markdownToHtml && typeof window.markdownToHtml === 'function') {
                      setSanitizedHTML(notesContent, window.markdownToHtml(currentSlideNotes));
                    } else {
                      setSanitizedHTML(notesContent, currentSlideNotes.replace(/\n/g, '<br>'));
                    }
                  } else {
                    setSanitizedHTML(notesContent, '<em>No speaker notes for this slide.</em>');
                  }
                }
              } else {
                // Always hide inline panel when separate window should be visible OR when not in correct state
                if (notesPanel) {
                  notesPanel.style.setProperty('display', 'none', 'important');
                }
              }
            case 6:
              return _context2.a(2);
          }
        }, _callee2, null, [[1, 4]]);
      }));
      return function updateSpeakerNotes() {
        return _ref6.apply(this, arguments);
      };
    }();
    updateSpeakerNotes();
  }, [currentSlide, slides, speakerNotesVisible, isPresenting, speakerNotesWindowVisible]);

  // Expose current slide index to global scope for navigation
  useEffect(function () {
    window.currentPresentationSlide = currentSlide;
  }, [currentSlide]);

  // Jump to target slide when entering presentation mode from editor
  useEffect(function () {
    if (slides.length > 0 && typeof window.targetPresentationSlide === 'number') {
      var targetSlide = window.targetPresentationSlide;
      console.log('[Presentation] Target slide from editor detected:', targetSlide);

      // Clear the target slide to avoid jumping again
      window.targetPresentationSlide = undefined;

      // Jump to the target slide if it's valid and different from current
      if (targetSlide >= 0 && targetSlide < slides.length) {
        console.log('[Presentation] Navigating to target slide:', targetSlide, 'current:', currentSlide);
        // Use a longer delay to avoid conflicts with initial centering
        setTimeout(function () {
          console.log('[Presentation] Executing goToSlide for target:', targetSlide);
          goToSlide(targetSlide);
        }, 300);
      }
    }
  }, [slides, goToSlide]);

  // Hide speaker notes panel when exiting presentation mode
  useEffect(function () {
    if (!isPresenting) {
      var panel = document.getElementById('speaker-notes-panel');
      if (panel) {
        panel.style.setProperty('display', 'none', 'important');
        console.log('[React Presentation] Hidden inline panel on exit presentation mode');
      }

      // Clean up panel visibility monitor when exiting presentation
      if (window.panelVisibilityMonitor) {
        clearInterval(window.panelVisibilityMonitor);
        window.panelVisibilityMonitor = null;
        console.log('[Panel Monitor] Cleaned up on presentation exit');
      }

      // Clear React control flag so legacy system can manage data normally
      window.REACT_CONTROLS_SPEAKER_NOTES = false;
      console.log('[Presentation] Cleared React speaker notes control flag');
    }
  }, [isPresenting]);

  // Toggle between separate speaker notes window and inline panel
  // Handle TTS toggle
  var handleTtsToggle = function handleTtsToggle() {
    var _slides$currentSlide7, _slides$currentSlide8;
    console.log('[PRESENTATION-TTS] === TTS Toggle Clicked ===');
    console.log('[PRESENTATION-TTS] Current ttsEnabled:', ttsEnabled);
    console.log('[PRESENTATION-TTS] Current slide:', currentSlide);
    console.log('[PRESENTATION-TTS] Has speaker notes:', !!((_slides$currentSlide7 = slides[currentSlide]) !== null && _slides$currentSlide7 !== void 0 && _slides$currentSlide7.speakerNotes));
    var newTtsEnabled = !ttsEnabled;
    setTtsEnabled(newTtsEnabled);
    // Also store in ref to avoid closure issues in completion callbacks
    ttsStateRef.current.ttsEnabled = newTtsEnabled;

    // If turning on TTS, speak the current slide's speaker notes
    if (!ttsEnabled && (_slides$currentSlide8 = slides[currentSlide]) !== null && _slides$currentSlide8 !== void 0 && _slides$currentSlide8.speakerNotes) {
      console.log('[PRESENTATION-TTS] Enabling TTS and starting speech');
      ttsStateRef.current.isAdvancing = false; // Reset state
      speakText(slides[currentSlide].speakerNotes, currentSlide);
    } else if (ttsEnabled) {
      // If turning off TTS, stop any current speech
      console.log('[PRESENTATION-TTS] Disabling TTS and stopping speech');
      stopSpeaking();
      ttsStateRef.current.isAdvancing = false; // Reset state
    }
  };

  // Speak text using TTS with auto-advance
  var speakText = /*#__PURE__*/function () {
    var _ref7 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(text, slideIndex) {
      var completionHandled, handleCompletion, ttsOptions, ttsPromise, pollCount, maxPollCount, _checkCompletion;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.n) {
          case 0:
            console.log('[PRESENTATION-TTS] === speakText called ===');
            console.log('[PRESENTATION-TTS] Text length:', (text === null || text === void 0 ? void 0 : text.length) || 0);
            console.log('[PRESENTATION-TTS] Slide index:', slideIndex);
            console.log('[PRESENTATION-TTS] Current isSpeaking:', isSpeaking);
            console.log('[PRESENTATION-TTS] Is advancing:', ttsStateRef.current.isAdvancing);
            if (text) {
              _context3.n = 1;
              break;
            }
            console.warn('[PRESENTATION-TTS] No text to speak');
            return _context3.a(2);
          case 1:
            if (!(isSpeaking && ttsStateRef.current.currentSpeakingSlide === slideIndex)) {
              _context3.n = 2;
              break;
            }
            console.log('[PRESENTATION-TTS] Already speaking this slide, ignoring duplicate request');
            return _context3.a(2);
          case 2:
            // Stop any current speech before starting new one
            if (window.ttsService && window.ttsService.isSpeaking) {
              console.log('[PRESENTATION-TTS] 🛑 Stopping current TTS before starting new slide');
              window.ttsService.stop();
            }
            console.log('[PRESENTATION-TTS] Text preview:', text.substring(0, 100) + '...');
            setIsLoadingTTS(true); // Show loading indicator while fetching audio
            setIsSpeaking(true);
            ttsStateRef.current.currentSpeakingSlide = slideIndex;

            // Use the TTS service if available
            if (window.ttsService) {
              try {
                console.log('[PRESENTATION-TTS] 🎬 Starting TTS for slide', slideIndex);

                // Try to use TTS service with callback if available
                completionHandled = false;
                handleCompletion = function handleCompletion() {
                  if (completionHandled) return; // Prevent duplicate calls
                  completionHandled = true;
                  console.log('[PRESENTATION-TTS] ✅ TTS completed via callback for slide:', slideIndex);
                  setIsSpeaking(false);
                  ttsStateRef.current.currentSpeakingSlide = -1;

                  // Schedule auto-advance - get current ttsEnabled state to avoid closure issues
                  var currentTtsEnabled = ttsStateRef.current.ttsEnabled !== undefined ? ttsStateRef.current.ttsEnabled : true; // Assume true if not set, since we're in a completion callback

                  console.log('[PRESENTATION-TTS] 🔍 Auto-advance condition check:', {
                    ttsEnabledFromClosure: ttsEnabled,
                    currentTtsEnabled: currentTtsEnabled,
                    slideIndex: slideIndex,
                    slidesLength: slides.length,
                    slideIndexLessThanLength: slideIndex < slides.length - 1,
                    finalCondition: currentTtsEnabled && slideIndex < slides.length - 1
                  });
                  if (currentTtsEnabled && slideIndex < slides.length - 1) {
                    console.log('[PRESENTATION-TTS] ⏭️ Scheduling advance to slide:', slideIndex + 1);
                    ttsStateRef.current.isAdvancing = true;
                    setTimeout(function () {
                      // Get current ttsEnabled state to avoid closure issues
                      var currentTtsEnabled = ttsStateRef.current.ttsEnabled !== undefined ? ttsStateRef.current.ttsEnabled : ttsEnabled; // fallback to state if ref not set

                      if (currentTtsEnabled) {
                        console.log('[PRESENTATION-TTS] 🚀 ADVANCING to slide:', slideIndex + 1);
                        goToSlide(slideIndex + 1);
                        // Clear isAdvancing flag immediately so TTS can start on the new slide
                        ttsStateRef.current.isAdvancing = false;
                        console.log('[PRESENTATION-TTS] ✅ Cleared isAdvancing flag');
                      } else {
                        console.log('[PRESENTATION-TTS] ❌ TTS disabled, canceling advance');
                        ttsStateRef.current.isAdvancing = false;
                      }
                    }, 1000);
                  } else {
                    console.log('[PRESENTATION-TTS] 🏁 Reached end or TTS disabled - slideIndex:', slideIndex, 'slides.length:', slides.length, 'ttsEnabled:', ttsEnabled);
                  }
                }; // Start the TTS with options including voice and callbacks
                ttsOptions = {
                  voice: selectedVoice,
                  onStart: function onStart() {
                    console.log('[PRESENTATION-TTS] 🎵 Audio started playing - clearing loading state');
                    setIsLoadingTTS(false);
                  },
                  onEnd: handleCompletion,
                  onError: function onError(err) {
                    console.error('[PRESENTATION-TTS] ❌ TTS error:', err);
                    setIsLoadingTTS(false);
                    handleCompletion();
                  }
                };
                console.log('[PRESENTATION-TTS] 📞 Starting TTS with options:', {
                  voice: selectedVoice
                });
                ttsPromise = window.ttsService.speak(text, ttsOptions); // Only use polling if no callback support
                if (window.ttsService.speak.length <= 1) {
                  // Poll the TTS service to check when it's done speaking (fallback method)
                  pollCount = 0;
                  maxPollCount = 120; // 120 * 500ms = 60 seconds max
                  _checkCompletion = function checkCompletion() {
                    pollCount++;
                    var ttsIsSpeaking = window.ttsService.isSpeaking;
                    var ttsIsLoading = window.ttsService.isLoading;
                    console.log('[PRESENTATION-TTS] 🔍 Polling completion - count:', pollCount, 'isSpeaking:', ttsIsSpeaking, 'isLoading:', ttsIsLoading);

                    // Only consider complete if NOT speaking AND NOT loading
                    if (!ttsIsSpeaking && !ttsIsLoading || pollCount >= maxPollCount) {
                      if (completionHandled) return; // Callback already handled it
                      handleCompletion(); // Use the same completion handler
                    } else {
                      // Still speaking or loading, check again in 500ms
                      setTimeout(_checkCompletion, 500);
                    }
                  }; // Start checking for completion after a brief delay
                  setTimeout(_checkCompletion, 1000);
                }

                // Also set a maximum timeout fallback
                setTimeout(function () {
                  if (isSpeaking) {
                    console.log('[PRESENTATION-TTS] 🚨 Maximum timeout reached, forcing completion');
                    setIsSpeaking(false);
                    setIsLoadingTTS(false);
                    ttsStateRef.current.isAdvancing = false;
                    ttsStateRef.current.currentSpeakingSlide = -1;
                  }
                }, 30000); // 30 second max timeout
              } catch (error) {
                console.error('[PRESENTATION-TTS] ❌ Exception:', error);
                setIsSpeaking(false);
                setIsLoadingTTS(false);
                ttsStateRef.current.isAdvancing = false;
                ttsStateRef.current.currentSpeakingSlide = -1;
              }
            } else {
              console.error('[PRESENTATION-TTS] TTS service not available!');
              setIsSpeaking(false);
              setIsLoadingTTS(false);
              ttsStateRef.current.currentSpeakingSlide = -1;
            }
          case 3:
            return _context3.a(2);
        }
      }, _callee3);
    }));
    return function speakText(_x, _x2) {
      return _ref7.apply(this, arguments);
    };
  }();

  // Stop speaking
  var stopSpeaking = function stopSpeaking() {
    console.log('[PRESENTATION-TTS] === stopSpeaking called ===');
    if (window.ttsService) {
      console.log('[PRESENTATION-TTS] Calling ttsService.stop()');
      window.ttsService.stop();
    }
    setIsSpeaking(false);
    ttsStateRef.current.isAdvancing = false;
    ttsStateRef.current.currentSpeakingSlide = -1;
  };

  // Video Recording Functions
  var startRecording = /*#__PURE__*/function () {
    var _ref8 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4() {
      var options, includeAudio, _t3;
      return _regenerator().w(function (_context4) {
        while (1) switch (_context4.p = _context4.n) {
          case 0:
            console.log('[VIDEO] Starting recording...');
            if (window.videoRecordingService) {
              _context4.n = 1;
              break;
            }
            console.error('[VIDEO] Video recording service not available');
            alert('Recording service not available. Please ensure you are using a supported browser.');
            return _context4.a(2);
          case 1:
            _context4.p = 1;
            // Configure recording options
            options = {
              video: true,
              audio: false,
              // Start with no audio to simplify
              audioSource: 'none',
              // Disable audio initially
              videoQuality: 'high',
              frameRate: 30
            }; // Ask user if they want to include audio
            _context4.n = 2;
            return window.showAppConfirm({
              title: 'Include Recording Audio',
              message: 'Include audio in the recording?',
              detail: 'Microphone permission will be requested when microphone audio is used.',
              confirmText: 'Include Audio',
              cancelText: 'Video Only',
              variant: 'warning'
            });
          case 2:
            includeAudio = _context4.v;
            if (includeAudio) {
              options.audio = true;
              options.audioSource = ttsEnabled ? 'tts' : 'microphone';
            }

            // Initialize and start recording
            _context4.n = 3;
            return window.videoRecordingService.initializeRecording(options);
          case 3:
            _context4.n = 4;
            return window.videoRecordingService.startRecording(options);
          case 4:
            setIsRecording(true);
            setIsPaused(false);
            setRecordingDuration(0);

            // Start duration timer
            recordingTimerRef.current = setInterval(function () {
              setRecordingDuration(function (prev) {
                return prev + 1;
              });
            }, 1000);

            // Mark the first slide
            if (slides[currentSlide]) {
              window.videoRecordingService.markSlideTransition(currentSlide + 1, slides[currentSlide].content.split('\n')[0]);
            }
            console.log('[VIDEO] Recording started successfully');
            _context4.n = 6;
            break;
          case 5:
            _context4.p = 5;
            _t3 = _context4.v;
            console.error('[VIDEO] Failed to start recording:', _t3);

            // Provide more specific error messages
            if (_t3.message.includes('NotAllowedError')) {
              alert('Screen recording permission denied. Please allow screen recording and try again.');
            } else if (_t3.message.includes('NotSupportedError')) {
              alert('Screen recording is not supported in this browser. Please try Chrome or Edge.');
            } else {
              alert("Failed to start recording: ".concat(_t3.message, "\n\nPlease check browser permissions and try again."));
            }
          case 6:
            return _context4.a(2);
        }
      }, _callee4, null, [[1, 5]]);
    }));
    return function startRecording() {
      return _ref8.apply(this, arguments);
    };
  }();
  var stopRecording = function stopRecording() {
    console.log('[VIDEO] Stopping recording...');
    if (!window.videoRecordingService || !isRecording) {
      return;
    }

    // Stop the timer
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    // Stop recording
    window.videoRecordingService.stopRecording();
    setIsRecording(false);
    setIsPaused(false);
    setRecordingDuration(0);
    console.log('[VIDEO] Recording stopped');
  };
  var togglePauseRecording = function togglePauseRecording() {
    if (!window.videoRecordingService || !isRecording) {
      return;
    }
    if (isPaused) {
      window.videoRecordingService.resumeRecording();
      // Resume timer
      recordingTimerRef.current = setInterval(function () {
        setRecordingDuration(function (prev) {
          return prev + 1;
        });
      }, 1000);
      setIsPaused(false);
      console.log('[VIDEO] Recording resumed');
    } else {
      window.videoRecordingService.pauseRecording();
      // Pause timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsPaused(true);
      console.log('[VIDEO] Recording paused');
    }
  };
  var formatRecordingTime = function formatRecordingTime(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    return "".concat(mins.toString().padStart(2, '0'), ":").concat(secs.toString().padStart(2, '0'));
  };

  // Statistics calculation functions
  var calculateStatistics = function calculateStatistics() {
    var stats = {
      slideCount: slides.length,
      slideContent: {
        totalWords: 0,
        totalQuotes: 0,
        totalImages: 0,
        totalCodeBlocks: 0
      },
      speakerNotes: {
        totalWords: 0,
        totalQuotes: 0,
        slidesWithNotes: 0
      },
      estimatedTalkingTime: {
        notesOnly: 0,
        withExtemporization: 0
      }
    };
    slides.forEach(function (slide) {
      // Count slide content
      var slideText = slide.content || '';
      var slideWords = slideText.match(/\b\w+\b/g) || [];
      stats.slideContent.totalWords += slideWords.length;

      // Count quotes in slide content (text within quotation marks)
      var slideQuotes = slideText.match(/["']([^"']*?)["']/g) || [];
      stats.slideContent.totalQuotes += slideQuotes.length;

      // Count images
      var imageMatches = slideText.match(/!\[[^\]]*\]\([^)]*\)/g) || [];
      stats.slideContent.totalImages += imageMatches.length;

      // Count code blocks
      var codeBlocks = slideText.match(/```[\s\S]*?```/g) || [];
      var inlineCode = slideText.match(/`[^`]+`/g) || [];
      stats.slideContent.totalCodeBlocks += codeBlocks.length + inlineCode.length;

      // Count speaker notes
      if (slide.speakerNotes && slide.speakerNotes.trim()) {
        stats.speakerNotes.slidesWithNotes++;
        var notesWords = slide.speakerNotes.match(/\b\w+\b/g) || [];
        stats.speakerNotes.totalWords += notesWords.length;

        // Count quotes in speaker notes
        var notesQuotes = slide.speakerNotes.match(/["']([^"']*?)["']/g) || [];
        stats.speakerNotes.totalQuotes += notesQuotes.length;
      }
    });

    // Calculate talking time estimates
    // Average speaking rate: 150-160 words per minute, we'll use 150
    var wordsPerMinute = 150;
    stats.estimatedTalkingTime.notesOnly = Math.ceil(stats.speakerNotes.totalWords / wordsPerMinute);

    // Add 50% for extemporization, pauses, and slide transitions
    stats.estimatedTalkingTime.withExtemporization = Math.ceil(stats.estimatedTalkingTime.notesOnly * 1.5);

    // Add additional time for slides without notes (assume 30 seconds per slide)
    var slidesWithoutNotes = stats.slideCount - stats.speakerNotes.slidesWithNotes;
    var timeForSlidesWithoutNotes = Math.ceil(slidesWithoutNotes * 0.5); // 0.5 minutes per slide
    stats.estimatedTalkingTime.withExtemporization += timeForSlidesWithoutNotes;
    return stats;
  };
  var formatTime = function formatTime(minutes) {
    if (minutes < 60) {
      return "".concat(minutes, "m");
    }
    var hours = Math.floor(minutes / 60);
    var remainingMinutes = minutes % 60;
    return "".concat(hours, "h ").concat(remainingMinutes, "m");
  };
  var toggleSpeakerNotesWindow = /*#__PURE__*/function () {
    var _ref9 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5() {
      var panel, presentationContent, notesContainer, currentSlideNotes, _panel, sidebarPane, allNotes, _currentSlideNotes, formattedNotes, _panel2, _panel4, _t4, _t5;
      return _regenerator().w(function (_context5) {
        while (1) switch (_context5.p = _context5.n) {
          case 0:
            if (!(!isPresenting || !window.electronAPI)) {
              _context5.n = 1;
              break;
            }
            return _context5.a(2);
          case 1:
            if (!speakerNotesWindowVisible) {
              _context5.n = 7;
              break;
            }
            _context5.p = 2;
            // Temporarily disable external close handler to prevent race condition
            window.REACT_CONTROLLED_TOGGLE = true;

            // Close the separate window
            _context5.n = 3;
            return window.electronAPI.presentation.closeSpeakerNotesWindow();
          case 3:
            setSpeakerNotesWindowVisible(false);
            // Clear the flag since we're now explicitly using inline panel
            window.explicitlySeparateWindow = false;
            // Set flag to allow inline panel to show
            window.REACT_READY_FOR_INLINE = true;

            // Stop monitoring panel visibility since we want inline panel to be visible now
            if (window.panelVisibilityMonitor) {
              clearInterval(window.panelVisibilityMonitor);
              window.panelVisibilityMonitor = null;
            }

            // Show the inline panel with current slide notes - recreate if needed
            panel = document.getElementById('speaker-notes-panel');
            if (!panel && window.speakerNotesPanel_HTML) {
              // Recreate panel from stored HTML
              presentationContent = document.getElementById('presentation-content');
              if (presentationContent) {
                presentationContent.insertAdjacentHTML('beforeend', window.speakerNotesPanel_HTML);
                panel = document.getElementById('speaker-notes-panel');
              }
            }
            if (panel && window.speakerNotesData) {
              panel.style.setProperty('display', 'block', 'important');

              // Update the inline panel with current slide notes
              notesContainer = document.getElementById('current-slide-notes');
              if (notesContainer) {
                currentSlideNotes = window.speakerNotesData.allNotes[currentSlide] || '';
                if (currentSlideNotes && window.markdownToHtml) {
                  setSanitizedHTML(notesContainer, window.markdownToHtml(currentSlideNotes));
                } else {
                  setSanitizedHTML(notesContainer, currentSlideNotes || '<em>No speaker notes for this slide.</em>');
                }
              }
            }
            _context5.n = 5;
            break;
          case 4:
            _context5.p = 4;
            _t4 = _context5.v;
            console.error('[React Presentation] Failed to switch to inline panel:', _t4);
          case 5:
            _context5.p = 5;
            // Ensure flag is cleared even if there was an error
            window.REACT_CONTROLLED_TOGGLE = false;
            return _context5.f(5);
          case 6:
            _context5.n = 13;
            break;
          case 7:
            _context5.p = 7;
            // Set controlled toggle flag for this direction too
            window.REACT_CONTROLLED_TOGGLE = true;
            // COMPLETELY REMOVE the inline panel from DOM
            _panel = document.getElementById('speaker-notes-panel');
            if (_panel) {
              // Store panel HTML for later restoration if needed
              window.speakerNotesPanel_HTML = _panel.outerHTML;
              _panel.remove();
            }

            // ALSO hide the sidebar speaker notes pane if it's visible
            sidebarPane = document.getElementById('speaker-notes-pane');
            if (sidebarPane) {
              sidebarPane.style.display = 'none';
            }

            // Ensure we have speaker notes data, recreate if needed
            if (!window.speakerNotesData && slides.length > 0) {
              // Recreate speaker notes data from current slides
              allNotes = slides.map(function (slide) {
                return slide.speakerNotes || '';
              });
              window.speakerNotesData = {
                allNotes: allNotes,
                currentSlide: currentSlide,
                content: slides.map(function (slide) {
                  return slide.content;
                }).join('\n\n---\n\n')
              };
              // Set flag to prevent legacy system from clearing our data
              window.REACT_CONTROLS_SPEAKER_NOTES = true;
            }

            // Open the separate window with current slide data
            if (!window.speakerNotesData) {
              _context5.n = 9;
              break;
            }
            _currentSlideNotes = window.speakerNotesData.allNotes[currentSlide] || '';
            if (_currentSlideNotes) {
              if (window.markdownToHtml && typeof window.markdownToHtml === 'function') {
                formattedNotes = window.markdownToHtml(_currentSlideNotes);
              } else {
                formattedNotes = _currentSlideNotes.split('\n').map(function (line) {
                  return line.trim();
                }).filter(function (line) {
                  return line;
                }).join('<br>');
              }
            } else {
              formattedNotes = '<em>No speaker notes for this slide.</em>';
            }
            _context5.n = 8;
            return window.electronAPI.presentation.openSpeakerNotesWindow({
              html: formattedNotes,
              notes: formattedNotes,
              slideNumber: currentSlide + 1,
              allNotes: window.speakerNotesData.allNotes
            });
          case 8:
            setSpeakerNotesWindowVisible(true);
            // Set a flag to prevent useEffect from showing inline panel
            window.explicitlySeparateWindow = true;

            // Focus main window after opening speaker notes window
            setTimeout(function () {
              var _window$electronAPI8;
              if ((_window$electronAPI8 = window.electronAPI) !== null && _window$electronAPI8 !== void 0 && (_window$electronAPI8 = _window$electronAPI8.presentation) !== null && _window$electronAPI8 !== void 0 && _window$electronAPI8.focusMainWindow) {
                window.electronAPI.presentation.focusMainWindow();
              }
            }, 100); // Short delay to ensure window has opened
            // Clear inline panel flag
            window.REACT_READY_FOR_INLINE = false;

            // Immediately hide any visible panel before starting monitoring
            _panel2 = document.getElementById('speaker-notes-panel');
            if (_panel2) {
              _panel2.style.setProperty('display', 'none', 'important');
            }

            // Start monitoring for panel visibility and force hide it when in separate window mode
            if (window.panelVisibilityMonitor) {
              clearInterval(window.panelVisibilityMonitor);
            }
            window.panelVisibilityMonitor = setInterval(function () {
              if (window.explicitlySeparateWindow) {
                var _panel3 = document.getElementById('speaker-notes-panel');
                if (_panel3) {
                  var computedStyle = window.getComputedStyle(_panel3);
                  if (computedStyle.display !== 'none') {
                    _panel3.style.setProperty('display', 'none', 'important');
                  }
                }
              }
            }, 100); // Check every 100ms
            _context5.n = 10;
            break;
          case 9:
            console.warn('[React Presentation] No speaker notes data available for separate window');
            // Still set the state to indicate separate window should be visible
            setSpeakerNotesWindowVisible(true);
          case 10:
            _context5.n = 12;
            break;
          case 11:
            _context5.p = 11;
            _t5 = _context5.v;
            console.error('[React Presentation] Failed to switch to separate window:', _t5);
            // Ensure panel stays hidden even if separate window fails
            _panel4 = document.getElementById('speaker-notes-panel');
            if (_panel4) {
              _panel4.style.setProperty('display', 'none', 'important');
            }
          case 12:
            _context5.p = 12;
            // Ensure flag is cleared even if there was an error
            window.REACT_CONTROLLED_TOGGLE = false;
            return _context5.f(12);
          case 13:
            return _context5.a(2);
        }
      }, _callee5, null, [[7, 11, 12, 13], [2, 4, 5, 6]]);
    }));
    return function toggleSpeakerNotesWindow() {
      return _ref9.apply(this, arguments);
    };
  }();

  // Removed old speaker notes panel toggle - now handled by main toggle button

  // Mouse handlers for panning
  var handleMouseDown = function handleMouseDown(e) {
    if (isPresenting) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY
    });
    setPanStart(pan);
  };
  var handleMouseMove = function handleMouseMove(e) {
    if (!isDragging) return;
    var deltaX = e.clientX - dragStart.x;
    var deltaY = e.clientY - dragStart.y;
    var newPan = {
      x: panStart.x + deltaX,
      y: panStart.y + deltaY
    };
    panRef.current = newPan;
    setPan(newPan);
  };
  var handleMouseUp = function handleMouseUp() {
    setIsDragging(false);
  };

  // Expose statistics functions to window object for sidebar access
  useEffect(function () {
    window.calculateStatistics = calculateStatistics;
    window.formatTime = formatTime;
    return function () {
      window.calculateStatistics = null;
      window.formatTime = null;
    };
  }, []);
  var activeZoom = isPresenting ? presentationFit.scale : zoom;
  var activePan = isPresenting ? presentationFit.pan : pan;
  var presentationStageStyle = isPresenting ? {
    position: 'absolute',
    top: "".concat(presentationInsets.top, "px"),
    right: "".concat(presentationInsets.right, "px"),
    bottom: "".concat(presentationInsets.bottom, "px"),
    left: "".concat(presentationInsets.left, "px"),
    overflow: 'hidden'
  } : {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden'
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: containerRef,
    className: "presentation-shell w-full h-full relative overflow-hidden ".concat(isPresenting ? '' : 'cursor-grab active:cursor-grabbing'),
    "data-presentation-mode": isPresenting ? 'delivery' : 'authoring',
    role: "region",
    "aria-label": isPresenting ? 'Presentation delivery' : 'Presentation editor',
    style: {
      background: 'var(--presentation-bg-gradient, linear-gradient(135deg, var(--techne-bg, #fdf6e3) 0%, #f7f0de 48%, var(--techne-surface, #eee8d5) 100%))',
      height: '100%',
      minHeight: 0
    },
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseUp
  }, !isPresenting && /*#__PURE__*/React.createElement("div", {
    className: "absolute top-4 left-4 z-10 flex gap-2",
    role: "group",
    "aria-label": "Presentation layout"
  }, /*#__PURE__*/React.createElement("select", {
    value: layoutType,
    onChange: function onChange(e) {
      return setLayoutType(e.target.value);
    },
    "aria-label": "Presentation layout",
    className: "px-3 py-2 text-gray-900 rounded-lg border border-gray-300 focus:border-[#E63946] outline-none shadow-lg",
    style: {
      backgroundColor: '#fefdfb'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "spiral"
  }, "Spiral"), /*#__PURE__*/React.createElement("option", {
    value: "linear"
  }, "Linear"), /*#__PURE__*/React.createElement("option", {
    value: "grid"
  }, "Grid"), /*#__PURE__*/React.createElement("option", {
    value: "circle"
  }, "Circle"), /*#__PURE__*/React.createElement("option", {
    value: "tree"
  }, "Tree"), /*#__PURE__*/React.createElement("option", {
    value: "zigzag"
  }, "Zigzag"))), !isPresenting && /*#__PURE__*/React.createElement("div", {
    className: "absolute top-4 right-4 z-10 flex gap-2",
    role: "toolbar",
    "aria-label": "Presentation editor controls"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: handleZoomIn,
    "aria-label": "Zoom in",
    className: "p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900",
    "data-tooltip": "Zoom in"
  }, /*#__PURE__*/React.createElement(ZoomIn, null)), /*#__PURE__*/React.createElement("button", {
    onClick: handleZoomOut,
    "aria-label": "Zoom out",
    className: "p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900",
    "data-tooltip": "Zoom out"
  }, /*#__PURE__*/React.createElement(ZoomOut, null)), /*#__PURE__*/React.createElement("button", {
    onClick: _resetView,
    "aria-label": "Reset presentation view",
    className: "p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900",
    "data-tooltip": "Reset presentation view"
  }, /*#__PURE__*/React.createElement(Home, null)), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      if (window.exportVisualizationAsPNG) {
        window.exportVisualizationAsPNG('presentation-root', 'presentation');
      }
    },
    className: "p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900",
    "aria-label": "Export presentation as PNG",
    "data-tooltip": "Export presentation as PNG"
  }, "\uD83D\uDCF8"), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return setPreflightOpen(true);
    },
    className: "presentation-control-btn presentation-preflight-btn px-3 py-2 rounded-lg transition-colors shadow-lg border",
    "aria-label": "Run presentation preflight",
    "aria-expanded": preflightOpen,
    "aria-controls": preflightOpen ? 'presentation-preflight-panel' : undefined
  }, "Preflight", preflightReport !== null && preflightReport !== void 0 && preflightReport.warningCount ? " \xB7 ".concat(preflightReport.warningCount) : ''), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      previousFocusRef.current = document.activeElement;
      setIsPresenting(true);
    },
    className: "presentation-control-btn presentation-present-btn flex items-center gap-2 px-3 py-2 rounded-lg transition-colors shadow-lg border",
    "aria-label": "Start presentation"
  }, /*#__PURE__*/React.createElement(Play, null), "Present")), !isPresenting && preflightOpen && /*#__PURE__*/React.createElement("aside", {
    id: "presentation-preflight-panel",
    className: "presentation-preflight-panel",
    role: "region",
    "aria-label": "Presentation preflight",
    "aria-busy": preflightRunning
  }, /*#__PURE__*/React.createElement("header", {
    className: "presentation-preflight-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Presentation preflight"), /*#__PURE__*/React.createElement("span", null, preflightRunning ? 'Checking every slide…' : preflightReport !== null && preflightReport !== void 0 && preflightReport.success ? "".concat(preflightReport.slideCount, " slides \xB7 ").concat(preflightReport.warningCount, " warnings") : 'Ready to check this deck')), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: function onClick() {
      return setPreflightOpen(false);
    },
    "aria-label": "Close presentation preflight"
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    className: "presentation-preflight-actions"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: runPreflight,
    disabled: preflightRunning
  }, preflightRunning ? 'Checking…' : 'Run again'), (preflightReport === null || preflightReport === void 0 ? void 0 : preflightReport.suppressedCount) > 0 && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: resetPreflightSuppressions
  }, "Restore ", preflightReport.suppressedCount, " suppressed")), (preflightReport === null || preflightReport === void 0 ? void 0 : preflightReport.error) && /*#__PURE__*/React.createElement("p", {
    className: "presentation-preflight-error"
  }, preflightReport.error), (preflightReport === null || preflightReport === void 0 ? void 0 : preflightReport.success) && preflightReport.warningCount === 0 && /*#__PURE__*/React.createElement("p", {
    className: "presentation-preflight-clear"
  }, "No unsuppressed preflight warnings."), /*#__PURE__*/React.createElement("ol", {
    className: "presentation-preflight-list"
  }, ((preflightReport === null || preflightReport === void 0 ? void 0 : preflightReport.warnings) || []).map(function (item) {
    return /*#__PURE__*/React.createElement("li", {
      key: item.id,
      "data-warning-code": item.code,
      "data-slide-index": item.slideIndex
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "presentation-preflight-warning",
      onClick: function onClick() {
        return navigateToPreflightWarning(item);
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "presentation-preflight-severity is-".concat(item.severity)
    }, item.severity), /*#__PURE__*/React.createElement("strong", null, "Slide ", item.slideNumber, ": ", item.message), /*#__PURE__*/React.createElement("span", null, item.detail), /*#__PURE__*/React.createElement("small", null, "Source line ", item.sourceLine)), item.suppressible && /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "presentation-preflight-suppress",
      onClick: function onClick() {
        return suppressPreflightWarning(item.id);
      },
      "aria-label": "Suppress ".concat(item.message, " on slide ").concat(item.slideNumber)
    }, "Suppress"));
  }))), /*#__PURE__*/React.createElement("nav", {
    ref: navigationControlsRef,
    className: "presentation-navigation absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-4",
    "aria-label": "Slide navigation"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return goToSlide(currentSlide - 1);
    },
    disabled: currentSlide === 0,
    "aria-label": "Previous slide",
    className: "p-3 disabled:opacity-50 rounded-lg transition-colors shadow-lg",
    style: {
      background: 'var(--techne-off-white, #fafafa)',
      color: 'var(--techne-black, #0a0a0a)',
      border: '2px solid var(--techne-black, #0a0a0a)',
      boxShadow: '3px 3px 0 var(--techne-black, rgba(0,0,0,0.8))'
    }
  }, /*#__PURE__*/React.createElement(ChevronLeft, null)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
    style: {
      background: 'var(--techne-off-white, #fafafa)',
      color: 'var(--techne-black, #0a0a0a)',
      border: '2px solid var(--techne-black, #0a0a0a)',
      boxShadow: '3px 3px 0 var(--techne-black, rgba(0,0,0,0.8))'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-medium"
  }, currentSlide + 1, " / ", slides.length)), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return goToSlide(currentSlide + 1);
    },
    disabled: currentSlide === slides.length - 1,
    "aria-label": "Next slide",
    className: "p-3 disabled:opacity-50 rounded-lg transition-colors shadow-lg",
    style: {
      background: 'var(--techne-accent, #E63946)',
      color: 'var(--techne-white, #ffffff)',
      border: '2px solid var(--techne-black, #0a0a0a)',
      boxShadow: '3px 3px 0 var(--techne-black, rgba(0,0,0,0.8))'
    }
  }, /*#__PURE__*/React.createElement(ChevronRight, null))), isPresenting && /*#__PURE__*/React.createElement("div", {
    ref: presentationControlsRef,
    className: "presentation-toolbar absolute top-4 right-4 z-10 flex gap-2",
    role: "toolbar",
    "aria-label": "Presentation delivery controls"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      if (window.exportVisualizationAsPNG) {
        window.exportVisualizationAsPNG('presentation-root', 'presentation');
      }
    },
    className: "p-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900",
    "aria-label": "Export presentation as PNG",
    "data-tooltip": "Export presentation as PNG"
  }, "\uD83D\uDCF8"), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return setPresenterConsoleOpen(function (previous) {
        return !previous;
      });
    },
    className: "p-2 rounded-lg transition-colors shadow-lg border ".concat(presenterConsoleOpen ? 'bg-green-600 text-white border-green-700' : 'bg-cream hover:bg-gray-100 text-gray-900'),
    "aria-label": presenterConsoleOpen ? 'Hide presenter console' : 'Show presenter console',
    "aria-pressed": presenterConsoleOpen,
    "aria-controls": presenterConsoleOpen ? 'presentation-presenter-console' : undefined
  }, "Presenter"), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return toggleSpeakerNotesWindow();
    },
    className: "p-2 rounded-lg transition-colors shadow-lg border ".concat(speakerNotesWindowVisible ? 'bg-green-600 hover:bg-green-700 text-white border-green-700' : 'bg-cream hover:bg-gray-100 text-gray-900'),
    "data-tooltip": speakerNotesWindowVisible ? "Show speaker notes in bottom panel" : "Show speaker notes in separate window",
    "aria-label": speakerNotesWindowVisible ? "Show speaker notes in bottom panel" : "Show speaker notes in separate window",
    "aria-pressed": speakerNotesWindowVisible
  }, speakerNotesWindowVisible ? /*#__PURE__*/React.createElement(StickyNote, null) : /*#__PURE__*/React.createElement(Eye, null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '8px',
      marginLeft: '2px'
    }
  }, speakerNotesWindowVisible ? 'T' : 'F')), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return handleTtsToggle();
    },
    className: "p-2 rounded-lg transition-colors shadow-lg border ".concat(isLoadingTTS ? 'tts-loading-indicator' : ttsEnabled ? '' : 'bg-cream hover:bg-gray-100 text-gray-900'),
    style: isLoadingTTS ? {
      background: 'var(--techne-accent, #E63946)',
      color: 'white',
      borderColor: 'var(--techne-black, #0a0a0a)'
    } : ttsEnabled ? {
      background: 'var(--techne-accent, #E63946)',
      color: 'white',
      borderColor: 'var(--techne-black, #0a0a0a)'
    } : {},
    "data-tooltip": isLoadingTTS ? "Loading slide narration" : ttsEnabled ? "Disable slide narration" : "Enable slide narration",
    "aria-label": isLoadingTTS ? "Loading slide narration" : ttsEnabled ? "Disable slide narration" : "Enable slide narration",
    "aria-pressed": ttsEnabled,
    disabled: isLoadingTTS
  }, isLoadingTTS ? /*#__PURE__*/React.createElement(LoadingSpinner, null) : ttsEnabled ? /*#__PURE__*/React.createElement(Speaker, null) : /*#__PURE__*/React.createElement(SpeakerOff, null)), /*#__PURE__*/React.createElement("select", {
    value: selectedVoice,
    onChange: function onChange(e) {
      return setSelectedVoice(e.target.value);
    },
    "aria-label": "Narration voice",
    className: "px-2 py-1 text-sm rounded-lg bg-cream hover:bg-gray-100 text-gray-900 border shadow-lg cursor-pointer",
    "data-tooltip": "Select narration voice",
    style: {
      maxWidth: '90px'
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "sarah"
  }, "Sarah"), /*#__PURE__*/React.createElement("option", {
    value: "john"
  }, "John"), /*#__PURE__*/React.createElement("option", {
    value: "emily"
  }, "Emily"), /*#__PURE__*/React.createElement("option", {
    value: "michael"
  }, "Michael")), !isRecording ? /*#__PURE__*/React.createElement("button", {
    onClick: startRecording,
    "aria-label": "Start presentation recording",
    className: "p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-lg border border-red-700",
    "data-tooltip": "Start presentation recording"
  }, /*#__PURE__*/React.createElement(RecordIcon, null)) : /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: togglePauseRecording,
    "aria-label": isPaused ? "Resume presentation recording" : "Pause presentation recording",
    "aria-pressed": isPaused,
    className: "p-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors shadow-lg border border-yellow-700",
    "data-tooltip": isPaused ? "Resume presentation recording" : "Pause presentation recording"
  }, isPaused ? /*#__PURE__*/React.createElement(RecordIcon, null) : /*#__PURE__*/React.createElement(PauseIcon, null)), /*#__PURE__*/React.createElement("button", {
    onClick: stopRecording,
    "aria-label": "Stop presentation recording",
    className: "p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors shadow-lg border border-gray-700",
    "data-tooltip": "Stop presentation recording"
  }, /*#__PURE__*/React.createElement(StopIcon, null)), /*#__PURE__*/React.createElement("span", {
    className: "px-2 py-1 bg-red-600 text-white rounded text-sm"
  }, formatRecordingTime(recordingDuration))), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      console.log('[PRESENTATION] Exiting presentation mode...');

      // Stop TTS audio
      stopSpeaking();

      // Stop video recording if active
      if (isRecording && window.videoRecordingService) {
        console.log('[VIDEO] Stopping recording on presentation exit');
        stopRecording();
      }

      // Exit presentation mode
      setIsPresenting(false);
    },
    className: "px-4 py-2 bg-cream hover:bg-gray-100 rounded-lg transition-colors shadow-lg border text-gray-900",
    "aria-label": "Exit presentation"
  }, "Exit Presentation")), isPresenting && presenterConsoleOpen && /*#__PURE__*/React.createElement("aside", {
    ref: presenterConsoleRef,
    id: "presentation-presenter-console",
    className: "presentation-presenter-console",
    role: "complementary",
    "aria-label": "Presenter console",
    "data-current-slide": currentSlide
  }, /*#__PURE__*/React.createElement("header", null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Presenter console"), /*#__PURE__*/React.createElement("span", {
    role: "timer",
    "aria-label": "Elapsed time ".concat(formatRecordingTime(presenterElapsed))
  }, formatRecordingTime(presenterElapsed))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: function onClick() {
      return setPresenterConsoleOpen(false);
    },
    "aria-label": "Close presenter console"
  }, "\xD7")), /*#__PURE__*/React.createElement("section", {
    "aria-labelledby": "presenter-current-title"
  }, /*#__PURE__*/React.createElement("small", null, "Current \xB7 ", currentSlide + 1, " / ", slides.length), /*#__PURE__*/React.createElement("h2", {
    id: "presenter-current-title"
  }, ((_slides$currentSlide9 = slides[currentSlide]) === null || _slides$currentSlide9 === void 0 ? void 0 : _slides$currentSlide9.title) || "Slide ".concat(currentSlide + 1)), /*#__PURE__*/React.createElement("p", null, slideTextPreview(slides[currentSlide]) || 'No visible slide text.')), /*#__PURE__*/React.createElement("section", {
    "aria-labelledby": "presenter-next-title",
    className: "presentation-presenter-next"
  }, /*#__PURE__*/React.createElement("small", null, "Next"), /*#__PURE__*/React.createElement("h2", {
    id: "presenter-next-title"
  }, ((_slides = slides[currentSlide + 1]) === null || _slides === void 0 ? void 0 : _slides.title) || (currentSlide + 1 < slides.length ? "Slide ".concat(currentSlide + 2) : 'End of deck')), /*#__PURE__*/React.createElement("p", null, slideTextPreview(slides[currentSlide + 1]) || 'No next slide.')), /*#__PURE__*/React.createElement("section", {
    "aria-labelledby": "presenter-notes-title",
    className: "presentation-presenter-notes"
  }, /*#__PURE__*/React.createElement("small", {
    id: "presenter-notes-title"
  }, "Speaker notes"), /*#__PURE__*/React.createElement(SpeakerNotesContent, {
    notes: (_slides$currentSlide0 = slides[currentSlide]) === null || _slides$currentSlide0 === void 0 ? void 0 : _slides$currentSlide0.speakerNotes
  })), /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Presenter console navigation"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: function onClick() {
      return goToSlide(currentSlide - 1);
    },
    disabled: currentSlide === 0
  }, "Previous"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: function onClick() {
      return goToSlide(currentSlide + 1);
    },
    disabled: currentSlide === slides.length - 1
  }, "Next"))), /*#__PURE__*/React.createElement("div", {
    ref: stageRef,
    className: "presentation-stage",
    "data-fit-mode": isPresenting ? 'contain' : 'canvas',
    "data-fit-state": isPresenting ? presentationFitReady ? 'ready' : 'measuring' : 'inactive',
    style: presentationStageStyle
  }, /*#__PURE__*/React.createElement("div", {
    ref: canvasRef,
    className: "presentation-canvas w-full h-full",
    "data-active-scale": activeZoom.toFixed(6),
    style: {
      transform: "translate(".concat(activePan.x, "px, ").concat(activePan.y, "px) scale(").concat(activeZoom, ")"),
      transformOrigin: '0 0',
      transition: isDragging || isZooming ? 'none' : isPresenting ? 'transform 0.35s ease-out' : 'transform 0.2s ease-out'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative w-full h-full flex items-center justify-center"
  }, slides.map(function (slide, index) {
    var isFocused = index === focusedSlide;
    var isCurrent = index === currentSlide;
    if (isPresenting && !isCurrent) return null;
    return /*#__PURE__*/React.createElement("div", {
      key: slide.id,
      "data-slide-index": index,
      "data-current-slide": isCurrent ? 'true' : 'false',
      role: "group",
      "aria-roledescription": "slide",
      "aria-label": "Slide ".concat(index + 1, " of ").concat(slides.length),
      "aria-current": isCurrent ? 'step' : undefined,
      tabIndex: isCurrent ? 0 : -1,
      className: "absolute slide rounded-xl shadow-2xl transition-all duration-500 transform ".concat(slide.backgroundImage ? 'slide-has-bg' : '', " ").concat(isPresenting ? 'presentation-current-slide' : isFocused ? 'ring-4 ring-purple-500 shadow-purple-500/50 animate-pulse' : isCurrent ? 'ring-4 ring-green-500 shadow-green-500/50 scale-105' : 'hover:shadow-3xl hover:scale-105 hover:ring-2 hover:ring-blue-400'),
      style: _objectSpread({
        '--slide-x': "".concat(slide.position.x, "px"),
        '--slide-y': "".concat(slide.position.y, "px"),
        left: "".concat(slide.position.x, "px"),
        top: "".concat(slide.position.y, "px"),
        width: "".concat(SLIDE_WIDTH, "px"),
        height: "".concat(SLIDE_HEIGHT, "px"),
        minHeight: "".concat(SLIDE_HEIGHT, "px"),
        transform: 'translate(-50%, -50%)',
        opacity: 1,
        zIndex: isFocused ? 1000 : isCurrent ? 999 : 1,
        position: 'absolute',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }, slide.backgroundImage ? {
        backgroundImage: "url('".concat(slide.backgroundImage, "')"),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      } : {}),
      onDoubleClick: isPresenting ? undefined : function () {
        return handleSlideDoubleClick(index);
      }
    }, /*#__PURE__*/React.createElement(PresentationSlideContent, {
      html: slide.parsed,
      isPresenting: isPresenting
    }));
  }), !isPresenting && /*#__PURE__*/React.createElement("svg", {
    className: "presentation-connection-lines absolute inset-0 pointer-events-none",
    "aria-hidden": "true",
    focusable: "false",
    style: {
      width: '200%',
      height: '200%'
    }
  }, slides.map(function (slide, index) {
    if (index === slides.length - 1) return null;
    var nextSlide = slides[index + 1];
    return /*#__PURE__*/React.createElement("line", {
      key: "line-".concat(index),
      x1: slide.position.x + SLIDE_HALF_WIDTH,
      y1: slide.position.y + SLIDE_HALF_HEIGHT,
      x2: nextSlide.position.x + SLIDE_HALF_WIDTH,
      y2: nextSlide.position.y + SLIDE_HALF_HEIGHT,
      stroke: "rgba(255,255,255,0.1)",
      strokeWidth: "2",
      strokeDasharray: "5,5"
    });
  }))))));
};

// Make component available globally
window.MarkdownPreziApp = MarkdownPreziApp;

// Expose statistics functions to window object for sidebar access
window.calculateStatistics = null;
window.formatTime = null;