#!/usr/bin/env node

var path = require('path');
var fs = require('fs');
var https = require('https');

var clientUrl = 'https://static.opentok.com/VERSION/js/opentok.js';

// Fetch OpenTok.js client
// This script will run once per platform where the hook is applied
// Acknowledgement: This script was inspired by original work from Callan Iwan Kandasamy
// (https://github.com/CallanIwan), contained in
// https://github.com/songz/cordova-plugin-opentok/pull/176
module.exports = function(context) {

  var Q = context.requireCordovaModule('q');
  var osenv = context.requireCordovaModule('osenv');
  var ConfigParser = context.requireCordovaModule('../configparser/ConfigParser');

  var deferral = Q.defer();

  var config = new ConfigParser(path.join(context.opts.projectRoot, 'config.xml'));
  var opentokClientVersion =
    config.getPreference('opentokClientVersion', context.opts.plugin.platform) || 'v2';

  var downloadPath = path.join(osenv.tmpdir(), 'opentok.js');
  var transformedPath = path.join(osenv.tmpdir(), 'opentok-');
  var modulePath =
    path.join(context.opts.plugin.dir, 'src', context.opts.plugin.platform, 'opentok.js');

  // TODO: this could be better with streams and/or promises

  // Download JS Client
  downloadFile(clientUrl.replace('VERSION', opentokClientVersion), downloadPath, function(err) {
    if (err) return deferral.reject(err);

    // Transform source (must export symbols for when Cordova wraps it as an AMD module)
    transformClientLibrary(downloadPath, transformedPath, function(err) {
      if (err) return deferral.reject(err);

      // Place source in destination
      rename(transformedPath, modulePath, function(err) {
        if (err) return deferral.reject(err);

        // Delete temporary files
        fs.unlinkSync(downloadPath);
        fs.unlinkSync(transformedPath);

        deferral.resolve();
      });
    });
  });


  return deferral.promise;
};

var downloadFile = function(url, destination, callback) {

  var destinationWriteStream;

  var errorOccurred = false;
  // this function helps prevent the callback from being called twice.
  // if errors fire on the event loop after a previous error was already handled, then onError is a
  // no-op. the errorOccurred flag is used to check whether the following actions should be
  // cancelled (using an early return) before doing any work in every callback that gets scheduled.
  var onError = function(err) {
    if (!errorOccurred) {
      errorOccurred = true;
      return callback(err);
    }
  };

  // this function is similar to a 'finally' block where resources are released
  var releaseResources = function() {
    if (destinationWriteStream) {
      destinationWriteStream.end();
    }
  };

  destinationWriteStream = fs.createWriteStream(destination);

  destinationWriteStream.on('open', function() {
    if (errorOccurred) {
      return releaseResources();
    }

    var req = https.get(url, function(res) {
      if (errorOccurred) {
        return releaseResources();
      }

      res.pipe(destinationWriteStream, { end: false });
      res.on('error', onError);
      res.on('end', function() {
        if (errorOccurred) {
          return releaseResources();
        }

        res.unpipe(destinationWriteStream);
        destinationWriteStream.end(function() {
          if (errorOccurred) {
            return releaseResources();
          }

          callback();
        });
      });
    });

    req.on('error', onError);
  });

  destinationWriteStream.on('error', onError);
};

// TODO: could be handled better with a transform stream
var transformClientLibrary = function(source, destination, callback) {

  var destinationWriteStream;
  var sourceReadStream;

  var errorOccurred = false;
  var onError = function(err) {
    if (!errorOccurred) {
      errorOccurred = true;
      return callback(err);
    }
  };

  var releaseResources = function() {
    if (destinationWriteStream) {
      destinationWriteStream.end();
    }
    if (sourceReadStream) {
      sourceReadStream.end();
    }
  };

  // append an exports statement to the end of the library code
  destinationWriteStream = fs.createWriteStream(destination);
  destinationWriteStream.on('open', function() {
    if (errorOccurred) {
      return releaseResources();
    }

    sourceReadStream = fs.createReadStream(source);
    sourceReadStream.pipe(destinationWriteStream, { end: false });
    sourceReadStream.on('end', function() {
      if (errorOccurred) {
        return releaseResources();
      }

      sourceReadStream.unpipe(destinationWriteStream);
      destinationWriteStream.write(
        '\n' +
        '// cordova-plugin-opentok injected export\n' +
        'module.exports = window.OT;\n',
        'utf8',
        function() {
          if (errorOccurred) {
            return releaseResources();
          }

          destinationWriteStream.end(function() {
            if (errorOccurred) {
              return releaseResources();
            }

            callback();
          });
        }
      );

    });

    sourceReadStream.on('error', onError);
  });

  destinationWriteStream.on('error', onError);
};

// TODO: relies on errors in destinationWriteStream to propogate to souceReadStream's 'error' event
var rename = function(source, destination, callback) {
  var sourceReadStream = fs.createReadStream(source);
  var destinationWriteStream = fs.createWriteStream(destination);

  sourceReadStream.pipe(destinationWriteStream);
  sourceReadStream.on('end', function() {
    callback();
  });

  sourceReadStream.on('error', function(err) {
    callback(err);
  });

};

// TODO: make a separate script that can be run to update the library after the plugin is installed
