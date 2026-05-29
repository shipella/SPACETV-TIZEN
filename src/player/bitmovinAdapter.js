/* SPACE TV - Bitmovin Fallback Adapter
 * Bitmovin Player wrapper for DRM/unsupported streams
 * Used as fallback when AVPlay fails
 */
(function() {
  'use strict';

  var BitmovinAdapter = {
    _player: null,
    _container: null,
    _state: 'idle',
    _currentUrl: '',
    _listeners: {},
    _retryCount: 0,
    _maxRetries: 1,
    _debugEnabled: false,
    _isReady: false,

    /* Initialize Bitmovin player */
    init: function() {
      if (typeof bitmovin === 'undefined' || !bitmovin.player) {
        this._log('ERROR: Bitmovin not loaded');
        return false;
      }
      this._log('Bitmovin initialized');
      return true;
    },

    /* Check if Bitmovin is available */
    isAvailable: function() {
      return typeof bitmovin !== 'undefined' && !!bitmovin.player;
    },

    /* Open a stream URL */
    open: function(url, options) {
      var self = this;
      options = options || {};

      if (!this.isAvailable()) {
        this._log('ERROR: Bitmovin not available');
        this._notify('error', { code: 'NOT_AVAILABLE', message: 'Bitmovin player not loaded' });
        return false;
      }

      this._log('OPEN: ' + url);
      this._currentUrl = url;
      this._state = 'opening';
      this._retryCount = 0;
      this._isReady = false;

      /* Create or reuse container */
      this._ensureContainer(options.containerId || 'bitmovin-player');

      /* Build config */
      var config = this._buildConfig(url, options);

      /* Create player instance */
      try {
        if (this._player) {
          this._player.destroy();
        }

        this._player = new bitmovin.player.Player(this._container, config);

        /* Setup event listeners */
        this._setupListeners();

        /* Load source */
        this._player.load(config.source).then(
          function() {
            self._log('LOAD: success');
            self._isReady = true;
            self._state = 'ready';
            self._notify('prepared');

            if (options.autoplay) {
              self.play();
            }
          },
          function(error) {
            self._log('LOAD: failed - ' + (error.message || 'unknown'));
            self._handleError('LOAD_FAILED');
          }
        );

        return true;
      } catch (e) {
        this._log('OPEN: exception - ' + e.message);
        this._notify('error', { code: 'OPEN_FAILED', message: e.message });
        return false;
      }
    },

    /* Start playback */
    play: function() {
      if (!this._player) return false;
      try {
        return this._player.play().then(
          function() {
            this._state = 'playing';
            this._notify('play');
            return true;
          }.bind(this),
          function(error) {
            this._log('PLAY: failed - ' + error.message);
            return false;
          }.bind(this)
        );
      } catch (e) {
        this._log('PLAY: exception - ' + e.message);
        return false;
      }
    },

    /* Pause playback */
    pause: function() {
      if (!this._player) return false;
      try {
        this._player.pause();
        this._state = 'paused';
        this._notify('pause');
        return true;
      } catch (e) {
        this._log('PAUSE: exception - ' + e.message);
        return false;
      }
    },

    /* Stop playback */
    stop: function() {
      if (!this._player) return false;
      try {
        this._player.stop();
        this._state = 'stopped';
        this._notify('stop');
        return true;
      } catch (e) {
        this._log('STOP: exception - ' + e.message);
        return false;
      }
    },

    /* Close and release resources */
    close: function() {
      if (!this._player) return;
      try {
        this._player.destroy();
        this._player = null;
        this._state = 'closed';
        this._log('CLOSE');
        this._notify('close');
      } catch (e) {
        this._log('CLOSE: exception - ' + e.message);
      }
    },

    /* Seek to position (milliseconds) */
    seek: function(positionMs) {
      if (!this._player || !this._isReady) return false;
      try {
        this._player.seek(positionMs / 1000); /* Bitmovin uses seconds */
        this._log('SEEK: ' + positionMs + 'ms');
        this._notify('seek', { position: positionMs });
        return true;
      } catch (e) {
        this._log('SEEK: exception - ' + e.message);
        return false;
      }
    },

    /* Jump forward (milliseconds) */
    jumpForward: function(ms) {
      var current = this.getCurrentTime();
      return this.seek(current + ms);
    },

    /* Jump backward (milliseconds) */
    jumpBackward: function(ms) {
      var current = this.getCurrentTime();
      return this.seek(Math.max(0, current - ms));
    },

    /* Get current playback position (milliseconds) */
    getCurrentTime: function() {
      if (!this._player || !this._isReady) return 0;
      try {
        return this._player.getCurrentTime() * 1000; /* Convert to ms */
      } catch (e) {
        return 0;
      }
    },

    /* Get total duration (milliseconds) */
    getDuration: function() {
      if (!this._player || !this._isReady) return 0;
      try {
        return this._player.getDuration() * 1000; /* Convert to ms */
      } catch (e) {
        return 0;
      }
    },

    /* Get playback state */
    getState: function() {
      return this._state;
    },

    /* Check if currently playing */
    isPlaying: function() {
      return this._state === 'playing';
    },

    /* Check if currently paused */
    isPaused: function() {
      return this._state === 'paused';
    },

    /* Check if currently buffering */
    isBuffering: function() {
      return this._state === 'buffering';
    },

    /* Set playback speed */
    setPlaybackSpeed: function(speed) {
      if (!this._player || !this._isReady) return false;
      try {
        this._player.setPlaybackSpeed(speed);
        return true;
      } catch (e) {
        return false;
      }
    },

    /* Set volume (0-100) */
    setVolume: function(volume) {
      if (!this._player) return false;
      try {
        this._player.setVolume(volume * 100); /* Bitmovin uses 0-100 */
        return true;
      } catch (e) {
        return false;
      }
    },

    /* Get volume (0-1) */
    getVolume: function() {
      if (!this._player) return 1;
      try {
        return this._player.getVolume() / 100;
      } catch (e) {
        return 1;
      }
    },

    /* Mute/unmute */
    setMute: function(muted) {
      if (!this._player) return false;
      try {
        this._player.mute(muted);
        return true;
      } catch (e) {
        return false;
      }
    },

    /* Register event listener */
    on: function(event, callback) {
      if (!this._listeners[event]) {
        this._listeners[event] = [];
      }
      this._listeners[event].push(callback);
    },

    /* Remove event listener */
    off: function(event, callback) {
      if (!this._listeners[event]) return;
      if (!callback) {
        this._listeners[event] = [];
        return;
      }
      var idx = this._listeners[event].indexOf(callback);
      if (idx > -1) {
        this._listeners[event].splice(idx, 1);
      }
    },

    /* Enable/disable debug logging */
    setDebug: function(enabled) {
      this._debugEnabled = enabled;
    },

    /* Internal: Ensure container element exists */
    _ensureContainer: function(id) {
      this._container = document.getElementById(id);
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.id = id;
        this._container.style.width = '100%';
        this._container.style.height = '100%';
        this._container.style.position = 'absolute';
        this._container.style.top = '0';
        this._container.style.left = '0';
        document.body.appendChild(this._container);
      }
    },

    /* Internal: Build player config */
    _buildConfig: function(url, options) {
      var source = {
        title: options.title || 'SPACE TV',
        dash: url.indexOf('.mpd') > -1 ? url : undefined,
        hls: url.indexOf('.m3u8') > -1 ? url : undefined,
        progressive: (url.indexOf('.mp4') > -1 || url.indexOf('.mkv') > -1) ? url : undefined
      };

      /* Fallback: treat as HLS if no extension detected */
      if (!source.dash && !source.hls && !source.progressive) {
        source.hls = url;
      }

      /* DRM configuration */
      if (options.drm) {
        if (options.drm.widevine) {
          source.drm = source.drm || {};
          source.drm.widevine = {
            LA_URL: options.drm.widevine.licenseUrl,
            headers: options.drm.widevine.headers || {}
          };
        }
        if (options.drm.playready) {
          source.drm = source.drm || {};
          source.drm.ms = {
            LA_URL: options.drm.playready.licenseUrl
          };
        }
      }

      var config = {
        key: options.licenseKey || 'YOUR_BITMOVIN_KEY',
        source: source,
        playback: {
          autoplay: options.autoplay || false,
          muted: options.muted || false
        },
        style: {
          width: '100%',
          height: '100%'
        },
        events: {},
        tweaks: {
          file_protocol: options.allowFileProtocol || false,
          app_id: 'SPACE_TV_TIZEN'
        }
      };

      /* Tizen-specific tweaks */
      if (options.tizen) {
        config.tizen = options.tizen;
      }

      return config;
    },

    /* Internal: Setup event listeners */
    _setupListeners: function() {
      var self = this;

      if (!this._player) return;

      this._player.on(bitmovin.player.PlayerEvent.Ready, function() {
        self._log('READY');
        self._state = 'ready';
        self._notify('prepared');
      });

      this._player.on(bitmovin.player.PlayerEvent.Play, function() {
        self._log('PLAY');
        self._state = 'playing';
        self._notify('play');
      });

      this._player.on(bitmovin.player.PlayerEvent.Paused, function() {
        self._log('PAUSE');
        self._state = 'paused';
        self._notify('pause');
      });

      this._player.on(bitmovin.player.PlayerEvent.PlaybackFinished, function() {
        self._log('ENDED');
        self._state = 'completed';
        self._notify('ended');
      });

      this._player.on(bitmovin.player.PlayerEvent.StallStarted, function() {
        self._log('BUFFERING: start');
        self._state = 'buffering';
        self._notify('bufferingstart');
      });

      this._player.on(bitmovin.player.PlayerEvent.StallEnded, function() {
        self._log('BUFFERING: end');
        self._state = 'playing';
        self._notify('bufferingcomplete');
      });

      this._player.on(bitmovin.player.PlayerEvent.Error, function(data) {
        self._log('ERROR: ' + (data.message || 'unknown'));
        self._handleError('PLAYER_ERROR');
      });

      this._player.on(bitmovin.player.PlayerEvent.TimeChanged, function(data) {
        self._notify('timeupdate', {
          current: data.time * 1000,
          duration: self.getDuration()
        });
      });
    },

    /* Internal: Handle errors */
    _handleError: function(errorType) {
      var self = this;
      this._log('HANDLE_ERROR: ' + errorType);

      if (this._retryCount < this._maxRetries && this._currentUrl) {
        this._retryCount++;
        this._log('RETRY: attempt ' + this._retryCount);
        this._notify('retry', { attempt: this._retryCount, max: this._maxRetries });

        setTimeout(function() {
          self.open(self._currentUrl, { autoplay: true });
        }, 1500);
        return;
      }

      this._state = 'error';
      this._notify('error', {
        code: errorType,
        message: 'Bitmovin playback error'
      });
    },

    /* Internal: Notify listeners */
    _notify: function(event, data) {
      var listeners = this._listeners[event] || [];
      for (var i = 0; i < listeners.length; i++) {
        try {
          listeners[i](data || {});
        } catch (e) {
          this._log('LISTENER ERROR: ' + e.message);
        }
      }
    },

    /* Internal: Debug logging */
    _log: function(message) {
      if (this._debugEnabled) {
        console.log('[Bitmovin] ' + message);
      }
    }
  };

  /* Export to global scope */
  window.BitmovinAdapter = BitmovinAdapter;
})();
