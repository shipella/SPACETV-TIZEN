/* SPACE TV - Debug Overlay
 * On-device diagnostics triggered by remote key sequence (12345)
 * Shows player state, stream info, network status, and error history
 * ES5 compatible for Tizen 2.4
 */
(function() {
  'use strict';

  var DebugOverlay = {
    _visible: false,
    _element: null,
    _keyBuffer: '',
    _keyTimeout: null,
    _updateInterval: null,
    _errorHistory: [],
    _maxErrors: 20,
    _debugEnabled: false,

    /* Initialize debug overlay */
    init: function() {
      var self = this;

      this._createOverlay();
      this._setupKeyListener();
      this._log('Debug overlay initialized - press 12345 to toggle');

      return this;
    },

    /* Toggle overlay visibility */
    toggle: function() {
      if (this._visible) {
        this.hide();
      } else {
        this.show();
      }
    },

    /* Show overlay */
    show: function() {
      this._visible = true;
      this._element.style.display = 'block';
      this._startUpdates();
      this._log('Debug overlay shown');
    },

    /* Hide overlay */
    hide: function() {
      this._visible = false;
      this._element.style.display = 'none';
      this._stopUpdates();
      this._log('Debug overlay hidden');
    },

    /* Enable/disable debug mode */
    setDebug: function(enabled) {
      this._debugEnabled = enabled;
      if (window.PlaybackManager) {
        window.PlaybackManager.setDebug(enabled);
      }
    },

    /* Log an error to history */
    logError: function(error) {
      var entry = {
        timestamp: new Date().toISOString(),
        error: error.message || String(error),
        player: (window.PlaybackManager && window.PlaybackManager.getPlayerType()) || 'none',
        state: (window.PlaybackManager && window.PlaybackManager.getState()) || 'unknown'
      };

      this._errorHistory.unshift(entry);
      if (this._errorHistory.length > this._maxErrors) {
        this._errorHistory.pop();
      }

      this._updateErrorSection();
    },

    /* Internal: Create overlay element */
    _createOverlay: function() {
      var overlay = document.createElement('div');
      overlay.id = 'space-tv-debug';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:400px;height:100%;background:rgba(0,0,0,0.9);color:#0f0;font-family:monospace;font-size:14px;z-index:99999;overflow-y:auto;display:none;padding:10px;box-sizing:border-box;';

      overlay.innerHTML =
        '<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #333;">' +
          '<div style="font-size:18px;color:#fff;font-weight:bold;">SPACE TV DEBUG</div>' +
          '<div style="font-size:12px;color:#888;">Press 12345 to toggle | ESC to hide</div>' +
        '</div>' +

        '<div style="margin-bottom:15px;">' +
          '<div style="color:#fff;font-weight:bold;margin-bottom:5px;">PLAYER STATUS</div>' +
          '<div id="debug-player">Loading...</div>' +
        '</div>' +

        '<div style="margin-bottom:15px;">' +
          '<div style="color:#fff;font-weight:bold;margin-bottom:5px;">STREAM INFO</div>' +
          '<div id="debug-stream">No active stream</div>' +
        '</div>' +

        '<div style="margin-bottom:15px;">' +
          '<div style="color:#fff;font-weight:bold;margin-bottom:5px;">NETWORK</div>' +
          '<div id="debug-network">Checking...</div>' +
        '</div>' +

        '<div style="margin-bottom:15px;">' +
          '<div style="color:#fff;font-weight:bold;margin-bottom:5px;">SESSION STATS</div>' +
          '<div id="debug-stats">Loading...</div>' +
        '</div>' +

        '<div style="margin-bottom:15px;">' +
          '<div style="color:#fff;font-weight:bold;margin-bottom:5px;">ERROR HISTORY</div>' +
          '<div id="debug-errors" style="max-height:200px;overflow-y:auto;">No errors</div>' +
        '</div>' +

        '<div style="margin-bottom:15px;">' +
          '<div style="color:#fff;font-weight:bold;margin-bottom:5px;">CONTROLS</div>' +
          '<div style="color:#888;font-size:12px;">' +
            'D-Pad Up/Down: Scroll<br/>' +
            'ENTER: Toggle debug mode<br/>' +
            'RETURN/ESC: Hide overlay<br/>' +
            'RED: Clear error history<br/>' +
            'GREEN: Force AVPlay<br/>' +
            'YELLOW: Force Bitmovin<br/>' +
            'BLUE: Clear cache' +
          '</div>' +
        '</div>' +

        '<div style="color:#666;font-size:10px;margin-top:10px;">' +
          'SPACE TV v2.0 | Tizen 2.4 | Debug Overlay' +
        '</div>';

      document.body.appendChild(overlay);
      this._element = overlay;
    },

    /* Internal: Setup key listener */
    _setupKeyListener: function() {
      var self = this;

      document.addEventListener('keydown', function(e) {
        var key = e.keyCode || e.which;
        var keyChar = String.fromCharCode(key);

        /* Buffer key sequence */
        self._keyBuffer += keyChar;
        if (self._keyBuffer.length > 5) {
          self._keyBuffer = self._keyBuffer.slice(-5);
        }

        /* Check for 12345 sequence */
        if (self._keyBuffer === '12345') {
          e.preventDefault();
          self.toggle();
          self._keyBuffer = '';
          return;
        }

        /* Handle overlay controls when visible */
        if (self._visible) {
          /* ESC/RETURN - hide */
          if (key === 27 || key === 10009 || key === 10182) {
            e.preventDefault();
            self.hide();
            return;
          }

          /* ENTER - toggle debug mode */
          if (key === 13 || key === 32) {
            e.preventDefault();
            self.setDebug(!self._debugEnabled);
            self._log('Debug mode: ' + (self._debugEnabled ? 'ON' : 'OFF'));
            return;
          }

          /* RED - clear errors */
          if (key === 403 || key === 82) {
            e.preventDefault();
            self._errorHistory = [];
            self._updateErrorSection();
            return;
          }

          /* GREEN - force AVPlay */
          if (key === 404 || key === 71) {
            e.preventDefault();
            if (window.PlaybackManager) {
              window.PlaybackManager.resetAVPlayFailure();
              self._log('Forced AVPlay mode');
            }
            return;
          }

          /* YELLOW - force Bitmovin */
          if (key === 405 || key === 89) {
            e.preventDefault();
            if (window.PlaybackManager) {
              window.PlaybackManager._avplayFailed = true;
              self._log('Forced Bitmovin mode');
            }
            return;
          }

          /* BLUE - clear cache */
          if (key === 406 || key === 66) {
            e.preventDefault();
            if (window.StreamResolver) {
              window.StreamResolver.clearCache();
              self._log('Cache cleared');
            }
            return;
          }
        }

        /* Clear buffer after timeout */
        clearTimeout(self._keyTimeout);
        self._keyTimeout = setTimeout(function() {
          self._keyBuffer = '';
        }, 2000);
      });
    },

    /* Internal: Start auto-updates */
    _startUpdates: function() {
      var self = this;
      this._updateInterval = setInterval(function() {
        self._updatePlayerSection();
        self._updateStreamSection();
        self._updateNetworkSection();
        self._updateStatsSection();
      }, 1000);
    },

    /* Internal: Stop auto-updates */
    _stopUpdates: function() {
      if (this._updateInterval) {
        clearInterval(this._updateInterval);
        this._updateInterval = null;
      }
    },

    /* Internal: Update player section */
    _updatePlayerSection: function() {
      var el = document.getElementById('debug-player');
      if (!el) return;

      var pm = window.PlaybackManager;
      if (!pm) {
        el.innerHTML = '<span style="color:#f00;">PlaybackManager not loaded</span>';
        return;
      }

      var state = pm.getState();
      var playerType = pm.getPlayerType();
      var currentTime = pm.getCurrentTime();
      var duration = pm.getDuration();
      var volume = pm.getVolume();

      var stateColor = '#0f0';
      if (state === 'error') stateColor = '#f00';
      else if (state === 'buffering') stateColor = '#ff0';
      else if (state === 'loading') stateColor = '#08f';

      el.innerHTML =
        '<div>Player: <span style="color:#0ff;">' + playerType.toUpperCase() + '</span></div>' +
        '<div>State: <span style="color:' + stateColor + ';">' + state + '</span></div>' +
        '<div>Time: ' + this._formatTime(currentTime) + ' / ' + this._formatTime(duration) + '</div>' +
        '<div>Volume: ' + Math.round(volume * 100) + '%</div>' +
        '<div>Debug: <span style="color:' + (this._debugEnabled ? '#0f0' : '#f00') + ';">' + (this._debugEnabled ? 'ON' : 'OFF') + '</span></div>';
    },

    /* Internal: Update stream section */
    _updateStreamSection: function() {
      var el = document.getElementById('debug-stream');
      if (!el) return;

      var pm = window.PlaybackManager;
      if (!pm || pm.getState() === 'idle') {
        el.innerHTML = 'No active stream';
        return;
      }

      var info = pm.getStreamInfo ? pm.getStreamInfo() : null;
      var resolution = pm.getVideoResolution ? pm.getVideoResolution() : null;

      var html = '';
      if (info) {
        html += '<div>Info: ' + JSON.stringify(info).substring(0, 100) + '...</div>';
      }
      if (resolution) {
        html += '<div>Resolution: ' + resolution.width + 'x' + resolution.height + '</div>';
      }
      if (!html) {
        html = 'Stream info unavailable';
      }

      el.innerHTML = html;
    },

    /* Internal: Update network section */
    _updateNetworkSection: function() {
      var el = document.getElementById('debug-network');
      if (!el) return;

      /* Check connection */
      var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection) {
        el.innerHTML =
          '<div>Type: ' + (connection.type || 'unknown') + '</div>' +
          '<div>Downlink: ' + (connection.downlink || 'N/A') + ' Mbps</div>' +
          '<div>RTT: ' + (connection.rtt || 'N/A') + ' ms</div>';
      } else {
        el.innerHTML =
          '<div>Online: ' + (navigator.onLine ? 'Yes' : 'No') + '</div>' +
          '<div>Connection API: Not available</div>';
      }
    },

    /* Internal: Update stats section */
    _updateStatsSection: function() {
      var el = document.getElementById('debug-stats');
      if (!el) return;

      var pm = window.PlaybackManager;
      if (!pm) {
        el.innerHTML = 'Stats unavailable';
        return;
      }

      var stats = pm.getStats();
      el.innerHTML =
        '<div>Plays: ' + stats.plays + '</div>' +
        '<div>Errors: ' + stats.errors + '</div>' +
        '<div>Fallbacks: ' + stats.fallbacks + '</div>' +
        '<div>Watch Time: ' + this._formatTime(stats.totalWatchTime) + '</div>';
    },

    /* Internal: Update error section */
    _updateErrorSection: function() {
      var el = document.getElementById('debug-errors');
      if (!el) return;

      if (this._errorHistory.length === 0) {
        el.innerHTML = 'No errors';
        return;
      }

      var html = '';
      for (var i = 0; i < this._errorHistory.length; i++) {
        var entry = this._errorHistory[i];
        html += '<div style="margin-bottom:5px;padding:5px;background:rgba(255,0,0,0.1);border-left:2px solid #f00;">' +
          '<div style="color:#888;font-size:10px;">' + entry.timestamp + ' | ' + entry.player + ' | ' + entry.state + '</div>' +
          '<div style="color:#f88;">' + entry.error + '</div>' +
        '</div>';
      }

      el.innerHTML = html;
    },

    /* Internal: Format time */
    _formatTime: function(ms) {
      if (!ms || ms <= 0) return '00:00:00';
      var totalSeconds = Math.floor(ms / 1000);
      var hours = Math.floor(totalSeconds / 3600);
      var minutes = Math.floor((totalSeconds % 3600) / 60);
      var seconds = totalSeconds % 60;
      return (hours < 10 ? '0' : '') + hours + ':' +
             (minutes < 10 ? '0' : '') + minutes + ':' +
             (seconds < 10 ? '0' : '') + seconds;
    },

    /* Internal: Debug logging */
    _log: function(message) {
      console.log('[DebugOverlay] ' + message);
    }
  };

  /* Export to global scope */
  window.DebugOverlay = DebugOverlay;
})();
