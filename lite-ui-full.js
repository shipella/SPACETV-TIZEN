/* SPACE TV - Tizen 2.4 stable export */
/* ES5 only for WebKit r152340 */
(function() {
  'use strict';

  var API_KEY = '5ec171c6bf26c707ac208ba4bb5b88b5';
  var YOUTUBE_API_KEY = 'AIzaSyDSTF603p3F5IPSjNztkCVIpAH-stIyDzQ';
  var BASE_URL = 'https://api.themoviedb.org/3';
  var IMG_BASE = 'https://image.tmdb.org/t/p';
  var VIDLINK_BASE = 'https://vidlink.pro';
  var STREAM_GATEWAY_URL = 'https://space-tv-stream-gateway.bshipella.workers.dev';
  var VIDSRC_BASE = 'https://vidsrc.to';
  var VIDSRCME_BASE = 'https://vidsrcme.ru';
  var VIDSRCNET_BASE = 'https://vidsrc.net';
  var VIDSRCV2_BASE = 'https://v2.vidsrc.me';
  var VSEMBED_BASE = 'https://vsembed.ru';
  var HERO_INTERVAL = null;
  var PLAYER_CLOSE_TIMER = null;
  var LAST_PLAYER_FOCUS = null;
  var PLAYER_EMBED_PLAYING = false;
  var BOOT_STARTED_AT = new Date().getTime();
  var BOOT_HIDE_TIMER = null;
  var GRID_COLS = 6;

  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }
  function createEl(tag) { return document.createElement(tag); }

  function isTizenRuntime() {
    var ua = navigator.userAgent || '';
    return typeof tizen !== 'undefined' || /tizen|smart-tv/i.test(ua);
  }

  function shouldUse4KScale() {
    if (window.innerWidth >= 3000 || (window.innerWidth >= 1700 && window.devicePixelRatio && window.devicePixelRatio > 1.5)) {
      return true;
    }
    try {
      if (typeof webapis !== 'undefined' && webapis.productinfo && webapis.productinfo.isUdPanelSupported && webapis.productinfo.isUdPanelSupported()) {
        return true;
      }
    } catch (_error) {}
    return false;
  }

  function showFatalError(message) {
    var body = document.body;
    if (!body) return;
    body.innerHTML = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:#061321;color:#fff;font-family:Arial,Helvetica,sans-serif;padding:48px;box-sizing:border-box;">' +
      '<h1 style="margin:0 0 16px;font-size:32px;">SPACE TV failed to start</h1>' +
      '<p style="margin:0 0 10px;font-size:18px;color:#c6d5e5;">The app hit a launch error instead of showing a blank screen.</p>' +
      '<pre style="white-space:pre-wrap;font-size:14px;color:#90b7d8;">' + String(message) + '</pre>' +
      '</div>';
  }

  window.onerror = function(message, source, line, col) {
    showFatalError(message + ' @ ' + source + ':' + line + ':' + col);
    return false;
  };

  function tmdbImg(path, size) {
    if (!path) return 'https://picsum.photos/500/750?grayscale';
    if (/^https?:\/\//i.test(path)) return path;
    return IMG_BASE + '/' + size + path;
  }

  function heroImg(path) {
    if (!path) return 'https://picsum.photos/1920/900?blur=1';
    if (/^https?:\/\//i.test(path)) return path;
    return IMG_BASE + '/original' + path;
  }

  function getYear(item) {
    var value = item && (item.release_date || item.first_air_date || '') || '';
    return value ? value.split('-')[0] : '';
  }

  function getTitle(item) {
    return item ? (item.title || item.name || 'Untitled') : 'Untitled';
  }

  function getMediaType(item) {
    if (!item) return 'movie';
    if (item.media_type) return item.media_type;
    return item.first_air_date ? 'tv' : 'movie';
  }

  function addClass(el, className) {
    if (!el) return;
    if ((' ' + el.className + ' ').indexOf(' ' + className + ' ') === -1) {
      el.className += (el.className ? ' ' : '') + className;
    }
  }

  function injectFocusOverride() {
    var style = createEl('style');
    style.textContent = 'html.tizen-tv-export .tizen-focus{' +
      'outline:none !important;' +
      'box-shadow:0 0 0 4px #35c6ff,0 0 34px rgba(53,198,255,0.5) !important;' +
      '}' +
      'html.tizen-tv-export .nav-item.tizen-focus{' +
      'border-radius:999px !important;' +
      '}' +
      'html.tizen-tv-export .btn.tizen-focus,html.tizen-tv-export .back-btn.tizen-focus,html.tizen-tv-export .fav-btn.tizen-focus,html.tizen-tv-export .section-more.tizen-focus{' +
      'border-radius:999px !important;' +
      '}' +
      'html.tizen-tv-export .tile.tizen-focus,html.tizen-tv-export .channel-item.tizen-focus,html.tizen-tv-export .episode-item.tizen-focus,html.tizen-tv-export .similar-item.tizen-focus,html.tizen-tv-export .settings-row.tizen-focus{' +
      'border-radius:24px !important;' +
      '}';
    (document.head || document.documentElement).appendChild(style);
  }

  function hideBootSplash() {
    var splash = $('#boot-splash');
    var elapsed;
    var wait;
    if (!splash) return;
    if (splash.getAttribute('data-hidden') === 'true') return;
    elapsed = new Date().getTime() - BOOT_STARTED_AT;
    if (elapsed < 5000) {
      wait = 5000 - elapsed;
      if (BOOT_HIDE_TIMER) clearTimeout(BOOT_HIDE_TIMER);
      BOOT_HIDE_TIMER = setTimeout(function() {
        BOOT_HIDE_TIMER = null;
        hideBootSplash();
      }, wait);
      return;
    }
    splash.setAttribute('data-hidden', 'true');
    addClass(splash, 'boot-splash-hidden');
    setTimeout(function() {
      if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    }, 420);
  }

  function removeNodeAnimated(node, exitClass, duration, callback) {
    if (!node || !node.parentNode) {
      if (callback) callback();
      return;
    }
    addClass(node, exitClass || 'overlay-exit');
    setTimeout(function() {
      if (node && node.parentNode) node.parentNode.removeChild(node);
      if (callback) callback();
    }, duration || 220);
  }

  function safeFocus(el) {
    if (!el || !el.focus) return;
    try { el.focus(); } catch (_error) {}
  }

  function isVisible(el) {
    var rect;
    var style;
    if (!el || !el.getBoundingClientRect) return false;
    rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    return true;
  }

  function getFocusRoot() {
    return $('.modal-overlay') || $('.player-overlay') || $('.detail-overlay') || document;
  }

  function getFocusableElements() {
    var root = getFocusRoot();
    var selector = 'button, input, select, [tabindex="0"]';
    var nodes = root === document ? $$(selector) : Array.prototype.slice.call(root.querySelectorAll(selector));
    return nodes.filter(function(el) {
      if (!isVisible(el)) return false;
      if (el.disabled) return false;
      if (el.getAttribute('tabindex') === '-1') return false;
      if (el.getAttribute('data-nav-disabled') === 'true') return false;
      return true;
    });
  }

  function getDefaultFocus(root) {
    if (root !== document) {
      return root.querySelector('[data-default-focus="true"]') || root.querySelector('button, input, select, [tabindex="0"]');
    }
    return $('.hero-action') || $('.channel-item') || $('.tile') || $('.settings-row') || $('.nav-item.active') || $('.nav-item');
  }

  function getRectData(el) {
    var rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + (rect.width / 2),
      centerY: rect.top + (rect.height / 2)
    };
  }

  function getOverlapAmount(startA, endA, startB, endB) {
    return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  function animateScrollTarget(target, left, top, duration) {
    var startLeft = target === window ? (window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0) : target.scrollLeft;
    var startTop = target === window ? (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0) : target.scrollTop;
    var deltaLeft = left - startLeft;
    var deltaTop = top - startTop;
    var startTime = new Date().getTime();

    function frame() {
      var elapsed = new Date().getTime() - startTime;
      var progress = elapsed >= duration ? 1 : (elapsed / duration);
      var eased = easeOutCubic(progress);
      var nextLeft = Math.round(startLeft + (deltaLeft * eased));
      var nextTop = Math.round(startTop + (deltaTop * eased));
      if (target === window) window.scrollTo(nextLeft, nextTop);
      else {
        target.scrollLeft = nextLeft;
        target.scrollTop = nextTop;
      }
      if (progress < 1) {
        (window.requestAnimationFrame || function(cb) { return setTimeout(cb, 16); })(frame);
      }
    }

    if (Math.abs(deltaLeft) < 2 && Math.abs(deltaTop) < 2) return;
    frame();
  }

  function getScrollableParents(element) {
    var parents = [];
    var node = element ? element.parentNode : null;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.scrollWidth > node.clientWidth + 4 || node.scrollHeight > node.clientHeight + 4) {
        parents.push(node);
      }
      node = node.parentNode;
    }
    parents.push(window);
    return parents;
  }

  function revealInContainer(container, element) {
    var rect = element.getBoundingClientRect();
    var box;
    var currentLeft;
    var currentTop;
    var targetLeft;
    var targetTop;
    var padding = 28;

    if (container === window) {
      box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      currentLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
      currentTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    } else {
      box = container.getBoundingClientRect();
      currentLeft = container.scrollLeft;
      currentTop = container.scrollTop;
    }

    targetLeft = currentLeft;
    targetTop = currentTop;

    if (rect.left < box.left + padding) targetLeft += rect.left - box.left - padding;
    else if (rect.right > box.right - padding) targetLeft += rect.right - box.right + padding;

    if (rect.top < box.top + padding) targetTop += rect.top - box.top - padding;
    else if (rect.bottom > box.bottom - padding) targetTop += rect.bottom - box.bottom + padding;

    if (targetLeft < 0) targetLeft = 0;
    if (targetTop < 0) targetTop = 0;
    animateScrollTarget(container, targetLeft, targetTop, 220);
  }

  function smoothScrollIntoView(element) {
    var parents;
    var i;
    if (!element || !element.getBoundingClientRect) return;
    parents = getScrollableParents(element);
    for (i = 0; i < parents.length; i++) revealInContainer(parents[i], element);
  }

  function findNextFocusable(current, direction) {
    var currentRect = getRectData(current);
    var candidates = getFocusableElements();
    var best = null;
    var bestScore = Infinity;
    var i;
    for (i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      var rect;
      var primary;
      var secondary;
      var sameLane;
      var score;
      if (candidate === current) continue;
      rect = getRectData(candidate);
      if (direction === 'left') {
        if (rect.centerX >= currentRect.centerX - 4) continue;
        primary = currentRect.left - rect.right;
        if (primary < 0) primary = currentRect.centerX - rect.centerX;
        secondary = Math.abs(rect.centerY - currentRect.centerY);
        sameLane = getOverlapAmount(currentRect.top, currentRect.bottom, rect.top, rect.bottom) > Math.min(currentRect.height, rect.height) * 0.25;
        score = (sameLane ? 0 : 20000) + Math.max(primary, 0) * 100 + secondary;
      } else if (direction === 'right') {
        if (rect.centerX <= currentRect.centerX + 4) continue;
        primary = rect.left - currentRect.right;
        if (primary < 0) primary = rect.centerX - currentRect.centerX;
        secondary = Math.abs(rect.centerY - currentRect.centerY);
        sameLane = getOverlapAmount(currentRect.top, currentRect.bottom, rect.top, rect.bottom) > Math.min(currentRect.height, rect.height) * 0.25;
        score = (sameLane ? 0 : 20000) + Math.max(primary, 0) * 100 + secondary;
      } else if (direction === 'up') {
        if (rect.centerY >= currentRect.centerY - 4) continue;
        primary = currentRect.top - rect.bottom;
        if (primary < 0) primary = currentRect.centerY - rect.centerY;
        secondary = Math.abs(rect.centerX - currentRect.centerX);
        sameLane = getOverlapAmount(currentRect.left, currentRect.right, rect.left, rect.right) > Math.min(currentRect.width, rect.width) * 0.2;
        score = (sameLane ? 0 : 20000) + Math.max(primary, 0) * 100 + secondary;
      } else {
        if (rect.centerY <= currentRect.centerY + 4) continue;
        primary = rect.top - currentRect.bottom;
        if (primary < 0) primary = rect.centerY - currentRect.centerY;
        secondary = Math.abs(rect.centerX - currentRect.centerX);
        sameLane = getOverlapAmount(currentRect.left, currentRect.right, rect.left, rect.right) > Math.min(currentRect.width, rect.width) * 0.2;
        score = (sameLane ? 0 : 20000) + Math.max(primary, 0) * 100 + secondary;
      }
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }

  function moveFocus(direction) {
    var root = getFocusRoot();
    var focused = document.activeElement;
    var next;
    if (!focused || (root !== document && !root.contains(focused))) {
      safeFocus(getDefaultFocus(root));
      return true;
    }
    next = findNextFocusable(focused, direction);
    if (next) {
      safeFocus(next);
      smoothScrollIntoView(next);
      return true;
    }
    return false;
  }

  function isEnter(event) { return event.key === 'Enter' || event.key === ' ' || event.keyCode === 13 || event.keyCode === 32 || event.keyCode === 10252; }
  function isBack(event) { return event.key === 'Backspace' || event.key === 'Escape' || event.keyCode === 8 || event.keyCode === 27 || event.keyCode === 10009; }
  function isLeft(event) { return event.key === 'ArrowLeft' || event.keyCode === 37; }
  function isRight(event) { return event.key === 'ArrowRight' || event.keyCode === 39; }
  function isUp(event) { return event.key === 'ArrowUp' || event.keyCode === 38; }
  function isDown(event) { return event.key === 'ArrowDown' || event.keyCode === 40; }
  function isPlayKey(event) { return event.key === 'MediaPlay' || event.keyCode === 415; }
  function isPauseKey(event) { return event.key === 'MediaPause' || event.keyCode === 19; }
  function isStopKey(event) { return event.key === 'MediaStop' || event.keyCode === 413; }

  function stopEvent(event) {
    if (!event) return;
    if (event.preventDefault) event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  }

  function isTextEditingElement(element) {
    if (!element) return false;
    return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
  }

  function requestJson(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            callback(null, JSON.parse(xhr.responseText));
          } catch (error) {
            callback(error, null);
          }
        } else {
          callback(new Error('Request failed: ' + xhr.status), null);
        }
      }
    };
    xhr.onerror = function(error) { callback(error || new Error('Network error'), null); };
    xhr.send();
  }

  function requestText(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200 || xhr.status === 0) callback(null, xhr.responseText);
        else callback(new Error('Request failed: ' + xhr.status), null);
      }
    };
    xhr.onerror = function(error) { callback(error || new Error('Network error'), null); };
    xhr.send();
  }

  function apiFetch(endpoint, params, callback) {
    var search = 'api_key=' + API_KEY;
    var keys;
    var i;
    params = params || {};
    keys = Object.keys(params);
    for (i = 0; i < keys.length; i++) {
      search += '&' + keys[i] + '=' + encodeURIComponent(params[keys[i]]);
    }
    requestJson(BASE_URL + endpoint + '?' + search, callback);
  }

  function listFetch(endpoint, params, callback) {
    apiFetch(endpoint, params, function(error, data) {
      callback(error, data && data.results ? data.results : [], data && data.total_pages ? data.total_pages : 1);
    });
  }

  function getTrending(callback, page) { listFetch('/trending/all/day', { page: page || 1 }, callback); }
  function getNowPlaying(callback, page) { listFetch('/movie/now_playing', { page: page || 1 }, callback); }
  function getPopularMovies(callback, page) { listFetch('/movie/popular', { page: page || 1 }, callback); }
  function getPopularTV(callback, page) { listFetch('/tv/popular', { page: page || 1 }, callback); }
  function getTopRated(callback, page) { listFetch('/movie/top_rated', { page: page || 1 }, callback); }
  function searchMulti(query, callback) { listFetch('/search/multi', { query: query }, callback); }
  function getMovieDetails(id, callback) { apiFetch('/movie/' + id, { append_to_response: 'credits,videos' }, callback); }
  function getTVDetails(id, callback) { apiFetch('/tv/' + id, { append_to_response: 'credits,videos' }, callback); }
  function getTVSeason(id, season, callback) { apiFetch('/tv/' + id + '/season/' + season, {}, callback); }
  function getRecs(type, id, callback) {
    apiFetch((type === 'tv' ? '/tv/' : '/movie/') + id + '/recommendations', {}, function(error, data) {
      callback(error, data && data.results ? data.results : []);
    });
  }

  function getAnime(callback, page) {
    var resultParts = [[], []];
    var done = 0;
    function finish() {
      done += 1;
      if (done === 2) {
        var seen = {};
        var merged = resultParts[0].concat(resultParts[1]).filter(function(item) {
          if (seen[item.id]) return false;
          seen[item.id] = true;
          if (!item.media_type) item.media_type = item.first_air_date ? 'anime' : 'movie';
          return true;
        }).slice(0, 20);
        callback(null, merged, 10);
      }
    }
    apiFetch('/discover/movie', { with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc', page: page || 1 }, function(error, data) {
      if (!error && data && data.results) resultParts[0] = data.results;
      finish();
    });
    apiFetch('/discover/tv', { with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc', page: page || 1 }, function(error, data) {
      var i;
      if (!error && data && data.results) {
        for (i = 0; i < data.results.length; i++) data.results[i].media_type = 'anime';
        resultParts[1] = data.results;
      }
      finish();
    });
  }

  function getTrailerKey(data) {
    var list;
    var i;
    if (!data || !data.videos || !data.videos.results) return '';
    list = data.videos.results;
    for (i = 0; i < list.length; i++) {
      if (list[i].site === 'YouTube' && (list[i].type === 'Trailer' || list[i].type === 'Teaser')) return list[i].key;
    }
    return list.length ? list[0].key : '';
  }

  function searchTrailer(title, isTV, callback) {
    var url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=' + encodeURIComponent(title + ' official trailer ' + (isTV ? 'series' : 'movie')) + '&key=' + YOUTUBE_API_KEY;
    requestJson(url, function(error, data) {
      if (error) {
        callback(error, '');
        return;
      }
      callback(null, data && data.items && data.items[0] && data.items[0].id ? data.items[0].id.videoId : '');
    });
  }

  function readJson(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
  }

  function readBoolean(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      if (value === null || value === undefined || value === '') return fallback;
      return value === 'true';
    } catch (error) {
      return fallback;
    }
  }

  function writeBoolean(key, value) {
    try { localStorage.setItem(key, value ? 'true' : 'false'); } catch (error) {}
  }

  function normalizeUrlList(list) {
    var result = [];
    var seen = {};
    var i;
    list = list || [];
    for (i = 0; i < list.length; i++) {
      var value = String(list[i] || '').replace(/^\s+|\s+$/g, '');
      if (!value || seen[value]) continue;
      seen[value] = true;
      result.push(value);
    }
    return result;
  }

  function readM3USources() {
    var stored = readJson('sp_m3u_list', null);
    var legacy = '';
    if (stored && stored.length) return normalizeUrlList(stored);
    try { legacy = localStorage.getItem('sp_m3u') || ''; } catch (_error) {}
    return legacy ? [legacy] : [];
  }

  function saveM3USources(list) {
    var cleaned = normalizeUrlList(list);
    writeJson('sp_m3u_list', cleaned);
    try { localStorage.setItem('sp_m3u', cleaned.length ? cleaned[0] : ''); } catch (_error) {}
    return cleaned;
  }

  function getM3U() {
    var list = readM3USources();
    return list.length ? list[0] : '';
  }

  function getM3USources() {
    return readM3USources();
  }

  function addM3USource(url) {
    var list = readM3USources();
    list.push(url);
    return saveM3USources(list);
  }

  function clearM3USources() {
    return saveM3USources([]);
  }

  function parseM3U(text, sourceUrl) {
    var channels = [];
    var lines = text.split('\n');
    var current = null;
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\r/g, '').trim();
      if (!line || line.indexOf('#EXTM3U') === 0) continue;
      if (line.indexOf('#EXTINF:') === 0) {
        var info = line.substring(8);
        var commaIndex = info.lastIndexOf(',');
        var logoMatch = /tvg-logo="([^"]*)"/i.exec(info);
        var groupMatch = /group-title="([^"]*)"/i.exec(info);
        current = {
          name: commaIndex > -1 ? info.substring(commaIndex + 1) : 'Unknown',
          url: '',
          logo: logoMatch ? logoMatch[1] : '',
          group: groupMatch ? groupMatch[1] : 'Live TV',
          source: sourceUrl || ''
        };
      } else if (current && line.indexOf('#') !== 0) {
        current.url = line;
        channels.push(current);
        current = null;
      }
    }
    return channels;
  }

  function dedupeChannels(channels) {
    var result = [];
    var seen = {};
    var i;
    for (i = 0; i < channels.length; i++) {
      var key = String(channels[i].url || '') + '|' + String(channels[i].name || '');
      if (!channels[i].url || seen[key]) continue;
      seen[key] = true;
      result.push(channels[i]);
    }
    return result;
  }

  var state = {
    currentTab: 'home',
    heroItems: [],
    heroIndex: 0,
    nowPlaying: [],
    popularMovies: [],
    popularTV: [],
    topRated: [],
    anime: [],
    favorites: readJson('sp_fav', []),
    continueWatching: readJson('sp_cont', []),
    autoplay: readBoolean('sp_autoplay', true),
    m3uSources: getM3USources(),
    m3uChannels: [],
    searchQuery: '',
    navItems: [],
    homeRequestId: 0,
    searchRequestId: 0
  };

  function saveFav() { writeJson('sp_fav', state.favorites); }
  function saveCont() { writeJson('sp_cont', state.continueWatching); }

  function loadM3USources(done) {
    var sources = normalizeUrlList(state.m3uSources);
    var allChannels = [];
    var loaded = 0;
    var index = 0;

    state.m3uSources = sources;
    saveM3USources(sources);

    if (!sources.length) {
      state.m3uChannels = [];
      if (done) done(null, 0, 0);
      return;
    }

    function next() {
      if (index >= sources.length) {
        state.m3uChannels = dedupeChannels(allChannels);
        if (done) done(null, state.m3uChannels.length, loaded);
        return;
      }
      var sourceUrl = sources[index++];
      requestText(sourceUrl, function(error, text) {
        if (!error && text) {
          loaded += 1;
          allChannels = allChannels.concat(parseM3U(text, sourceUrl));
        }
        next();
      });
    }

    next();
  }

  function isFav(id) {
    var target = String(id);
    var i;
    for (i = 0; i < state.favorites.length; i++) {
      if (String(state.favorites[i].id) === target) return true;
    }
    return false;
  }

  function toggleFav(item) {
    var target = String(item.id);
    var i;
    for (i = 0; i < state.favorites.length; i++) {
      if (String(state.favorites[i].id) === target) {
        state.favorites.splice(i, 1);
        saveFav();
        return false;
      }
    }
    state.favorites.unshift({
      id: item.id,
      title: item.title || item.name,
      name: item.name,
      poster_path: item.poster_path,
      media_type: item.media_type || (item.first_air_date ? 'tv' : 'movie'),
      vote_average: item.vote_average,
      first_air_date: item.first_air_date,
      release_date: item.release_date
    });
    saveFav();
    return true;
  }

  function addCont(item) {
    var i;
    var exists = false;
    for (i = 0; i < state.continueWatching.length; i++) {
      if (state.continueWatching[i].id === item.id) {
        state.continueWatching[i].progress = 0.35 + Math.random() * 0.45;
        exists = true;
        break;
      }
    }
    if (!exists) {
      state.continueWatching.unshift({
        id: item.id,
        title: item.title || item.name,
        name: item.name,
        poster_path: item.poster_path,
        media_type: item.media_type || (item.first_air_date ? 'tv' : 'movie'),
        progress: 0.1 + Math.random() * 0.25
      });
    }
    state.continueWatching = state.continueWatching.slice(0, 20);
    saveCont();
  }

  var body = document.body;
  var bootSplash = $('#boot-splash');
  var app = createEl('div');
  var nav = createEl('div');
  var main = createEl('div');
  var searchDiv = createEl('div');
  var searchInput = createEl('input');
  var content = createEl('div');

  body.innerHTML = '';
  if (shouldUse4KScale()) {
    addClass(body, 'tv-4k');
  }
  if (bootSplash) body.appendChild(bootSplash);
  injectFocusOverride();
  app.className = 'app-container';
  nav.className = 'nav-container';
  main.className = 'main-content';
  searchDiv.className = 'search-container';
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search movies, shows, anime...';
  searchInput.tabIndex = 0;
  content.className = 'content-area';
  content.id = 'main-content';

  searchInput.oninput = function() {
    state.searchQuery = searchInput.value.replace(/^\s+|\s+$/g, '');
    if (state.searchQuery.length > 1) {
      state.currentTab = 'search';
      renderContent();
    } else if (state.currentTab === 'search') {
      renderContent();
    }
  };
  searchInput.onkeydown = function(event) {
    if (isEnter(event)) {
      state.currentTab = 'search';
      renderContent();
    }
  };

  function buildIcon(type) {
    if (type === 'home') return '<svg viewBox="0 0 24 24" fill="none"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    if (type === 'search') return '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    if (type === 'live') return '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.4" opacity="0.7"/></svg>';
    if (type === 'fav') return '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-6.7-4.4-8.4-8.3c-1.3-3.1 1-6.7 4.4-6.7 1.9 0 3 1 4 2.2C13 6 14.2 5 16 5c3.4 0 5.7 3.6 4.4 6.7C18.7 15.6 12 20 12 20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="m19 12 1.5-1-.8-2-1.8-.2-.8-1.3.8-1.7L16.5 4l-1.6 1-1.5-.5L13 2.8h-2l-.4 1.7-1.5.5-1.6-1L5.1 5.8l.8 1.7-.8 1.3-1.8.2-.8 2L4 12l-1.5 1 .8 2 1.8.2.8 1.3-.8 1.7L7.5 20l1.6-1 1.5.5.4 1.7h2l.4-1.7 1.5-.5 1.6 1 1.4-1.8-.8-1.7.8-1.3 1.8-.2.8-2L19 12Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  }

  function setActiveNav() {
    var i;
    for (i = 0; i < state.navItems.length; i++) {
      state.navItems[i].className = 'nav-item' + (state.navItems[i].getAttribute('data-tab') === state.currentTab ? ' active' : '');
    }
  }

  function fetchBrowsePage(key, page, callback) {
    if (key === 'new') getNowPlaying(callback, page);
    else if (key === 'movies') getPopularMovies(callback, page);
    else if (key === 'tv') getPopularTV(callback, page);
    else if (key === 'anime') getAnime(callback, page);
    else callback(null, [], 1);
  }

  function closeDetailToHome() {
    var overlays = $$('.detail-overlay, .browse-overlay');
    var i;
    var remaining = 0;
    function finish() {
      remaining -= 1;
      if (remaining > 0) return;
      state.currentTab = 'home';
      renderContent();
      setTimeout(function() { focusFirst('.hero-action'); }, 80);
    }
    for (i = 0; i < overlays.length; i++) {
      if (overlays[i] && overlays[i].parentNode) remaining += 1;
    }
    if (!remaining) {
      state.currentTab = 'home';
      renderContent();
      setTimeout(function() { focusFirst('.hero-action'); }, 80);
      return;
    }
    for (i = 0; i < overlays.length; i++) {
      if (overlays[i] && overlays[i].parentNode) removeNodeAnimated(overlays[i], 'overlay-exit', 220, finish);
    }
  }

  function openBrowseOverlay(titleText, key) {
    var overlay = createEl('div');
    var topbar = createEl('div');
    var title = createEl('h2');
    var backBtn = createEl('button');
    var grid = createEl('div');
    var actions = createEl('div');
    var moreBtn = createEl('button');
    var currentPage = 0;
    var totalPages = 1;
    var loading = false;

    overlay.className = 'browse-overlay';
    topbar.className = 'browse-topbar';
    title.className = 'browse-title';
    title.textContent = titleText;
    backBtn.className = 'back-btn';
    backBtn.textContent = '< Back';
    backBtn.tabIndex = 0;
    backBtn.setAttribute('data-default-focus', 'true');
    backBtn.onclick = function() {
      removeNodeAnimated(overlay, 'overlay-exit', 220, function() {
        setTimeout(function() { focusFirst('.section-more'); }, 40);
      });
    };
    backBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };
    grid.className = 'browse-grid';
    actions.className = 'browse-actions';
    moreBtn.className = 'btn btn-secondary';
    moreBtn.textContent = 'Load More';
    moreBtn.tabIndex = 0;
    moreBtn.onclick = function() {
      if (!loading && currentPage < totalPages) loadPage(currentPage + 1);
    };
    moreBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };

    topbar.appendChild(title);
    topbar.appendChild(backBtn);
    actions.appendChild(moreBtn);
    overlay.appendChild(topbar);
    overlay.appendChild(grid);
    overlay.appendChild(actions);
    document.body.appendChild(overlay);

    function appendTiles(items) {
      var i;
      for (i = 0; i < items.length; i++) {
        grid.appendChild(createTile(items[i], key === 'tv' ? 'tv' : key === 'anime' ? 'anime' : 'movie'));
      }
    }

    function loadPage(page) {
      loading = true;
      moreBtn.textContent = 'Loading...';
      fetchBrowsePage(key, page, function(error, items, pages) {
        loading = false;
        if (error) {
          moreBtn.textContent = 'Retry';
          return;
        }
        currentPage = page;
        totalPages = pages || 1;
        appendTiles(items || []);
        if (currentPage >= totalPages) {
          moreBtn.textContent = 'No More Results';
          moreBtn.disabled = true;
        } else {
          moreBtn.textContent = 'Load More';
          moreBtn.disabled = false;
        }
        if (currentPage === 1) setTimeout(function() { focusFirst('.browse-grid .tile'); }, 80);
      });
    }

    loadPage(1);
  }

  function buildNav() {
    var navDefs = [
      { id: 'home', label: 'Home' },
      { id: 'search', label: 'Search' },
      { id: 'live', label: 'Live TV' },
      { id: 'fav', label: 'Favorites' },
      { id: 'settings', label: 'Settings' }
    ];
    var i;
    state.navItems = [];
    nav.innerHTML = '';
    for (i = 0; i < navDefs.length; i++) {
      (function(def) {
        var btn = createEl('button');
        btn.className = 'nav-item' + (def.id === 'home' ? ' active' : '');
        btn.setAttribute('data-tab', def.id);
        btn.setAttribute('data-nav-role', 'dock');
        btn.id = 'dock-' + def.id;
        btn.tabIndex = 0;
        btn.innerHTML = '<span class="dock-bubble"></span><span class="nav-icon">' + buildIcon(def.id) + '</span><span class="nav-item-label">' + def.label + '</span>';
        btn.onclick = function() {
          state.currentTab = def.id;
          setActiveNav();
          renderContent();
          if (def.id === 'search') {
            setTimeout(function() { try { searchInput.focus(); } catch (error) {} }, 80);
          }
        };
        btn.onkeydown = function(event) { if (isEnter(event)) this.click(); };
        state.navItems.push(btn);
        nav.appendChild(btn);
      })(navDefs[i]);
    }
  }

  function clearHeroTimer() {
    if (HERO_INTERVAL) {
      clearInterval(HERO_INTERVAL);
      HERO_INTERVAL = null;
    }
  }

  function focusFirst(selector) {
    var target = $(selector);
    safeFocus(target);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createLoadingMarkup(text) {
    return '<div class="loading">' +
      '<span class="loader" aria-hidden="true"></span>' +
      (text ? '<div class="loading-copy">' + escapeHtml(text) + '</div>' : '') +
      '</div>';
  }

  function ensureToastRoot() {
    var root = $('#toast-root');
    if (root) return root;
    root = createEl('div');
    root.id = 'toast-root';
    root.className = 'toast-root';
    document.body.appendChild(root);
    return root;
  }

  function showToast(message, tone) {
    var root = ensureToastRoot();
    var toast = createEl('div');
    toast.className = 'toast' + (tone ? ' toast-' + tone : '');
    toast.textContent = message;
    root.appendChild(toast);
    setTimeout(function() { addClass(toast, 'toast-visible'); }, 10);
    setTimeout(function() { addClass(toast, 'toast-hide'); }, 2300);
    setTimeout(function() {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2700);
  }

  function getFavoriteButtonMarkup(active) {
    return '<span class="fav-icon-wrap" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-6.7-4.4-8.4-8.3c-1.3-3.1 1-6.7 4.4-6.7 1.9 0 3 1 4 2.2C13 6 14.2 5 16 5c3.4 0 5.7 3.6 4.4 6.7C18.7 15.6 12 20 12 20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
      '</span>' +
      '<span class="fav-label">' + (active ? 'Saved' : 'Add to Favorites') + '</span>';
  }

  function updateFavoriteButton(button, active) {
    if (!button) return;
    button.className = 'fav-btn' + (active ? ' active' : '');
    button.innerHTML = getFavoriteButtonMarkup(active);
  }

  function createEmpty(title, copy) {
    var box = createEl('div');
    box.className = 'empty-state';
    box.innerHTML = '<h2>' + title + '</h2><p>' + copy + '</p>';
    return box;
  }

  function renderContent() {
    try {
      clearHeroTimer();
      content.innerHTML = '';
      setActiveNav();
      if (state.currentTab === 'search') {
        searchInput.disabled = false;
        searchInput.removeAttribute('data-nav-disabled');
      } else {
        searchInput.disabled = true;
        searchInput.setAttribute('data-nav-disabled', 'true');
      }
      if (state.currentTab === 'home') renderHome();
      else if (state.currentTab === 'search') renderSearch();
      else if (state.currentTab === 'live') renderLiveTV();
      else if (state.currentTab === 'fav') renderFavorites();
      else if (state.currentTab === 'settings') renderSettings();
    } catch (error) {
      showFatalError(error && error.message ? error.message : error);
    }
  }

  function renderHome() {
    var requestId;
    content.innerHTML = createLoadingMarkup('Loading home...');
    state.homeRequestId += 1;
    requestId = state.homeRequestId;
    var pending = 5;
    function done() {
      pending -= 1;
      if (pending === 0) {
        if (state.currentTab !== 'home' || requestId !== state.homeRequestId) return;
        content.innerHTML = '';
        renderHero();
        if (state.continueWatching.length) renderSection('Continue Watching', state.continueWatching.slice(0, 6), 'continue');
        if (state.nowPlaying.length) renderSection('New Releases', state.nowPlaying.slice(0, 12), 'movie', 'new');
        if (state.popularMovies.length) renderSection('Movies', state.popularMovies.slice(0, 12), 'movie', 'movies');
        if (state.popularTV.length) renderSection('TV Shows', state.popularTV.slice(0, 12), 'tv', 'tv');
        if (state.anime.length) renderSection('Anime', state.anime.slice(0, 12), 'anime', 'anime');
        hideBootSplash();
        setTimeout(function() { focusFirst('.hero-action'); }, 100);
      }
    }
    getTrending(function(error, data) { state.heroItems = error ? [] : (data || []).slice(0, 8); done(); });
    getNowPlaying(function(error, data) { state.nowPlaying = error ? [] : (data || []); done(); });
    getPopularMovies(function(error, data) { state.popularMovies = error ? [] : (data || []); done(); });
    getPopularTV(function(error, data) { state.popularTV = error ? [] : (data || []); done(); });
    getAnime(function(error, data) { state.anime = error ? [] : (data || []); done(); });
  }

  function renderHero() {
    if (!state.heroItems.length) return;
    var item = state.heroItems[state.heroIndex];
    var hero = createEl('div');
    var image = createEl('div');
    var overlay = createEl('div');
    var title = createEl('h2');
    var meta = createEl('p');
    var desc = createEl('p');
    var playBtn = createEl('button');
    var dots = createEl('div');
    var i;

    hero.className = 'hero-container';
    image.className = 'hero-image';
    overlay.className = 'hero-overlay';
    title.className = 'hero-title';
    meta.className = 'hero-meta';
    desc.className = 'hero-desc';
    playBtn.className = 'btn btn-play hero-action';
    dots.className = 'hero-dots';

    function paintHero(nextItem) {
      image.style.backgroundImage = 'url("' + heroImg(nextItem.backdrop_path || nextItem.poster_path) + '")';
      title.textContent = getTitle(nextItem);
      meta.textContent = (getYear(nextItem) ? getYear(nextItem) + '  ' : '') + (nextItem.vote_average ? 'Rating ' + Number(nextItem.vote_average).toFixed(1) : 'Featured');
      desc.textContent = (nextItem.overview || 'Browse details, trailers, and recommended titles from this hero selection.').substring(0, 150) + '...';
    }

    paintHero(item);
    playBtn.textContent = 'Watch Now';
    playBtn.tabIndex = 0;
    playBtn.setAttribute('data-default-focus', 'true');
    playBtn.onclick = function() { openDetail(state.heroItems[state.heroIndex]); };
    playBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };

    overlay.appendChild(title);
    overlay.appendChild(meta);
    overlay.appendChild(desc);
    overlay.appendChild(playBtn);
    hero.appendChild(image);
    hero.appendChild(overlay);

    for (i = 0; i < state.heroItems.length; i++) {
      (function(index) {
        var dot = createEl('span');
        dot.className = 'hero-dot' + (index === state.heroIndex ? ' active' : '');
        dot.onclick = function() {
          var allDots;
          var j;
          state.heroIndex = index;
          paintHero(state.heroItems[index]);
          allDots = dots.querySelectorAll('.hero-dot');
          for (j = 0; j < allDots.length; j++) allDots[j].className = 'hero-dot' + (j === index ? ' active' : '');
        };
        dots.appendChild(dot);
      })(i);
    }

    hero.appendChild(dots);
    content.appendChild(hero);

    HERO_INTERVAL = setInterval(function() {
      var dotsList;
      var j;
      if (!state.heroItems.length) return;
      state.heroIndex = (state.heroIndex + 1) % state.heroItems.length;
      paintHero(state.heroItems[state.heroIndex]);
      dotsList = dots.querySelectorAll('.hero-dot');
      for (j = 0; j < dotsList.length; j++) dotsList[j].className = 'hero-dot' + (j === state.heroIndex ? ' active' : '');
    }, 6000);
  }

  function renderSection(titleText, items, type, browseKey) {
    var section = createEl('div');
    var header = createEl('div');
    var title = createEl('h2');
    var moreBtn;
    var row = createEl('div');
    var i;
    section.className = 'section';
    header.className = 'section-header';
    title.className = 'section-title';
    row.className = 'tile-row';
    title.textContent = titleText;
    header.appendChild(title);
    if (browseKey) {
      moreBtn = createEl('button');
      moreBtn.className = 'section-more';
      moreBtn.textContent = 'See All';
      moreBtn.tabIndex = 0;
      moreBtn.onclick = function() { openBrowseOverlay(titleText, browseKey); };
      moreBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };
      header.appendChild(moreBtn);
    }
    section.appendChild(header);
    for (i = 0; i < items.length; i++) row.appendChild(createTile(items[i], type));
    section.appendChild(row);
    content.appendChild(section);
  }

  function createTile(item, type) {
    var tile = createEl('div');
    var img = createEl('img');
    var info = createEl('div');
    var title = createEl('p');
    tile.className = 'tile';
    tile.tabIndex = 0;
    img.className = 'tile-img';
    img.src = tmdbImg(item.poster_path, 'w342');
    img.alt = getTitle(item);
    info.className = 'tile-info';
    title.className = 'tile-title';
    title.textContent = getTitle(item);
    info.appendChild(title);
    tile.appendChild(img);
    if (item.vote_average && type !== 'continue') {
      var badge = createEl('span');
      badge.className = 'rating-badge';
      badge.textContent = Number(item.vote_average).toFixed(1);
      tile.appendChild(badge);
    }
    tile.appendChild(info);
    if (type === 'continue' && item.progress) {
      var progress = createEl('div');
      var fill = createEl('div');
      progress.className = 'progress-bar';
      fill.className = 'progress-fill';
      fill.style.width = (item.progress * 100) + '%';
      progress.appendChild(fill);
      tile.appendChild(progress);
    }
    tile.onclick = function() { openDetail(item); };
    tile.onkeydown = function(event) { if (isEnter(event)) openDetail(item); };
    return tile;
  }

  function renderLiveTV() {
    var i;
    var list = createEl('div');
    if (!state.m3uChannels.length) {
      content.appendChild(createEmpty('No M3U Playlist', 'Go to Settings to add one or more M3U playlist URLs.'));
      hideBootSplash();
      setTimeout(function() { focusFirst('.nav-item.active'); }, 80);
      return;
    }
    list.className = 'channel-list';
    for (i = 0; i < state.m3uChannels.length; i++) {
      var channel = state.m3uChannels[i];
      var item = createEl('div');
      var logo = createEl('img');
      var title = createEl('div');
      var meta = createEl('div');
      item.className = 'channel-item';
      item.tabIndex = 0;
      logo.className = 'channel-logo';
      logo.src = channel.logo || ('https://picsum.photos/100/100?random=' + i);
      title.className = 'channel-name';
      title.textContent = channel.name;
      meta.className = 'channel-group';
      meta.textContent = channel.group || 'Live TV';
      item.appendChild(logo);
      var textWrap = createEl('div');
      textWrap.className = 'channel-text';
      textWrap.appendChild(title);
      textWrap.appendChild(meta);
      item.appendChild(textWrap);
      item.onclick = function(url) { return function() { playStream(url); }; }(channel.url);
      item.onkeydown = function(url) { return function(event) { if (isEnter(event)) playStream(url); }; }(channel.url);
      list.appendChild(item);
    }
    content.appendChild(list);
    hideBootSplash();
    setTimeout(function() { focusFirst('.channel-item'); }, 100);
  }

  function renderFavorites() {
    if (!state.favorites.length) {
      content.appendChild(createEmpty('No Favorites', 'Add titles from the detail page using the favorite button.'));
      hideBootSplash();
      return;
    }
    renderSection('My Favorites', state.favorites, 'fav');
    hideBootSplash();
    setTimeout(function() { focusFirst('.tile'); }, 80);
  }

  function renderSearch() {
    var requestId;
    if (state.searchQuery.length < 2) {
      content.appendChild(createEmpty('Search SPACE TV', 'Type at least two characters, then press Enter.'));
      hideBootSplash();
      setTimeout(function() { try { searchInput.focus(); } catch (error) {} }, 80);
      return;
    }
    content.innerHTML = createLoadingMarkup('Searching...');
    state.searchRequestId += 1;
    requestId = state.searchRequestId;
    searchMulti(state.searchQuery, function(error, data) {
      var filtered = [];
      var i;
      if (state.currentTab !== 'search' || requestId !== state.searchRequestId) return;
      if (error || !data || !data.length) {
        content.innerHTML = '';
        content.appendChild(createEmpty('No Results', 'Try a different title or broader keyword.'));
        hideBootSplash();
        return;
      }
      content.innerHTML = '';
      for (i = 0; i < data.length; i++) {
        if (data[i].media_type !== 'person') {
          data[i].media_type = data[i].media_type || (data[i].first_air_date ? 'tv' : 'movie');
          filtered.push(data[i]);
        }
      }
      renderSection('Search Results', filtered.slice(0, 24), 'search');
      hideBootSplash();
      setTimeout(function() { focusFirst('.tile'); }, 80);
    });
  }

  function renderSettings() {
    var list = createEl('div');
    content.innerHTML = '';
    list.className = 'settings-list';
    list.appendChild(createToggleRow('Autoplay', 'Automatically start movie, TV, and live playback', state.autoplay, function() {
      state.autoplay = !state.autoplay;
      writeBoolean('sp_autoplay', state.autoplay);
      showToast('Autoplay ' + (state.autoplay ? 'enabled' : 'disabled'), 'info');
      renderSettings();
    }));
    list.appendChild(createSettingsRow('Add M3U Playlist +', state.m3uSources.length ? (state.m3uSources.length + ' stacked playlists') : 'Add first playlist', showM3UModal));
    list.appendChild(createSettingsRow('Delete M3U Playlists', state.m3uSources.length ? 'Clear all saved playlists' : 'Nothing saved', function() {
      if (!state.m3uSources.length) {
        showToast('No M3U playlists to delete', 'info');
        return;
      }
      state.m3uSources = clearM3USources();
      state.m3uChannels = [];
      showToast('Deleted all M3U playlists', 'success');
      renderSettings();
    }));
    list.appendChild(createSettingsRow('Clear Continue Watching', 'Reset the resume row', function() {
      state.continueWatching = [];
      saveCont();
      showToast('Continue Watching cleared', 'success');
      renderSettings();
    }));
    list.appendChild(createSettingsRow('Clear Favorites', 'Remove saved titles', function() {
      state.favorites = [];
      saveFav();
      showToast('Favorites cleared', 'success');
      renderSettings();
    }));
    list.appendChild(createSettingsRow('Exit App', 'Close SPACE TV', function() {
      try {
        if (typeof tizen !== 'undefined' && tizen.application) {
          tizen.application.getCurrentApplication().exit();
          return;
        }
      } catch (_error) {}
      window.close();
    }));
    content.appendChild(list);
    hideBootSplash();
    setTimeout(function() { focusFirst('.settings-row'); }, 80);
  }

  function createSettingsRow(labelText, valueText, action) {
    var row = createEl('div');
    var label = createEl('span');
    var value = createEl('span');
    row.className = 'settings-row';
    row.tabIndex = 0;
    label.className = 'settings-label';
    label.textContent = labelText;
    value.className = 'settings-value';
    value.textContent = valueText;
    row.appendChild(label);
    row.appendChild(value);
    row.onclick = action;
    row.onkeydown = function(event) { if (isEnter(event)) action(); };
    return row;
  }

  function createToggleRow(labelText, copyText, active, action) {
    var row = createEl('div');
    var labelWrap = createEl('div');
    var label = createEl('div');
    var copy = createEl('div');
    var toggle = createEl('div');
    var knob = createEl('div');
    row.className = 'settings-row';
    row.tabIndex = 0;
    label.className = 'settings-label';
    label.textContent = labelText;
    copy.className = 'settings-copy';
    copy.textContent = copyText;
    labelWrap.appendChild(label);
    labelWrap.appendChild(copy);
    toggle.className = active ? 'toggle-switch active' : 'toggle-switch';
    knob.className = 'toggle-knob';
    toggle.appendChild(knob);
    row.appendChild(labelWrap);
    row.appendChild(toggle);
    row.onclick = action;
    row.onkeydown = function(event) { if (isEnter(event)) action(); };
    return row;
  }

  function showM3UModal() {
    var overlay = createEl('div');
    var box = createEl('div');
    var title = createEl('h3');
    var meta = createEl('p');
    var input = createEl('input');
    var buttons = createEl('div');
    var saveBtn = createEl('button');
    var cancelBtn = createEl('button');
    overlay.className = 'modal-overlay';
    box.className = 'modal-box';
    title.className = 'modal-title';
    meta.className = 'settings-copy';
    input.className = 'modal-input';
    input.setAttribute('data-default-focus', 'true');
    buttons.className = 'modal-buttons';
    saveBtn.className = 'btn btn-play';
    cancelBtn.className = 'btn btn-secondary';
    title.textContent = 'Add M3U Playlist +';
    meta.textContent = state.m3uSources.length ? (state.m3uSources.length + ' playlists already stacked') : 'Stack another playlist to merge more channels.';
    input.placeholder = 'Enter M3U URL...';
    input.value = '';
    saveBtn.textContent = 'Done';
    cancelBtn.textContent = 'Cancel';
    saveBtn.onclick = function() {
      var url = input.value.replace(/^\s+|\s+$/g, '');
      if (!url) {
        showToast('Enter a playlist URL first', 'info');
        return;
      }
      if (normalizeUrlList(state.m3uSources.concat([url])).length === state.m3uSources.length) {
        showToast('Playlist already added', 'info');
        return;
      }
      state.m3uSources = addM3USource(url);
      removeNodeAnimated(overlay, 'overlay-exit', 180);
      content.innerHTML = createLoadingMarkup('Loading playlists...');
      loadM3USources(function(error, channelCount, loadedCount) {
        if (error || !loadedCount) {
          showToast('Failed to load playlist', 'error');
          renderSettings();
          return;
        }
        showToast('Loaded ' + channelCount + ' channels from ' + loadedCount + ' playlist' + (loadedCount === 1 ? '' : 's'), 'success');
        renderSettings();
      });
    };
    saveBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };
    cancelBtn.onclick = function() {
      removeNodeAnimated(overlay, 'overlay-exit', 180);
      setTimeout(function() { focusFirst('.settings-row'); }, 50);
    };
    cancelBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };
    box.appendChild(title);
    box.appendChild(meta);
    box.appendChild(input);
    buttons.appendChild(saveBtn);
    buttons.appendChild(cancelBtn);
    box.appendChild(buttons);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(function() { try { input.focus(); } catch (error) {} }, 30);
  }

  function getGenreTagClass(name) {
    var slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return 'tag tag-genre-' + slug;
  }

  function openDetail(item) {
    var mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    addCont(item);
    var existing = $('.detail-overlay');
    var overlay = createEl('div');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    overlay.className = 'detail-overlay page-overlay';
    overlay.innerHTML = createLoadingMarkup('Loading...');
    document.body.appendChild(overlay);
    (mediaType === 'tv' || mediaType === 'anime' ? getTVDetails : getMovieDetails)(item.id, function(error, data) {
      if (error || !data) {
        overlay.remove();
        return;
      }
      renderDetail(overlay, data, mediaType);
    });
  }

  function renderDetail(overlay, data, mediaType) {
    var backBtn = createEl('button');
    var hero = createEl('div');
    var heroImageEl = createEl('div');
    var heroOverlay = createEl('div');
    var detail = createEl('div');
    var detailTitle = createEl('h1');
    var meta = createEl('div');
    var favBtn = createEl('button');
    var playBtn = createEl('button');
    var trailerBtn = createEl('button');
    var overview = createEl('p');
    var actionRow = createEl('div');
    var i;
    overlay.innerHTML = '';
    backBtn.className = 'back-btn';
    backBtn.textContent = '< Back';
    backBtn.tabIndex = 0;
    backBtn.onclick = function() { closeDetailToHome(); };
    backBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };
    overlay.appendChild(backBtn);

    hero.className = 'detail-hero';
    heroImageEl.className = 'detail-hero-img';
    heroImageEl.style.backgroundImage = 'url("' + heroImg(data.backdrop_path || data.poster_path) + '")';
    heroOverlay.className = 'detail-hero-overlay';
    hero.appendChild(heroImageEl);
    hero.appendChild(heroOverlay);
    overlay.appendChild(hero);

    detail.className = 'detail-content';
    detailTitle.className = 'detail-title';
    detailTitle.textContent = getTitle(data);
    detail.appendChild(detailTitle);

    meta.className = 'detail-meta';
    if (getYear(data)) {
      var year = createEl('span');
      year.textContent = getYear(data);
      meta.appendChild(year);
    }
    if (data.runtime) {
      var runtime = createEl('span');
      runtime.textContent = data.runtime + ' min';
      meta.appendChild(runtime);
    }
    if (data.vote_average) {
      var rating = createEl('span');
      rating.textContent = 'Rating: ' + Number(data.vote_average).toFixed(1);
      meta.appendChild(rating);
    }
    detail.appendChild(meta);

    (function() {
      var typeTag = createEl('span');
      typeTag.className = 'tag tag-type';
      typeTag.textContent = mediaType === 'tv' ? 'TV Series' : mediaType === 'anime' ? 'Anime' : 'Movie';
      detail.appendChild(typeTag);
    })();

    if (data.genres) {
      for (i = 0; i < data.genres.length; i++) {
        var tag = createEl('span');
        tag.className = getGenreTagClass(data.genres[i].name);
        tag.textContent = data.genres[i].name;
        detail.appendChild(tag);
      }
    }

    updateFavoriteButton(favBtn, isFav(data.id));
    favBtn.tabIndex = 0;
    favBtn.onclick = function() {
      var active = toggleFav(data);
      updateFavoriteButton(favBtn, active);
      showToast(active ? 'Added to Favorites' : 'Removed from Favorites', 'success');
      if (state.currentTab === 'fav') renderContent();
    };
    favBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };

    playBtn.className = 'btn btn-play';
    playBtn.textContent = 'Play';
    playBtn.tabIndex = 0;
    playBtn.setAttribute('data-default-focus', 'true');
    playBtn.onclick = function() { playContent(data, mediaType); };
    playBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };
    detail.appendChild(playBtn);

    trailerBtn.className = 'btn btn-secondary';
    trailerBtn.textContent = 'Trailer';
    trailerBtn.tabIndex = 0;
    trailerBtn.onclick = function() {
      var trailerKey = getTrailerKey(data);
      if (trailerKey) {
        playTrailer(trailerKey);
        return;
      }
      searchTrailer(getTitle(data), mediaType === 'tv', function(error, videoId) {
        if (!error && videoId) playTrailer(videoId);
      });
    };
    trailerBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };
    actionRow.className = 'detail-actions';
    actionRow.appendChild(playBtn);
    actionRow.appendChild(trailerBtn);
    actionRow.appendChild(favBtn);
    detail.appendChild(actionRow);

    if (data.overview) {
      overview.className = 'detail-overview';
      overview.textContent = data.overview;
      detail.appendChild(overview);
    }

    if (mediaType === 'tv' && data.seasons && data.seasons.length) {
      var seasonSection = createEl('div');
      var label = createEl('span');
      var seasonButtons = createEl('div');
      var episodes = createEl('div');
      var activeSeason = 1;
      seasonSection.className = 'season-selector';
      label.className = 'settings-label';
      label.textContent = 'Season';
      seasonButtons.className = 'season-buttons';
      episodes.className = 'episode-list';
      for (i = 0; i < data.seasons.length; i++) {
        if (data.seasons[i].season_number > 0) {
          (function(seasonNumber, episodeCount) {
            var button = createEl('button');
            button.className = 'season-btn' + (seasonNumber === 1 ? ' active' : '');
            button.textContent = 'Season ' + seasonNumber + ' (' + episodeCount + ' eps)';
            button.tabIndex = 0;
            button.onclick = function() {
              var all = seasonButtons.querySelectorAll('.season-btn');
              var j;
              activeSeason = seasonNumber;
              for (j = 0; j < all.length; j++) all[j].className = 'season-btn';
              button.className = 'season-btn active';
              loadEpisodes(data.id, activeSeason, episodes);
            };
            button.onkeydown = function(event) { if (isEnter(event)) this.click(); };
            seasonButtons.appendChild(button);
          })(data.seasons[i].season_number, data.seasons[i].episode_count);
        }
      }
      seasonSection.appendChild(label);
      seasonSection.appendChild(seasonButtons);
      detail.appendChild(seasonSection);
      detail.appendChild(episodes);
      loadEpisodes(data.id, activeSeason, episodes);
    }

    if (data.credits && data.credits.cast && data.credits.cast.length) {
      var castSection = createEl('div');
      var castHeader = createEl('h3');
      var castList = createEl('div');
      castSection.className = 'cast-section';
      castHeader.textContent = 'Cast';
      castList.className = 'cast-list';
      castSection.appendChild(castHeader);
      for (i = 0; i < Math.min(data.credits.cast.length, 10); i++) {
        var actor = data.credits.cast[i];
        var castItem = createEl('div');
        var castImg = createEl('img');
        var castName = createEl('p');
        castItem.className = 'cast-item';
        castImg.className = 'cast-img';
        castImg.src = tmdbImg(actor.profile_path, 'w185');
        castImg.onerror = function() { this.src = 'https://picsum.photos/100/100?grayscale'; };
        castName.className = 'cast-name';
        castName.textContent = actor.name;
        castItem.appendChild(castImg);
        castItem.appendChild(castName);
        castList.appendChild(castItem);
      }
      castSection.appendChild(castList);
      detail.appendChild(castSection);
    }

    overlay.appendChild(detail);
    hideBootSplash();

    getRecs(mediaType, data.id, function(error, recs) {
      var section;
      var row;
      var j;
      if (error || !recs || !recs.length) return;
      section = createEl('div');
      section.className = 'similar-section';
      section.appendChild((function() { var h = createEl('h3'); h.textContent = 'Similar'; return h; })());
      row = createEl('div');
      row.className = 'similar-row';
      for (j = 0; j < Math.min(recs.length, 8); j++) {
        var rec = recs[j];
        var item = createEl('div');
        var img = createEl('img');
        var name = createEl('p');
        item.className = 'similar-item';
        item.tabIndex = 0;
        img.className = 'similar-img';
        img.src = tmdbImg(rec.poster_path, 'w342');
        name.className = 'similar-title';
        name.textContent = getTitle(rec);
        item.appendChild(img);
        item.appendChild(name);
        item.onclick = function(recItem) { return function() { overlay.remove(); openDetail(recItem); }; }(rec);
        item.onkeydown = function(recItem) { return function(event) { if (isEnter(event)) { overlay.remove(); openDetail(recItem); } }; }(rec);
        row.appendChild(item);
      }
      section.appendChild(row);
      detail.appendChild(section);
    });

    setTimeout(function() { focusFirst('.btn-play'); }, 80);
  }

  function loadEpisodes(tvId, season, target) {
    target.innerHTML = createLoadingMarkup('Loading episodes...');
    getTVSeason(tvId, season, function(error, data) {
      var i;
      target.innerHTML = '';
      if (error || !data || !data.episodes) return;
      for (i = 0; i < data.episodes.length; i++) {
        var episode = data.episodes[i];
        var row = createEl('div');
        var thumb = createEl('img');
        var copy = createEl('div');
        var number = createEl('span');
        var title = createEl('span');
        row.className = 'episode-item';
        row.tabIndex = 0;
        thumb.className = 'episode-thumb';
        thumb.src = episode.still_path ? tmdbImg(episode.still_path, 'w300') : ('https://picsum.photos/320/180?random=' + i);
        copy.className = 'episode-copy';
        number.className = 'episode-num';
        title.className = 'episode-title';
        number.textContent = 'E' + episode.episode_number;
        title.textContent = episode.name || ('Episode ' + episode.episode_number);
        copy.appendChild(number);
        copy.appendChild(title);
        row.appendChild(thumb);
        row.appendChild(copy);
        row.onclick = function(s, e) { return function() { playEpisode(tvId, s, e); }; }(season, episode.episode_number);
        row.onkeydown = function(s, e) { return function(event) { if (isEnter(event)) playEpisode(tvId, s, e); }; }(season, episode.episode_number);
        target.appendChild(row);
      }
    });
  }

  function buildTizenStreamUrl(mediaType, tmdbId, season, episode) {
    return 'stream-proxy.html?mediaType=' + encodeURIComponent(mediaType) +
      '&id=' + encodeURIComponent(tmdbId) +
      '&season=' + encodeURIComponent(season || 1) +
      '&episode=' + encodeURIComponent(episode || 1) +
      '&autoplay=' + (state.autoplay ? '1' : '0') +
      '&worker=' + encodeURIComponent(STREAM_GATEWAY_URL);
  }

  function buildNativeDirectPlayerUrl(url) {
    return 'stream-proxy.html?src=' + encodeURIComponent(url) + '&autoplay=' + (state.autoplay ? '1' : '0');
  }

  function getStreamUrl(mediaType, tmdbId, season, episode) {
    var params = '?player=jw&ref=mapple&autoplay=' + (state.autoplay ? 'true' : 'false') + '&poster=false&title=false&primaryColor=35c6ff&secondaryColor=6b7280&iconColor=ffffff&quality=1080p&preferredQuality=1080p';
    if (isTizenRuntime()) return buildTizenStreamUrl(mediaType, tmdbId, season, episode);
    if (mediaType === 'movie') return VIDLINK_BASE + '/movie/' + tmdbId + params;
    if (mediaType === 'anime') return VIDLINK_BASE + '/anime/' + tmdbId + '/1/sub' + params + '&fallback=true';
    return VIDLINK_BASE + '/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1) + params;
  }

  function ensureAutoplayQualityUrl(url) {
    if (!url) return url;
    if (/youtube\.com\/embed\//i.test(url)) {
      if (state.autoplay) {
        if (url.indexOf('?') === -1) return url + '?autoplay=1&rel=0&vq=hd1080';
        return url + '&autoplay=1&rel=0&vq=hd1080';
      }
      if (url.indexOf('?') === -1) return url + '?autoplay=0&rel=0&vq=hd1080';
      return url + '&autoplay=0&rel=0&vq=hd1080';
    }
    if (/stream-proxy\.html/i.test(url) || /vidsrc\.to/i.test(url) || /vsembed\.ru/i.test(url) || /cloudnestra\.com/i.test(url)) {
      return url;
    }
    if (/vidlink\.pro/i.test(url)) {
      if (url.indexOf('autoplay=') === -1) url += (url.indexOf('?') === -1 ? '?' : '&') + 'autoplay=' + (state.autoplay ? 'true' : 'false');
      if (url.indexOf('quality=1080p') === -1) url += '&quality=1080p';
      if (url.indexOf('preferredQuality=1080p') === -1) url += '&preferredQuality=1080p';
      return url;
    }
    return url;
  }

  function adjustSystemVolume(delta, toggleMute) {
    try {
      if (typeof tizen !== 'undefined' && tizen.tvaudiocontrol) {
        if (toggleMute) {
          if (typeof tizen.tvaudiocontrol.setMute === 'function' && typeof tizen.tvaudiocontrol.isMute === 'function') {
            tizen.tvaudiocontrol.setMute(!tizen.tvaudiocontrol.isMute());
            return true;
          }
        }
        if (typeof tizen.tvaudiocontrol.getVolume === 'function' && typeof tizen.tvaudiocontrol.setVolume === 'function') {
          var current = tizen.tvaudiocontrol.getVolume();
          var next = current + delta;
          if (next < 0) next = 0;
          if (next > 100) next = 100;
          tizen.tvaudiocontrol.setVolume(next);
          return true;
        }
      }
    } catch (_error) {}
    return false;
  }

  function closePlayerOverlay() {
    var player = $('.player-overlay');
    PLAYER_EMBED_PLAYING = false;
    if (player && player.parentNode) {
      removeNodeAnimated(player, 'overlay-exit', 180);
    }
    setTimeout(function() {
      if (LAST_PLAYER_FOCUS && isVisible(LAST_PLAYER_FOCUS)) safeFocus(LAST_PLAYER_FOCUS);
      else focusFirst('.btn-play');
    }, 50);
  }

  function keepPlayerCloseButtonVisible() {
    var closeBtn = $('.player-close');
    if (!closeBtn) return;
    closeBtn.className = closeBtn.className.replace(/\splayer-close-hidden\b/g, '');
    if (PLAYER_CLOSE_TIMER) clearTimeout(PLAYER_CLOSE_TIMER);
  }

  function hidePlayerCloseButtonSoon() {
    if (PLAYER_CLOSE_TIMER) clearTimeout(PLAYER_CLOSE_TIMER);
    PLAYER_CLOSE_TIMER = setTimeout(function() {
      var current = $('.player-close');
      if (!current) return;
      if ((' ' + current.className + ' ').indexOf(' player-close-hidden ') === -1) current.className += ' player-close-hidden';
    }, 2000);
  }

  function showPlayerCloseButton() {
    keepPlayerCloseButtonVisible();
    hidePlayerCloseButtonSoon();
  }

  function sendEmbeddedPlayerCommand(action) {
    var frame = $('.player-overlay iframe');
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ type: 'PLAYER_CONTROL', action: action }, '*');
    } catch (_error) {}
  }

  function handleModalNavigation(event, modal) {
    var input = modal.querySelector('.modal-input');
    var doneBtn = modal.querySelector('.btn-play');
    var cancelBtn = modal.querySelector('.btn-secondary');
    var focused = document.activeElement;
    if (!(isLeft(event) || isRight(event) || isUp(event) || isDown(event) || isBack(event))) return;
    stopEvent(event);
    if (isBack(event)) {
      removeNodeAnimated(modal, 'overlay-exit', 180);
      setTimeout(function() { focusFirst('.settings-row'); }, 50);
      return false;
    }
    if (focused === input) {
      if (isDown(event)) safeFocus(doneBtn || cancelBtn);
      return false;
    }
    if (focused === doneBtn) {
      if (isRight(event)) safeFocus(cancelBtn);
      else if (isUp(event)) safeFocus(input);
      return false;
    }
    if (focused === cancelBtn) {
      if (isLeft(event)) safeFocus(doneBtn);
      else if (isUp(event)) safeFocus(input);
      return false;
    }
    safeFocus(input || doneBtn || cancelBtn);
    return false;
  }

  function handleAppNavigation(event) {
    var detail = $('.detail-overlay');
    var browse = $('.browse-overlay');
    var player = $('.player-overlay');
    var modal = $('.modal-overlay');
    var active = document.activeElement;

    if (player) showPlayerCloseButton();

    if (modal && handleModalNavigation(event, modal) === false) return false;
    if (!player && !modal && detail && handleDetailOverlayNavigation(event, detail) === false) return false;

    if (browse && (isLeft(event) || isRight(event) || isUp(event) || isDown(event) || isBack(event))) {
      stopEvent(event);
      if (isBack(event)) {
        removeNodeAnimated(browse, 'overlay-exit', 220);
        setTimeout(function() { focusFirst('.section-more'); }, 50);
        return false;
      }
      if (isLeft(event)) moveFocus('left');
      else if (isRight(event)) moveFocus('right');
      else if (isUp(event)) moveFocus('up');
      else if (isDown(event)) moveFocus('down');
      return false;
    }

    if (player && (isLeft(event) || isRight(event) || isUp(event) || isDown(event) || isBack(event))) {
      stopEvent(event);
      if (isBack(event)) {
        closePlayerOverlay();
        return false;
      }
      if (isLeft(event)) moveFocus('left');
      else if (isRight(event)) moveFocus('right');
      else if (isUp(event)) moveFocus('up');
      else if (isDown(event)) moveFocus('down');
      return false;
    }

    if (isLeft(event) || isRight(event) || isUp(event) || isDown(event)) {
      if (isTextEditingElement(active)) {
        if (active === searchInput && isDown(event)) {
          stopEvent(event);
          moveFocus('down');
          return false;
        }
        if (active !== searchInput) return;
      }
      stopEvent(event);
      if (isLeft(event)) moveFocus('left');
      else if (isRight(event)) moveFocus('right');
      else if (isUp(event)) moveFocus('up');
      else if (isDown(event)) moveFocus('down');
      return false;
    }

    if (isBack(event)) {
      stopEvent(event);
      if (state.currentTab !== 'home') {
        state.currentTab = 'home';
        renderContent();
        return false;
      }
      try {
        if (typeof tizen !== 'undefined' && tizen.application) tizen.application.getCurrentApplication().exit();
      } catch (_error) {}
      return false;
    }
  }

  function getVisibleList(selector, root) {
    var nodes = root.querySelectorAll(selector);
    var list = [];
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (isVisible(nodes[i])) list.push(nodes[i]);
    }
    return list;
  }

  function getListIndex(list, element) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] === element) return i;
    }
    return -1;
  }

  function focusListItem(list, index) {
    if (!list.length) return false;
    if (index < 0) index = 0;
    if (index >= list.length) index = list.length - 1;
    safeFocus(list[index]);
    smoothScrollIntoView(list[index]);
    return true;
  }

  function handleDetailOverlayNavigation(event, detail) {
    var focused = document.activeElement;
    var back = detail.querySelector('.back-btn');
    var actions = getVisibleList('.detail-actions button', detail);
    var seasons = getVisibleList('.season-btn', detail);
    var episodes = getVisibleList('.episode-item', detail);
    var similar = getVisibleList('.similar-item', detail);
    var actionIndex = getListIndex(actions, focused);
    var seasonIndex = getListIndex(seasons, focused);
    var episodeIndex = getListIndex(episodes, focused);
    var similarIndex = getListIndex(similar, focused);

    if (!(isLeft(event) || isRight(event) || isUp(event) || isDown(event) || isBack(event))) return;
    if (event.preventDefault) event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();

    if (isBack(event)) {
      closeDetailToHome();
      return false;
    }

    if (focused === back) {
      if (isRight(event) || isDown(event)) {
        if (!focusListItem(actions, 0)) {
          if (!focusListItem(seasons, 0)) {
            if (!focusListItem(episodes, 0)) focusListItem(similar, 0);
          }
        }
      }
      return false;
    }

    if (actionIndex > -1) {
      if (isLeft(event)) {
        if (actionIndex > 0) focusListItem(actions, actionIndex - 1);
        else safeFocus(back);
      } else if (isRight(event)) {
        focusListItem(actions, actionIndex + 1);
      } else if (isDown(event)) {
        if (!focusListItem(seasons, 0)) {
          if (!focusListItem(episodes, 0)) focusListItem(similar, 0);
        }
      } else if (isUp(event)) {
        safeFocus(back);
      }
      return false;
    }

    if (seasonIndex > -1) {
      if (isLeft(event)) focusListItem(seasons, seasonIndex - 1);
      else if (isRight(event)) focusListItem(seasons, seasonIndex + 1);
      else if (isDown(event)) {
        if (!focusListItem(episodes, 0)) focusListItem(similar, 0);
      } else if (isUp(event)) {
        if (!focusListItem(actions, 0)) safeFocus(back);
      }
      return false;
    }

    if (episodeIndex > -1) {
      if (isLeft(event) || isUp(event)) {
        if (episodeIndex > 0) focusListItem(episodes, episodeIndex - 1);
        else if (!focusListItem(seasons, 0)) {
          if (!focusListItem(actions, 0)) safeFocus(back);
        }
      } else if (isRight(event) || isDown(event)) {
        if (episodeIndex < episodes.length - 1) focusListItem(episodes, episodeIndex + 1);
        else focusListItem(similar, 0);
      }
      return false;
    }

    if (similarIndex > -1) {
      if (isLeft(event)) focusListItem(similar, similarIndex - 1);
      else if (isRight(event)) focusListItem(similar, similarIndex + 1);
      else if (isUp(event)) {
        if (episodes.length) focusListItem(episodes, episodes.length - 1);
        else if (seasons.length) focusListItem(seasons, 0);
        else if (actions.length) focusListItem(actions, actions.length - 1);
        else safeFocus(back);
      }
      return false;
    }

    if (actions.length) focusListItem(actions, 0);
    else if (seasons.length) focusListItem(seasons, 0);
    else if (episodes.length) focusListItem(episodes, 0);
    else if (similar.length) focusListItem(similar, 0);
    else safeFocus(back);
    return false;
  }

  function isDirectMedia(url) {
    return /\.(m3u8|mp4|webm|mov)(\?|$)/i.test(url);
  }

  function playContent(data, mediaType) {
    openPlayer(getStreamUrl(mediaType, data.id, 1, 1), getTitle(data));
  }

  function playEpisode(tvId, season, episode) {
    openPlayer(getStreamUrl('tv', tvId, season, episode), 'Episode ' + episode);
  }

  function playStream(url) {
    openPlayer(buildNativeDirectPlayerUrl(ensureAutoplayQualityUrl(url)), 'Live TV');
  }

  function playTrailer(videoId) {
    openPlayer('https://www.youtube.com/embed/' + videoId + '?autoplay=' + (state.autoplay ? '1' : '0') + '&rel=0&vq=hd1080', 'Trailer', true);
  }

  function isLocalPlayerUrl(url) {
    return /stream-proxy\.html/i.test(url);
  }

  function openPlayer(url, title, isDirectFrame) {
    var overlay = createEl('div');
    var closeBtn = createEl('button');
    LAST_PLAYER_FOCUS = document.activeElement;
    PLAYER_EMBED_PLAYING = !!state.autoplay;
    url = ensureAutoplayQualityUrl(url);
    overlay.className = 'player-overlay';
    closeBtn.className = 'player-close';
    closeBtn.textContent = 'Back';
    closeBtn.tabIndex = 0;
    closeBtn.setAttribute('data-default-focus', 'true');
    closeBtn.onclick = function() { closePlayerOverlay(); };
    closeBtn.onkeydown = function(event) { if (isEnter(event)) this.click(); };
    overlay.appendChild(closeBtn);

    if (isDirectMedia(url)) {
      var video = createEl('video');
      video.controls = true;
      video.autoplay = state.autoplay;
      video.setAttribute('playsinline', 'playsinline');
      video.src = url;
      video.style.cssText = 'width:100%;height:100%;background:#000;';
      video.onplay = function() { PLAYER_EMBED_PLAYING = true; hidePlayerCloseButtonSoon(); };
      video.onpause = function() { PLAYER_EMBED_PLAYING = false; keepPlayerCloseButtonVisible(); };
      video.onended = function() { PLAYER_EMBED_PLAYING = false; keepPlayerCloseButtonVisible(); };
      overlay.appendChild(video);
      if (state.autoplay) {
        setTimeout(function() {
          try { video.play(); } catch (_error) {}
        }, 50);
      }
    } else {
      var frame = createEl('iframe');
      frame.style.cssText = 'width:100%;height:100%;border:none;position:absolute;top:0;left:0;';
      frame.setAttribute('allowfullscreen', 'true');
      frame.setAttribute('tabindex', '-1');
      frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
      frame.src = (isDirectFrame || isLocalPlayerUrl(url)) ? url : ('jw-proxy.html?src=' + encodeURIComponent(url));
      overlay.appendChild(frame);
    }
    document.body.appendChild(overlay);
    setTimeout(function() { try { closeBtn.focus(); } catch (error) {} }, 50);
    showPlayerCloseButton();
  }

  document.onkeydown = function(event) {
    var detail = $('.detail-overlay');
    var player = $('.player-overlay');
    var modal = $('.modal-overlay');
    var video = $('.player-overlay video');
    if (player) showPlayerCloseButton();
    if (isBack(event)) {
      if (detail) { closeDetailToHome(); event.preventDefault(); return; }
      if (player) { closePlayerOverlay(); event.preventDefault(); return; }
      if (modal) { removeNodeAnimated(modal, 'overlay-exit', 180); event.preventDefault(); return; }
      if (state.currentTab !== 'home') {
        state.currentTab = 'home';
        renderContent();
        event.preventDefault();
        return;
      }
      try {
        if (typeof tizen !== 'undefined' && tizen.application) tizen.application.getCurrentApplication().exit();
      } catch (_error) {}
    }
    if (video && isPlayKey(event)) {
      event.preventDefault();
      if (video.paused) {
        try { video.play(); } catch (_error2) {}
      } else {
        try { video.pause(); } catch (_error3) {}
      }
      return;
    }
    if (video && isPauseKey(event)) {
      event.preventDefault();
      try { video.pause(); } catch (_error4) {}
      return;
    }
    if (player && !video && isPlayKey(event)) {
      event.preventDefault();
      if (PLAYER_EMBED_PLAYING) {
        sendEmbeddedPlayerCommand('pause');
        PLAYER_EMBED_PLAYING = false;
        keepPlayerCloseButtonVisible();
      } else {
        sendEmbeddedPlayerCommand('play');
        PLAYER_EMBED_PLAYING = true;
        hidePlayerCloseButtonSoon();
      }
      return;
    }
    if (player && !video && isPauseKey(event)) {
      event.preventDefault();
      sendEmbeddedPlayerCommand('pause');
      PLAYER_EMBED_PLAYING = false;
      keepPlayerCloseButtonVisible();
      return;
    }
    if (player && !video && isStopKey(event)) {
      event.preventDefault();
      sendEmbeddedPlayerCommand('pause');
      PLAYER_EMBED_PLAYING = false;
      keepPlayerCloseButtonVisible();
      return;
    }
    if (player && (isPauseKey(event) || isStopKey(event))) {
      keepPlayerCloseButtonVisible();
    } else if (player && isPlayKey(event)) {
      hidePlayerCloseButtonSoon();
    }
    if (video && (event.keyCode === 447 || event.keyCode === 448 || event.keyCode === 449)) {
      event.preventDefault();
      if (event.keyCode === 447) {
        if (!adjustSystemVolume(5, false)) video.volume = Math.min(1, (video.volume || 1) + 0.1);
      }
      else if (event.keyCode === 448) {
        if (!adjustSystemVolume(-5, false)) video.volume = Math.max(0, (video.volume || 1) - 0.1);
      }
      else if (event.keyCode === 449) {
        if (!adjustSystemVolume(0, true)) video.muted = !video.muted;
      }
    } else if (player && !video && (event.keyCode === 447 || event.keyCode === 448 || event.keyCode === 449)) {
      if (event.keyCode === 447) { if (adjustSystemVolume(5, false)) event.preventDefault(); }
      else if (event.keyCode === 448) { if (adjustSystemVolume(-5, false)) event.preventDefault(); }
      else if (event.keyCode === 449) { if (adjustSystemVolume(0, true)) event.preventDefault(); }
    }
  };

  window.addEventListener('message', function(event) {
    var payload = event && event.data;
    if (!payload) return;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_error) { return; }
    }
    if (!payload || !payload.data || !payload.data.event) return;
    if (payload.data.event === 'play') {
      PLAYER_EMBED_PLAYING = true;
      hidePlayerCloseButtonSoon();
    } else if (payload.data.event === 'pause' || payload.data.event === 'ended') {
      PLAYER_EMBED_PLAYING = false;
      keepPlayerCloseButtonVisible();
    }
  });

  try {
    if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
      var keys = ['MediaPlay', 'MediaPause', 'MediaStop', 'ChannelUp', 'ChannelDown', 'VolumeUp', 'VolumeDown', 'VolumeMute'];
      if (tizen.tvinputdevice.registerKeyBatch) {
        try { tizen.tvinputdevice.registerKeyBatch(keys); } catch (_error) {}
      } else {
        var k;
        for (k = 0; k < keys.length; k++) {
          try { tizen.tvinputdevice.registerKey(keys[k]); } catch (error) {}
        }
      }
    }
  } catch (error) {}

  buildNav();
  searchDiv.appendChild(searchInput);
  main.appendChild(searchDiv);
  main.appendChild(content);
  app.appendChild(nav);
  app.appendChild(main);
  body.appendChild(app);
  window.addEventListener('keydown', handleAppNavigation, true);

  if (state.m3uSources.length) {
    loadM3USources();
  }

  renderContent();
  setTimeout(function() { hideBootSplash(); }, 5000);
  setTimeout(function() { focusFirst('.nav-item'); }, 120);
})();
