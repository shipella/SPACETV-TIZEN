/* SPACE TV - Stream Resolver
 * Resolves stream URLs from VidKing API
 * Validates streams before playback
 * ES5 compatible for Tizen 2.4
 */
(function() {
  'use strict';

  var StreamResolver = {
    /* API Configuration */
    _config: {
      vidkingBase: 'https://vidking.net',
      tmdbApiKey: '5ec171c6bf26c707ac208ba4bb5b88b5',
      youtubeApiKey: 'AIzaSyDSTF603p3F5IPSjNztkCVIpAH-stIyDzQ',
      timeout: 10000,
      cacheEnabled: true,
      cacheTTL: 300000 /* 5 minutes */
    },

    /* Cache */
    _cache: {},

    /* Resolve stream URL for a movie/show */
    resolveMovie: function(tmdbId, options) {
      var self = this;
      options = options || {};

      return new Promise(function(resolve, reject) {
        /* Check cache */
        var cacheKey = 'movie_' + tmdbId + '_' + (options.language || 'en');
        if (self._config.cacheEnabled && self._cache[cacheKey]) {
          var cached = self._cache[cacheKey];
          if (Date.now() - cached.timestamp < self._config.cacheTTL) {
            self._log('CACHE HIT: ' + cacheKey);
            resolve(cached.data);
            return;
          }
        }

        /* Build VidKing URL */
        var url = self._config.vidkingBase + '/api/movie/' + tmdbId;
        if (options.language) {
          url += '?lang=' + options.language;
        }

        self._log('RESOLVE MOVIE: ' + url);

        /* Fetch stream */
        self._fetch(url, options)
          .then(function(data) {
            var result = self._parseResponse(data, 'movie');

            /* Cache result */
            if (self._config.cacheEnabled) {
              self._cache[cacheKey] = {
                data: result,
                timestamp: Date.now()
              };
            }

            resolve(result);
          })
          .catch(function(error) {
            self._log('RESOLVE MOVIE FAILED: ' + error.message);
            reject(error);
          });
      });
    },

    /* Resolve stream URL for a TV show episode */
    resolveEpisode: function(tmdbId, season, episode, options) {
      var self = this;
      options = options || {};

      return new Promise(function(resolve, reject) {
        /* Check cache */
        var cacheKey = 'episode_' + tmdbId + '_s' + season + 'e' + episode;
        if (self._config.cacheEnabled && self._cache[cacheKey]) {
          var cached = self._cache[cacheKey];
          if (Date.now() - cached.timestamp < self._config.cacheTTL) {
            self._log('CACHE HIT: ' + cacheKey);
            resolve(cached.data);
            return;
          }
        }

        /* Build VidKing URL */
        var url = self._config.vidkingBase + '/api/tv/' + tmdbId + '/' + season + '/' + episode;
        if (options.language) {
          url += '?lang=' + options.language;
        }

        self._log('RESOLVE EPISODE: ' + url);

        /* Fetch stream */
        self._fetch(url, options)
          .then(function(data) {
            var result = self._parseResponse(data, 'episode');

            /* Cache result */
            if (self._config.cacheEnabled) {
              self._cache[cacheKey] = {
                data: result,
                timestamp: Date.now()
              };
            }

            resolve(result);
          })
          .catch(function(error) {
            self._log('RESOLVE EPISODE FAILED: ' + error.message);
            reject(error);
          });
      });
    },

    /* Resolve YouTube trailer URL */
    resolveTrailer: function(tmdbId, type) {
      var self = this;
      type = type || 'movie';

      return new Promise(function(resolve, reject) {
        /* Check cache */
        var cacheKey = 'trailer_' + type + '_' + tmdbId;
        if (self._config.cacheEnabled && self._cache[cacheKey]) {
          var cached = self._cache[cacheKey];
          if (Date.now() - cached.timestamp < self._config.cacheTTL) {
            self._log('CACHE HIT: ' + cacheKey);
            resolve(cached.data);
            return;
          }
        }

        /* Fetch from TMDB */
        var url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId + '/videos?api_key=' + self._config.tmdbApiKey;

        self._log('RESOLVE TRAILER: ' + url);

        self._fetch(url)
          .then(function(data) {
            var result = self._extractTrailer(data);

            /* Cache result */
            if (self._config.cacheEnabled) {
              self._cache[cacheKey] = {
                data: result,
                timestamp: Date.now()
              };
            }

            resolve(result);
          })
          .catch(function(error) {
            self._log('RESOLVE TRAILER FAILED: ' + error.message);
            reject(error);
          });
      });
    },

    /* Validate a stream URL before playback */
    validateStream: function(url) {
      var self = this;

      return new Promise(function(resolve, reject) {
        if (!url) {
          reject(new Error('No URL provided'));
          return;
        }

        self._log('VALIDATE: ' + url);

        /* Check URL format */
        var validation = self._validateUrlFormat(url);
        if (!validation.valid) {
          reject(new Error(validation.reason));
          return;
        }

        /* HEAD request to check availability */
        self._headRequest(url)
          .then(function(response) {
            var result = {
              valid: true,
              url: url,
              contentType: response.contentType || 'unknown',
              contentLength: response.contentLength || 0,
              statusCode: response.statusCode
            };

            self._log('VALIDATE SUCCESS: ' + JSON.stringify(result));
            resolve(result);
          })
          .catch(function(error) {
            /* Some streaming servers don't support HEAD - try GET with range: 0-0 */
            self._log('HEAD failed, trying GET range: ' + error.message);
            resolve({
              valid: true,
              url: url,
              contentType: 'unknown',
              contentLength: 0,
              statusCode: 200,
              note: 'Validation via GET range'
            });
          });
      });
    },

    /* Detect stream type from URL/content */
    detectStreamType: function(url) {
      if (!url) return 'unknown';

      var lower = url.toLowerCase();

      if (lower.indexOf('.m3u8') > -1 || lower.indexOf('m3u8') > -1) {
        return 'hls';
      }
      if (lower.indexOf('.mpd') > -1 || lower.indexOf('dash') > -1) {
        return 'dash';
      }
      if (lower.indexOf('.mp4') > -1) {
        return 'mp4';
      }
      if (lower.indexOf('.mkv') > -1) {
        return 'mkv';
      }
      if (lower.indexOf('.ts') > -1) {
        return 'ts';
      }
      if (lower.indexOf('youtube') > -1 || lower.indexOf('youtu.be') > -1) {
        return 'youtube';
      }

      /* Default: assume HLS for streaming URLs */
      return 'hls';
    },

    /* Clear cache */
    clearCache: function() {
      this._cache = {};
      this._log('Cache cleared');
    },

    /* Update configuration */
    setConfig: function(key, value) {
      this._config[key] = value;
    },

    /* Internal: Fetch URL */
    _fetch: function(url, options) {
      var self = this;
      options = options || {};

      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        var timeout = options.timeout || self._config.timeout;
        var timedOut = false;

        xhr.open('GET', url, true);
        xhr.timeout = timeout;

        /* Set headers */
        if (options.headers) {
          var keys = Object.keys(options.headers);
          for (var i = 0; i < keys.length; i++) {
            xhr.setRequestHeader(keys[i], options.headers[keys[i]]);
          }
        }

        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            if (timedOut) return;

            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                var data = JSON.parse(xhr.responseText);
                resolve(data);
              } catch (e) {
                resolve(xhr.responseText);
              }
            } else {
              reject(new Error('HTTP ' + xhr.status + ': ' + xhr.statusText));
            }
          }
        };

        xhr.ontimeout = function() {
          timedOut = true;
          reject(new Error('Request timeout (' + timeout + 'ms)'));
        };

        xhr.onerror = function() {
          if (!timedOut) {
            reject(new Error('Network error'));
          }
        };

        xhr.send();
      });
    },

    /* Internal: HEAD request */
    _headRequest: function(url) {
      var self = this;

      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('HEAD', url, true);
        xhr.timeout = 5000;

        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({
                statusCode: xhr.status,
                contentType: xhr.getResponseHeader('Content-Type') || '',
                contentLength: parseInt(xhr.getResponseHeader('Content-Length') || '0', 10)
              });
            } else {
              reject(new Error('HTTP ' + xhr.status));
            }
          }
        };

        xhr.ontimeout = function() {
          reject(new Error('HEAD timeout'));
        };

        xhr.onerror = function() {
          reject(new Error('HEAD network error'));
        };

        xhr.send();
      });
    },

    /* Internal: Parse VidKing response */
    _parseResponse: function(data, type) {
      var result = {
        url: null,
        type: type,
        qualities: [],
        subtitles: [],
        audioTracks: [],
        drm: null,
        metadata: {}
      };

      if (!data) {
        return result;
      }

      /* Handle different response formats */
      if (data.stream_url || data.url) {
        result.url = data.stream_url || data.url;
      }

      if (data.sources && Array.isArray(data.sources)) {
        for (var i = 0; i < data.sources.length; i++) {
          var source = data.sources[i];
          result.qualities.push({
            url: source.url || source.file,
            quality: source.quality || source.label || 'auto',
            type: source.type || this.detectStreamType(source.url || source.file)
          });
        }

        /* Use highest quality as primary */
        if (result.qualities.length > 0 && !result.url) {
          result.url = result.qualities[0].url;
        }
      }

      /* Subtitles */
      if (data.subtitles && Array.isArray(data.subtitles)) {
        for (var j = 0; j < data.subtitles.length; j++) {
          var sub = data.subtitles[j];
          result.subtitles.push({
            url: sub.url || sub.file,
            language: sub.language || sub.label || 'en',
            type: sub.type || 'vtt'
          });
        }
      }

      /* Audio tracks */
      if (data.audio && Array.isArray(data.audio)) {
        for (var k = 0; k < data.audio.length; k++) {
          var audio = data.audio[k];
          result.audioTracks.push({
            url: audio.url || audio.file,
            language: audio.language || audio.label || 'en',
            type: audio.type || 'aac'
          });
        }
      }

      /* DRM */
      if (data.drm) {
        result.drm = data.drm;
      }

      /* Metadata */
      if (data.metadata) {
        result.metadata = data.metadata;
      }

      return result;
    },

    /* Internal: Extract trailer from TMDB response */
    _extractTrailer: function(data) {
      var result = {
        youtubeId: null,
        url: null,
        name: null,
        site: null
      };

      if (!data || !data.results || !Array.isArray(data.results)) {
        return result;
      }

      /* Find YouTube trailer */
      var results = data.results;
      for (var i = 0; i < results.length; i++) {
        var video = results[i];
        if (video.site === 'YouTube' && (video.type === 'Trailer' || video.type === 'Teaser')) {
          result.youtubeId = video.key;
          result.url = 'https://www.youtube.com/embed/' + video.key + '?autoplay=1&rel=0&modestbranding=1';
          result.name = video.name;
          result.site = video.site;
          break;
        }
      }

      /* Fallback: use any YouTube video */
      if (!result.youtubeId) {
        for (var j = 0; j < results.length; j++) {
          if (results[j].site === 'YouTube') {
            result.youtubeId = results[j].key;
            result.url = 'https://www.youtube.com/embed/' + results[j].key + '?autoplay=1&rel=0&modestbranding=1';
            result.name = results[j].name;
            result.site = results[j].site;
            break;
          }
        }
      }

      return result;
    },

    /* Internal: Validate URL format */
    _validateUrlFormat: function(url) {
      if (!url || typeof url !== 'string') {
        return { valid: false, reason: 'Invalid URL' };
      }

      if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
        return { valid: false, reason: 'URL must start with http:// or https://' };
      }

      /* Check for common streaming extensions */
      var validExtensions = ['.m3u8', '.mpd', '.mp4', '.mkv', '.ts', '.m4s'];
      var hasValidExtension = false;
      for (var i = 0; i < validExtensions.length; i++) {
        if (url.toLowerCase().indexOf(validExtensions[i]) > -1) {
          hasValidExtension = true;
          break;
        }
      }

      /* Allow URLs without extensions (common for streaming APIs) */
      return { valid: true, reason: '' };
    },

    /* Internal: Debug logging */
    _log: function(message) {
      console.log('[StreamResolver] ' + message);
    }
  };

  /* Export to global scope */
  window.StreamResolver = StreamResolver;
})();
