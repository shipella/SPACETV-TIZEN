/* SPACE TV - AVPlay Adapter
 * Samsung Tizen native AVPlay wrapper
 * Primary playback engine for Tizen 2.4+
 * Reference: https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html
 */
(function() {
  'use strict';

  var AVPlayAdapter = {
    _player: null,
    _state: 'idle',
    _duration: 0,
    _currentUrl: '',
    _listeners: {},
    _retryCount: 0,
    _maxRetries: 2,
    _isPrepared: false,
    _bufferingTimeout: null,
    _progressInterval: null,
    _subtitleTracks: [],
    _audioTracks: [],
    _selectedSubtitle: -1,
    _selectedAudio: -1,
    _debugEnabled: false,

    /* Initialize AVPlay - must be called once at app startup */
    init: function() {
      if (typeof webapis === 'undefined' || !webapis.avplay) {
        this._log('ERROR: AVPlay not available on this device');
        return false;
      }
      this._player = webapis.avplay;
      this._state = 'idle';
      this._log('AVPlay initialized');
      return true;
    },

    /* Check if AVPlay is available */
    isAvailable: function() {
      return typeof webapis !== 'undefined' && !!webapis.avplay;
    },

    /* Open a stream URL */
    open: function(url, options) {
      var self = this;
      options = options || {};

      if (!this._player) {
        this._log('ERROR: AVPlay not initialized');
        this._notify('error', { code: 'NOT_INITIALIZED', message: 'AVPlay not initialized' });
        return false;
      }

      this._log('OPEN: ' + url);
      this._currentUrl = url;
      this._state = 'opening';
      this._retryCount = 0;
      this._isPrepared = false;
      this._duration = 0;

      try {
        /* Set up event listeners */
        this._player.setListener({
          onbufferingstart: function() {
            self._log('BUFFERING: start');
            self._state = 'buffering';
            self._notify('bufferingstart');
            self._startBufferingTimeout();
          },
          onbufferingprogress: function(percent) {
            self._log('BUFFERING: ' + percent + '%');
            self._notify('bufferingprogress', { percent: percent });
          },
          onbufferingcomplete: function() {
            self._log('BUFFERING: complete');
            self._state = 'ready';
            self._notify('bufferingcomplete');
            self._clearBufferingTimeout();
          },
          oncurrentplaytime: function(currentTime) {
            self._notify('timeupdate', { current: currentTime, duration: self._duration });
          },
          onstreamcompleted: function() {
            self._log('STREAM: completed');
            self._state = 'completed';
            self._notify('ended');
            self._stopProgressInterval();
          },
          onerror: function(errorType) {
            self._log('ERROR: ' + errorType);
            self._handleError(errorType);
          },
          onevent: function(eventType) {
            self._log('EVENT: ' + eventType);
            self._notify('event', { type: eventType });
          },
          ondrmevent: function(drmEvent, drmData) {
            self._log('DRM: ' + drmEvent);
            self._notify('drmevent', { event: drmEvent, data: drmData });
          }
        });

        /* Open the stream */
        this._player.open(url);
        this._state = 'opened';

        /* Configure display */
        this._setDisplayOptions(options);

        /* Configure buffering */
        this._setBufferingOptions();

        /* Configure streaming properties */
        this._setStreamingOptions(options);

        /* Prepare async */
        this._player.prepareAsync(
          function() {
            self._log('PREPARE: success');
            self._isPrepared = true;
            self._state = 'prepared';
            self._notify('prepared');

            /* Get duration */
            try {
              self._duration = self._player.getDuration();
            } catch (e) {
              self._duration = 0;
            }

            /* Get subtitle and audio tracks */
            self._loadTracks();

            /* Auto-play if requested */
            if (options.autoplay) {
              self.play();
            }
          },
          function(error) {
            self._log('PREPARE: failed - ' + (error || 'unknown'));
            self._handleError('PREPARE_FAILED');
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
      if (!this._player || this._state === 'idle') return false;
      try {
        this._player.play();
        this._state = 'playing';
        this._log('PLAY');
        this._notify('play');
        this._startProgressInterval();
        return true;
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
        this._log('PAUSE');
        this._notify('pause');
        this._stopProgressInterval();
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
        this._log('STOP');
        this._notify('stop');
        this._stopProgressInterval();
        this._clearBufferingTimeout();
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
        this.stop();
        this._player.close();
        this._state = 'closed';
        this._log('CLOSE');
        this._notify('close');
        this._stopProgressInterval();
        this._clearBufferingTimeout();
        this._currentUrl = '';
        this._isPrepared = false;
      } catch (e) {
        this._log('CLOSE: exception - ' + e.message);
      }
    },

    /* Seek to position (milliseconds) */
    seek: function(positionMs) {
      if (!this._player || !this._isPrepared) return false;
      try {
        this._player.seekTo(positionMs);
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
      if (!this._player || !this._isPrepared) return 0;
      try {
        return this._player.getCurrentPosition();
      } catch (e) {
        return 0;
      }
    },

    /* Get total duration (milliseconds) */
    getDuration: function() {
      return this._duration;
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
      if (!this._player || !this._isPrepared) return false;
      try {
        this._player.setPlaySpeed(speed);
        this._log('SPEED: ' + speed);
        return true;
      } catch (e) {
        this._log('SPEED: exception - ' + e.message);
        return false;
      }
    },

    /* Set volume (0.0 - 1.0) */
    setVolume: function(volume) {
      if (!this._player) return false;
      try {
        this._player.setVolume(volume);
        return true;
      } catch (e) {
        return false;
      }
    },

    /* Get volume */
    getVolume: function() {
      if (!this._player) return 1;
      try {
        return this._player.getVolume();
      } catch (e) {
        return 1;
      }
    },

    /* Mute/unmute */
    setMute: function(muted) {
      if (!this._player) return false;
      try {
        this._player.setMute(muted);
        return true;
      } catch (e) {
        return false;
      }
    },

    /* Get subtitle tracks */
    getSubtitleTracks: function() {
      return this._subtitleTracks;
    },

    /* Get audio tracks */
    getAudioTracks: function() {
      return this._audioTracks;
    },

    /* Select subtitle track by index */
    selectSubtitle: function(index) {
      if (!this._player || !this._isPrepared) return false;
      try {
        this._player.setSelectTrack('SUBTITLE', index);
        this._selectedSubtitle = index;
        this._log('SUBTITLE: track ' + index);
        this._notify('subtitlechanged', { index: index });
        return true;
      } catch (e) {
        this._log('SUBTITLE: exception - ' + e.message);
        return false;
      }
    },

    /* Select audio track by index */
    selectAudio: function(index) {
      if (!this._player || !this._isPrepared) return false;
      try {
        this._player.setSelectTrack('AUDIO', index);
        this._selectedAudio = index;
        this._log('AUDIO: track ' + index);
        this._notify('audiochanged', { index: index });
        return true;
      } catch (e) {
        this._log('AUDIO: exception - ' + e.message);
        return false;
      }
    },

    /* Get stream info */
    getStreamInfo: function() {
      if (!this._player || !this._isPrepared) return null;
      try {
        return this._player.getStreamingProperty('PLAYER_GET_STREAM_INFO');
      } catch (e) {
        return null;
      }
    },

    /* Get video resolution */
    getVideoResolution: function() {
      if (!this._player || !this._isPrepared) return { width: 0, height: 0 };
      try {
        var info = this._player.getStreamingProperty('PLAYER_GET_STREAM_INFO');
        if (info && info.video) {
          return { width: info.video.width || 0, height: info.video.height || 0 };
        }
      } catch (e) {}
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
    },

    /* Internal: Set display options */
    _setDisplayOptions: function(options) {
      try {
        var width = options.width || (window.innerWidth || 1920);
        var height = options.height || (window.innerHeight || 1080);
        this._player.setDisplayRect(0, 0, width, height);
        this._player.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
      } catch (e) {
        this._log('DISPLAY: exception - ' + e.message);
      }
    },

    /* Internal: Set buffering options */
    _setBufferingOptions: function() {
      try {
        this._player.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', 10);
        this._player.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', 6);
      } catch (e) {
        this._log('BUFFER: exception - ' + e.message);
      }
    },

    /* Internal: Set streaming options */
    _setStreamingOptions: function(options) {
      try {
        /* Adaptive bitrate streaming */
        this._player.setStreamingProperty('ADAPTIVE_INFO', 'STARTBITRATE=HIGHEST;FIXED_MAX_RESOLUTION=1920X1080');

        /* HTTP headers for authentication */
        if (options.headers) {
          var headerStr = '';
          var keys = Object.keys(options.headers);
          for (var i = 0; i < keys.length; i++) {
            if (headerStr) headerStr += '|';
            headerStr += keys[i] + ':' + options.headers[keys[i]];
          }
          if (headerStr) {
            this._player.setStreamingProperty('SET_EXTRA_DATA', headerStr);
          }
        }

        /* CORS mode */
        this._player.setStreamingProperty('SET_CORS_MODE', 'ENABLED');
      } catch (e) {
        this._log('STREAMING: exception - ' + e.message);
      }
    },

    /* Internal: Load subtitle and audio tracks */
    _loadTracks: function() {
      try {
        var subtitleCount = this._player.getNumberOfTrack('SUBTITLE');
        var audioCount = this._player.getNumberOfTrack('AUDIO');

        this._subtitleTracks = [];
        this._audioTracks = [];

        for (var i = 0; i < subtitleCount; i++) {
          var subInfo = this._player.getTrackInfo('SUBTITLE', i);
          this._subtitleTracks.push({
            index: i,
            language: (subInfo && subInfo.language) || 'Unknown',
            type: (subInfo && subInfo.type) || 'unknown'
          });
        }

        for (var j = 0; j < audioCount; j++) {
          var audioInfo = this._player.getTrackInfo('AUDIO', j);
          this._audioTracks.push({
            index: j,
            language: (audioInfo && audioInfo.language) || 'Unknown',
            type: (audioInfo && audioInfo.type) || 'unknown'
          });
        }

        this._log('TRACKS: ' + subtitleCount + ' subtitles, ' + audioCount + ' audio');
      } catch (e) {
        this._log('TRACKS: exception - ' + e.message);
      }
    },

    /* Internal: Handle errors with retry logic */
    _handleError: function(errorType) {
      var self = this;
      this._log('HANDLE_ERROR: ' + errorType + ' (retry ' + this._retryCount + '/' + this._maxRetries + ')');

      /* Stop progress tracking */
      this._stopProgressInterval();
      this._clearBufferingTimeout();

      /* Retry logic */
      if (this._retryCount < this._maxRetries && this._currentUrl) {
        this._retryCount++;
        this._log('RETRY: attempt ' + this._retryCount);
        this._notify('retry', { attempt: this._retryCount, max: this._maxRetries });

        /* Close and reopen after short delay */
        setTimeout(function() {
          try {
            self._player.stop();
            self._player.close();
          } catch (e) {}

          self._isPrepared = false;
          self._state = 'retrying';

          setTimeout(function() {
            self.open(self._currentUrl, { autoplay: true });
          }, 1000);
        }, 500);
        return;
      }

      /* Max retries exceeded - report error */
      this._state = 'error';
      var errorMap = {
        'PLAYER_ERROR_CONNECTION_FAILED': { code: 'CONNECTION_FAILED', message: 'Connection to stream failed' },
        'PLAYER_ERROR_DECODE': { code: 'DECODE_ERROR', message: 'Unable to decode stream' },
        'PLAYER_ERROR_NOT_SUPPORTED': { code: 'NOT_SUPPORTED', message: 'Stream format not supported' },
        'PREPARE_FAILED': { code: 'PREPARE_FAILED', message: 'Failed to prepare stream' },
        'OPEN_FAILED': { code: 'OPEN_FAILED', message: 'Failed to open stream' }
      };

      var error = errorMap[errorType] || { code: errorType || 'UNKNOWN', message: 'Playback error occurred' };
      this._notify('error', error);
    },

    /* Internal: Start buffering timeout */
    _startBufferingTimeout: function() {
      var self = this;
      this._clearBufferingTimeout();
      this._bufferingTimeout = setTimeout(function() {
        self._log('BUFFERING: timeout - forcing retry');
        self._handleError('PLAYER_ERROR_CONNECTION_FAILED');
      }, 30000); /* 30 second timeout */
    },

    /* Internal: Clear buffering timeout */
    _clearBufferingTimeout: function() {
      if (this._bufferingTimeout) {
        clearTimeout(this._bufferingTimeout);
        this._bufferingTimeout = null;
      }
    },

    /* Internal: Start progress interval */
    _startProgressInterval: function() {
      var self = this;
      this._stopProgressInterval();
      this._progressInterval = setInterval(function() {
        if (self._state === 'playing') {
          var current = self.getCurrentTime();
          self._notify('timeupdate', { current: current, duration: self._duration });
        }
      }, 500);
    },

    /* Internal: Stop progress interval */
    _stopProgressInterval: function() {
      if (this._progressInterval) {
        clearInterval(this._progressInterval);
        this._progressInterval = null;
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
        console.log('[AVPlay] ' + message);
      }
    }
  };

  /* Export to global scope */
  window.AVPlayAdapter = AVPlayAdapter;
})();
