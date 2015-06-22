var gulp = require('gulp');
var browserify = require('browserify');
var source = require('vinyl-source-stream');

gulp.task('scripts', function() {
  var b = browserify({
    entries: './scripts-src/fetch-js-client.js',

    // no-builtins, no-commondir, insert-global-vars="__filename,__dirname", no-browser-field
    builtins: [],
    commondir: false,
    insertGlobalVars: ['__filename', '__dirname'],
    detectGlobals: false,
    browserField: false,
    standalone: 'module.exports'
  });

  return b.bundle()
    .pipe(source('fetch-js-client.js'))
    .pipe(gulp.dest('./scripts/'));
});

gulp.task('default', ['scripts']);
