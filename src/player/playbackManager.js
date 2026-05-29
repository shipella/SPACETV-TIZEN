/* SPACE TV - Unified Playback Manager
 * Routes playback to AVPlay (primary) or Bitmovin (fallback)
 * Single API for all playback operations
 * ES5 compatible for Tizen 2.4
 */
(function() {
  'use strict';

  var PlaybackManager = {
    _activePlayer: null,
    _playerType: 'none', /* 'avplay', 'bitmovin', 'none' */
    _state: 'idle',
    _currentUrl: '',
    _currentOptions: {},
    _listeners: {},
    _debugEnabled: false,
    _fallbackEnabled: true,
    _avplayFailed: false,
    _sessionStats: {
      plays: 0,
      errors: 0,
      fallbacks: 0,
      totalWatchTime: 0
    },
    _watchStart: 0,

    /* Initialize playback manager */
    init: function(options) {
      options = options || {};
      this._fallbackEnabled = options.fallbackEnabled !== false;
      this._debugEnabled = options.debug || false;

      this._log('Initializing PlaybackManager');

      /* Initialize AVPlay */
      if (window.AVPlayAdapter) {
        window.AVPlayAdapter.setDebug(this._debugEnabled);
        var avplayAvailable = window.AVPlayAdapter.init();
        if (avplayAvailable) {
          this._log('AVPlay available - setting as primary');
        } else {
          this._log('WARNING: AVPlay not available on this device');
        }
      }

      /* Initialize Bitmovin */
      if (window.BitmovinAdapter) {
        window.BitmovinAdapter.setDebug(this._debugEnabled);
        window.BitmovinAdapter.init();
      }

      this._log('PlaybackManager initialized');
      return true;
    },

    /* Play a stream */
    play: function(url, options) {
      var self = this;
      options = options || {};

      this._log('PLAY: ' + url);
      this._currentUrl = url;
      this._currentOptions = options;
      this._state = 'loading';
      this._sessionStats.plays++;
      this._watchStart = Date.now();

      /* Notify loading state */
      this._notify('loading', { url: url, type: options.type || 'auto' });

      /* Determine which player to use */
      var useBitmovin = this._shouldUseBitmovin(url, options);

      if (useBitmovin && window.BitmovinAdapter && window.BitmovinAdapter.isAvailable()) {
        this._log('Using Bitmovin (forced or DRM)');
        this._useBitmovin(url, options);
      } else if (window.AVPlayAdapter && window.AVPlayAdapter.isAvailable()) {
        this._log('Using AVPlay (primary)');
        this._useAVPlay(url, options);
      } else if (window.BitmovinAdapter && window.BitmovinAdapter.isAvailable()) {
        this._log('Fallback to Bitmovin (AVPlay unavailable)');
        this._useBitmovin(url, options);
      } else {
        this._log('ERROR: No player available');
        this._state = 'error';
        this._notify('error', { code: 'NO_PLAYER', message: 'No playback engine available' });
        return false;
      }

      return true;
    },

    /* Stop playback */
    stop: function() {
      this._log('STOP');
      this._trackWatchTime();

      if (this._activePlayer) {
        this._activePlayer.stop();
      }
      this._state = 'stopped';
      this._notify('stop');
    },

    /* Pause playback */
    pause: function() {
      this._log('PAUSE');
      if (this._activePlayer) {
        this._activePlayer.pause();
      }
      this._state = 'paused';
      this._notify('pause');
    },

    /* Resume playback */
    resume: function() {
      this._log('RESUME');
      if (this._activePlayer) {
        this._activePlayer.play();
      }
      this._state = 'playing';
      this._notify('play');
    },

    /* Close and release all resources */
    close: function() {
      this._log('CLOSE');
      this._trackWatchTime();

      if (this._activePlayer) {
        this._activePlayer.close();
        this._activePlayer = null;
      }
      this._playerType = 'none';
      this._state = 'closed';
      this._notify('close');
    },

    /* Seek to position (milliseconds) */
    seek: function(positionMs) {
      this._log('SEEK: ' + positionMs + 'ms');
      if (this._activePlayer) {
        return this._activePlayer.seek(positionMs);
      }
      return false;
    },

    /* Jump forward (milliseconds) */
    jumpForward: function(ms) {
      if (this._activePlayer) {
        return this._activePlayer.jumpForward(ms);
      }
      return false;
    },

    /* Jump backward (milliseconds) */
    jumpBackward: function(ms) {
      if (this._activePlayer) {
        return this._activePlayer.jumpBackward(ms);
      }
      return false;
    },

    /* Get current playback position (milliseconds) */
    getCurrentTime: function() {
      if (this._activePlayer) {
        return this._activePlayer.getCurrentTime();
      }
      return 0;
    },

    /* Get total duration (milliseconds) */
    getDuration: function() {
      if (this._activePlayer) {
        return this._activePlayer.getDuration();
      }
      return 0;
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

    /* Get active player type */
    getPlayerType: function() {
      return this._playerType;
    },

    /* Set playback speed */
    setPlaybackSpeed: function(speed) {
      if (this._activePlayer) {
        return this._activePlayer.setPlaybackSpeed(speed);
      }
      return false;
    },

    /* Set volume (0.0 - 1.0) */
    setVolume: function(volume) {
      if (this._activePlayer) {
        return this._activePlayer.setVolume(volume);
      }
      return false;
    },

    /* Get volume */
    getVolume: function() {
      if (this._activePlayer) {
        return this._activePlayer.getVolume();
      }
      return 1;
    },

    /* Mute/unmute */
    setMute: function(muted) {
      if (this._activePlayer) {
        return this._activePlayer.setMute(muted);
      }
      return false;
    },

    /* Get subtitle tracks */
    getSubtitleTracks: function() {
      if (this._activePlayer && this._activePlayer.getSubtitleTracks) {
        return this._activePlayer.getSubtitleTracks();
      }
      return [];
    },

    /* Get audio tracks */
    getAudioTracks: function() {
      if (this._activePlayer && this._activePlayer.getAudioTracks) {
        return this._activePlayer.getAudioTracks();
      }
      return [];
    },

    /* Select subtitle track */
    selectSubtitle: function(index) {
      if (this._activePlayer && this._activePlayer.selectSubtitle) {
        return this._activePlayer.selectSubtitle(index);
      }
      return false;
    },

    /* Select audio track */
    selectAudio: function(index) {
      if (this._activePlayer && this._activePlayer.selectAudio) {
        return this._activePlayer.selectAudio(index);
      }
      return false;
    },

    /* Get stream info */
    getStreamInfo: function() {
      if (this._activePlayer && this._activePlayer.getStreamInfo) {
        return this._activePlayer.getStreamInfo();
      }
      return null;
    },

    /* Get video resolution */
    getVideoResolution: function() {
      if (this._activePlayer && this._activePlayer.getVideoResolution) {
        return this._activePlayer.getVideoResolution();
      }
      return { width: 0, height: 0 };
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
      if (window.AVPlayAdapter) window.AVPlayAdapter.setDebug(enabled);
      if (window.BitmovinAdapter) window.BitmovinAdapter.setDebug(enabled);
    },

    /* Get session statistics */
    getStats: function() {
      var stats = Object.assign({}, this._sessionStats);
      stats.currentPlayer = this._playerType;
      stats.currentState = this._state;
      return stats;
    },

    /* Reset AVPlay failure flag (e.g., after app restart) */
    resetAVPlayFailure: function() {
      this._avplayFailed = false;
      this._log('AVPlay failure flag reset');
    },

    /* Internal: Determine if Bitmovin should be used */
    _shouldUseBitmovin: function(url, options) {
      /* Force Bitmovin via options */
      if (options.forcePlayer === 'bitmovin') {
        return true;
      }

      /* DRM content requires Bitmovin */
      if (options.drm) {
        return true;
      }

      /* AVPlay previously failed */
      if (this._avplayFailed) {
        return true;
      }

      /* Force AVPlay via options */
      if (options.forcePlayer === 'avplay') {
        return false;
      }

      /* Default: use AVPlay */
      return false;
    },

    /* Internal: Use AVPlay */
    _useAVPlay: function(url, options) {
      var self = this;

      if (!window.AVPlayAdapter) {
        this._log('ERROR: AVPlayAdapter not loaded');
        this._fallbackToBitmovin(url, options);
        return;
      }

      /* Clean up previous player */
      if (this._activePlayer && this._playerType === 'bitmovin') {
        this._activePlayer.close();
      }

      this._playerType = 'avplay';
      this._activePlayer = window.AVPlayAdapter;

      /* Setup listeners */
      this._setupPlayerListeners(this._activePlayer, 'avplay');

      /* Open stream */
      var success = this._activePlayer.open(url, Object.assign({}, options, { autoplay: true }));

      if (!success) {
        this._log('AVPlay open failed - falling back');
        this._fallbackToBitmovin(url, options);
      }
    },

    /* Internal: Use Bitmovin */
    _useBitmovin: function(url, options) {
      var self = this;

      if (!window.BitmovinAdapter) {
        this._log('ERROR: BitmovinAdapter not loaded');
        this._state = 'error';
        this._notify('error', { code: 'BITMOVIN_UNAVAILABLE', message: 'Bitmovin player not loaded' });
        return;
      }

      /* Clean up previous player */
      if (this._activePlayer && this._playerType === 'avplay') {
        this._activePlayer.close();
      }

      this._playerType = 'bitmovin';
      this._activePlayer = window.BitmovinAdapter;

      /* Setup listeners */
      this._setupPlayerListeners(this._activePlayer, 'bitmovin');

      /* Open stream */
      this._activePlayer.open(url, Object.assign({}, options, { autoplay: true }));
    },

    /* Internal: Fallback to Bitmovin */
    _fallbackToBitmovin: function(url, options) {
      if (!this._fallbackEnabled) {
        this._log('Fallback disabled - cannot use Bitmovin');
        this._state = 'error';
        this._notify('error', { code: 'FALLBACK_DISABLED', message: 'Fallback playback disabled' });
        return;
      }

      this._log('FALLBACK: Switching to Bitmovin');
      this._sessionStats.fallbacks++;
      this._avplayFailed = true;

      this._useBitmovin(url, options);
    },

    /* Internal: Setup player event listeners */
    _setupPlayerListeners: function(player, type) {
      var self = this;

      /* Clear previous listeners */
      player.off();

      /* Prepared/Ready */
      player.on('prepared', function() {
        self._state = 'ready';
        self._notify('ready', { player: type });
      });

      /* Play */
      player.on('play', function() {
        self._state = 'playing';
        self._notify('play', { player: type });
      });

      /* Pause */
      player.on('pause', function() {
        self._state = 'paused';
        self._notify('pause', { player: type });
      });

      /* Stop */
      player.on('stop', function() {
        self._state = 'stopped';
        self._notify('stop', { player: type });
      });

      /* End */
      player.on('ended', function() {
        self._state = 'completed';
        self._notify('ended', { player: type });
        self._trackWatchTime();
      });

      /* Buffering */
      player.on('bufferingstart', function() {
        self._state = 'buffering';
        self._notify('bufferingstart', { player: type });
      });

      player.on('bufferingprogress', function(data) {
        self._notify('bufferingprogress', data);
      });

      player.on('bufferingcomplete', function() {
        self._state = 'playing';
        self._notify('bufferingcomplete', { player: type });
      });

      /* Time update */
      player.on('timeupdate', function(data) {
        self._notify('timeupdate', data);
      });

      /* Error */
      player.on('error', function(data) {
        self._log('PLAYER ERROR (' + type + '): ' + JSON.stringify(data));
        self._sessionStats.errors++;

        if (type === 'avplay' && !self._avplayFailed) {
          /* Mark AVPlay as failed and fallback */
          self._avplayFailed = true;
          self._log('AVPlay marked as failed - will fallback on next play');
        }

        self._state = 'error';
        self._notify('error', Object.assign({ player: type }, data));
      });

      /* Retry */
      player.on('retry', function(data) {
        self._notify('retry', Object.assign({ player: type }, data));
      });

      /* Close */
      player.on('close', function() {
        self._notify('close', { player: type });
      });
    },

    /* Internal: Track watch time */
    _trackWatchTime: function() {
      if (this._watchStart > 0) {
        var elapsed = Date.now() - this._watchStart;
        this._sessionStats.totalWatchTime += elapsed;
        this._watchStart = 0;
      }
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
        console.log('[PlaybackManager] ' + message);
      }
    }
  };

  /* Export to global scope */
  window.PlaybackManager = PlaybackManager;
})();
