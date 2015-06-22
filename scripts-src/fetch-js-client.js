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
    config.getPreference('opentokClientVersion', context.opts.plugin.platform) || 'v2';

  var modulePath =
    path.join(context.opts.plugin.dir, 'src', context.opts.plugin.platform, 'opentok.js');

  // TODO: error handling
  var moduleWriteStream = fs.createWriteStream(modulePath);
  moduleWriteStream.on('open', function() {
    https.get(clientUrl.replace('VERSION', opentokClientVersion), function(res) {
      res.pipe(replacestream(/if \(location\.protocol === 'file:'\) {[^}]*}/gm, '/* removed by cordova-plugin-opentokjs */', {
        max_match_len: 1000
      }))
      .pipe(through(
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
