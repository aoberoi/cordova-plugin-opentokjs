var path = require('path');
var fs = require('fs');
var https = require('https');
var replacestream = require('replacestream');
var through = require('event-stream').through;

var clientUrl = 'https://static.opentok.com/VERSION/js/opentok.js';

// Fetch OpenTok.js client
// This script will run once per platform where the hook is applied
// Acknowledgement: This script was inspired by original work from Callan Iwan Kandasamy
// (https://github.com/CallanIwan), contained in
// https://github.com/songz/cordova-plugin-opentok/pull/176

// TODO: make a separate script that can be run to update the library after the plugin is installed
module.exports = function(context) {

  var Q = context.requireCordovaModule('q');
  var osenv = context.requireCordovaModule('osenv');
  var ConfigParser = context.requireCordovaModule('../configparser/ConfigParser');

  var deferral = Q.defer();

  var config = new ConfigParser(path.join(context.opts.projectRoot, 'config.xml'));
  var opentokClientVersion =
    config.getPreference('OpentokClientVersion', context.opts.plugin.platform) || 'v2';

  var modulePath =
    path.join(context.opts.plugin.dir, 'src', context.opts.plugin.platform, 'opentok.js');

  // TODO: error handling
  var moduleWriteStream = fs.createWriteStream(modulePath);
  moduleWriteStream.on('open', function() {
    https.get(clientUrl.replace('VERSION', opentokClientVersion), function(res) {
      var sourceStream = res.pipe(replacestream(/if \(location\.protocol === 'file:'\) {[^}]*}/gm, '/* removed by cordova-plugin-opentokjs */', {
        max_match_len: 1000
      }));

      if (context.opts.plugin.platform === 'ios') {
        sourceStream = sourceStream.pipe(replacestream('var isSupported = $.env.name === \'Safari\' ||\n                  ($.env.name === \'IE\' && $.env.version >= 8 &&', 'var isSupported =  ($.env.name === \'IE\' && $.env.version >= 8 &&', {
          max_match_len: 1000
        }))
        .pipe(replacestream('loadedEvent = webRtcStream.getVideoTracks().length > minVideoTracksForTimeUpdate ?\n          \'timeupdate\' : \'loadedmetadata\';', 'loadedEvent = \'loadedmetadata\';', {
          max_match_len: 1000
        }))
        .pipe(replacestream('onError = function onError (event) {\n          cleanup();\n          unbindNativeStream(videoElement);\n', 'onError = function onError (event) {\n          if (event.target.error.code === window.MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {\n            return onLoad();\n          }\n          cleanup();\n          unbindNativeStream(videoElement);\n', {
          max_match_len: 1000
        }))
        .pipe(replacestream('var _onVideoError = OT.$.bind(function(event) {\n', 'var _onVideoError = OT.$.bind(function(event) {\n          if (event.target.error.code === window.MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {\n            return;\n          }\n', {
          max_match_len: 1000
        }));
      }

      sourceStream.pipe(through(
        function write(data) {
          this.emit('data', data);
        },

        function end() {
          this.emit('data', '\n// cordova-plugin-opentok injected export\nmodule.exports = window.OT;\n');
          this.emit('end');
        }))
      .pipe(moduleWriteStream)
      .on('finish', function() {
        deferral.resolve();
      });
    });
  });

  return deferral.promise;
};
