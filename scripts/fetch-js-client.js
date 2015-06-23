(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}(g.module || (g.module = {})).exports = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
//filter will reemit the data if cb(err,pass) pass is truthy

// reduce is more tricky
// maybe we want to group the reductions or emit progress updates occasionally
// the most basic reduce just emits one 'data' event after it has recieved 'end'

var Stream = require('stream').Stream
  , es = exports
  , through = require('through')
  , from = require('from')
  , duplex = require('duplexer')
  , map = require('map-stream')
  , pause = require('pause-stream')
  , split = require('split')
  , pipeline = require('stream-combiner')
  , immediately = global.setImmediate || process.nextTick;

es.Stream = Stream //re-export Stream from core
es.through = through
es.from = from
es.duplex = duplex
es.map = map
es.pause = pause
es.split = split
es.pipeline = es.connect = es.pipe = pipeline
// merge / concat
//
// combine multiple streams into a single stream.
// will emit end only once

es.concat = //actually this should be called concat
es.merge = function (/*streams...*/) {
  var toMerge = [].slice.call(arguments)
  if (toMerge.length === 1 && (toMerge[0] instanceof Array)) {
    toMerge = toMerge[0] //handle array as arguments object
  }
  var stream = new Stream()
  stream.setMaxListeners(0) // allow adding more than 11 streams
  var endCount = 0
  stream.writable = stream.readable = true

  toMerge.forEach(function (e) {
    e.pipe(stream, {end: false})
    var ended = false
    e.on('end', function () {
      if(ended) return
      ended = true
      endCount ++
      if(endCount == toMerge.length)
        stream.emit('end') 
    })
  })
  stream.write = function (data) {
    this.emit('data', data)
  }
  stream.destroy = function () {
    toMerge.forEach(function (e) {
      if(e.destroy) e.destroy()
    })
  }
  return stream
}


// writable stream, collects all events into an array 
// and calls back when 'end' occurs
// mainly I'm using this to test the other functions

es.writeArray = function (done) {
  if ('function' !== typeof done)
    throw new Error('function writeArray (done): done must be function')

  var a = new Stream ()
    , array = [], isDone = false
  a.write = function (l) {
    array.push(l)
  }
  a.end = function () {
    isDone = true
    done(null, array)
  }
  a.writable = true
  a.readable = false
  a.destroy = function () {
    a.writable = a.readable = false
    if(isDone) return
    done(new Error('destroyed before end'), array)
  }
  return a
}

//return a Stream that reads the properties of an object
//respecting pause() and resume()

es.readArray = function (array) {
  var stream = new Stream()
    , i = 0
    , paused = false
    , ended = false
 
  stream.readable = true  
  stream.writable = false
 
  if(!Array.isArray(array))
    throw new Error('event-stream.read expects an array')
  
  stream.resume = function () {
    if(ended) return
    paused = false
    var l = array.length
    while(i < l && !paused && !ended) {
      stream.emit('data', array[i++])
    }
    if(i == l && !ended)
      ended = true, stream.readable = false, stream.emit('end')
  }
  process.nextTick(stream.resume)
  stream.pause = function () {
     paused = true
  }
  stream.destroy = function () {
    ended = true
    stream.emit('close')
  }
  return stream
}

//
// readable (asyncFunction)
// return a stream that calls an async function while the stream is not paused.
//
// the function must take: (count, callback) {...
//

es.readable =
function (func, continueOnError) {
  var stream = new Stream()
    , i = 0
    , paused = false
    , ended = false
    , reading = false

  stream.readable = true  
  stream.writable = false
 
  if('function' !== typeof func)
    throw new Error('event-stream.readable expects async function')
  
  stream.on('end', function () { ended = true })
  
  function get (err, data) {
    
    if(err) {
      stream.emit('error', err)
      if(!continueOnError) stream.emit('end')
    } else if (arguments.length > 1)
      stream.emit('data', data)

    immediately(function () {
      if(ended || paused || reading) return
      try {
        reading = true
        func.call(stream, i++, function () {
          reading = false
          get.apply(null, arguments)
        })
      } catch (err) {
        stream.emit('error', err)    
      }
    })
  }
  stream.resume = function () {
    paused = false
    get()
  }
  process.nextTick(get)
  stream.pause = function () {
     paused = true
  }
  stream.destroy = function () {
    stream.emit('end')
    stream.emit('close')
    ended = true
  }
  return stream
}


//
// map sync
//

es.mapSync = function (sync) { 
  return es.through(function write(data) {
    var mappedData = sync(data)
    if (typeof mappedData !== 'undefined')
      this.emit('data', mappedData)
  })
}

//
// log just print out what is coming through the stream, for debugging
//

es.log = function (name) {
  return es.through(function (data) {
    var args = [].slice.call(arguments)
    if(name) console.error(name, data)
    else     console.error(data)
    this.emit('data', data)
  })
}


//
// child -- pipe through a child process
//

es.child = function (child) {

  return es.duplex(child.stdin, child.stdout)

}

//
// parse
//
// must be used after es.split() to ensure that each chunk represents a line
// source.pipe(es.split()).pipe(es.parse())

es.parse = function (options) {
  var emitError = !!(options ? options.error : false)
  return es.through(function (data) {
    var obj
    try {
      if(data) //ignore empty lines
        obj = JSON.parse(data.toString())
    } catch (err) {
      if (emitError)
        return this.emit('error', err)
      return console.error(err, 'attemping to parse:', data)
    }
    //ignore lines that where only whitespace.
    if(obj !== undefined)
      this.emit('data', obj)
  })
}
//
// stringify
//

es.stringify = function () { 
  var Buffer = require('buffer').Buffer
  return es.mapSync(function (e){ 
    return JSON.stringify(Buffer.isBuffer(e) ? e.toString() : e) + '\n'
  }) 
}

//
// replace a string within a stream.
//
// warn: just concatenates the string and then does str.split().join(). 
// probably not optimal.
// for smallish responses, who cares?
// I need this for shadow-npm so it's only relatively small json files.

es.replace = function (from, to) {
  return es.pipeline(es.split(from), es.join(to))
} 

//
// join chunks with a joiner. just like Array#join
// also accepts a callback that is passed the chunks appended together
// this is still supported for legacy reasons.
// 

es.join = function (str) {
  
  //legacy api
  if('function' === typeof str)
    return es.wait(str)

  var first = true
  return es.through(function (data) {
    if(!first)
      this.emit('data', str)
    first = false
    this.emit('data', data)
    return true
  })
}


//
// wait. callback when 'end' is emitted, with all chunks appended as string.
//

es.wait = function (callback) {
  var arr = []
  return es.through(function (data) { arr.push(data) },
    function () {
      var body = Buffer.isBuffer(arr[0]) ? Buffer.concat(arr)
        : arr.join('')
      this.emit('data', body)
      this.emit('end')
      if(callback) callback(null, body)
    })
}

es.pipeable = function () {
  throw new Error('[EVENT-STREAM] es.pipeable is deprecated')
}

},{"buffer":undefined,"duplexer":2,"from":3,"map-stream":4,"pause-stream":5,"split":6,"stream":undefined,"stream-combiner":7,"through":8}],2:[function(require,module,exports){
var Stream = require("stream")
var writeMethods = ["write", "end", "destroy"]
var readMethods = ["resume", "pause"]
var readEvents = ["data", "close"]
var slice = Array.prototype.slice

module.exports = duplex

function forEach (arr, fn) {
    if (arr.forEach) {
        return arr.forEach(fn)
    }

    for (var i = 0; i < arr.length; i++) {
        fn(arr[i], i)
    }
}

function duplex(writer, reader) {
    var stream = new Stream()
    var ended = false

    forEach(writeMethods, proxyWriter)

    forEach(readMethods, proxyReader)

    forEach(readEvents, proxyStream)

    reader.on("end", handleEnd)

    writer.on("drain", function() {
      stream.emit("drain")
    })

    writer.on("error", reemit)
    reader.on("error", reemit)

    stream.writable = writer.writable
    stream.readable = reader.readable

    return stream

    function proxyWriter(methodName) {
        stream[methodName] = method

        function method() {
            return writer[methodName].apply(writer, arguments)
        }
    }

    function proxyReader(methodName) {
        stream[methodName] = method

        function method() {
            stream.emit(methodName)
            var func = reader[methodName]
            if (func) {
                return func.apply(reader, arguments)
            }
            reader.emit(methodName)
        }
    }

    function proxyStream(methodName) {
        reader.on(methodName, reemit)

        function reemit() {
            var args = slice.call(arguments)
            args.unshift(methodName)
            stream.emit.apply(stream, args)
        }
    }

    function handleEnd() {
        if (ended) {
            return
        }
        ended = true
        var args = slice.call(arguments)
        args.unshift("end")
        stream.emit.apply(stream, args)
    }

    function reemit(err) {
        stream.emit("error", err)
    }
}

},{"stream":undefined}],3:[function(require,module,exports){

'use strict';

var Stream = require('stream')

// from
//
// a stream that reads from an source.
// source may be an array, or a function.
// from handles pause behaviour for you.

module.exports =
function from (source) {
  if(Array.isArray(source)) {
    source = source.slice()
    return from (function (i) {
      if(source.length)
        this.emit('data', source.shift())
      else
        this.emit('end')
      return true
    })
  }
  var s = new Stream(), i = 0
  s.ended = false
  s.started = false
  s.readable = true
  s.writable = false
  s.paused = false
  s.ended = false
  s.pause = function () {
    s.started = true
    s.paused = true
  }
  function next () {
    s.started = true
    if(s.ended) return
    while(!s.ended && !s.paused && source.call(s, i++, function () {
      if(!s.ended && !s.paused)
          next()
    }))
      ;
  }
  s.resume = function () {
    s.started = true
    s.paused = false
    next()
  }
  s.on('end', function () {
    s.ended = true
    s.readable = false
    process.nextTick(s.destroy)
  })
  s.destroy = function () {
    s.ended = true
    s.emit('close') 
  }
  /*
    by default, the stream will start emitting at nextTick
    if you want, you can pause it, after pipeing.
    you can also resume before next tick, and that will also
    work.
  */
  process.nextTick(function () {
    if(!s.started) s.resume()
  })
  return s
}

},{"stream":undefined}],4:[function(require,module,exports){
//filter will reemit the data if cb(err,pass) pass is truthy

// reduce is more tricky
// maybe we want to group the reductions or emit progress updates occasionally
// the most basic reduce just emits one 'data' event after it has recieved 'end'


var Stream = require('stream').Stream


//create an event stream and apply function to each .write
//emitting each response as data
//unless it's an empty callback

module.exports = function (mapper, opts) {

  var stream = new Stream()
    , self = this
    , inputs = 0
    , outputs = 0
    , ended = false
    , paused = false
    , destroyed = false
    , lastWritten = 0
    , inNext = false

  this.opts = opts || {};
  var errorEventName = this.opts.failures ? 'failure' : 'error';

  // Items that are not ready to be written yet (because they would come out of
  // order) get stuck in a queue for later.
  var writeQueue = {}

  stream.writable = true
  stream.readable = true

  function queueData (data, number) {
    var nextToWrite = lastWritten + 1

    if (number === nextToWrite) {
      // If it's next, and its not undefined write it
      if (data !== undefined) {
        stream.emit.apply(stream, ['data', data])
      }
      lastWritten ++
      nextToWrite ++
    } else {
      // Otherwise queue it for later.
      writeQueue[number] = data
    }

    // If the next value is in the queue, write it
    if (writeQueue.hasOwnProperty(nextToWrite)) {
      var dataToWrite = writeQueue[nextToWrite]
      delete writeQueue[nextToWrite]
      return queueData(dataToWrite, nextToWrite)
    }

    outputs ++
    if(inputs === outputs) {
      if(paused) paused = false, stream.emit('drain') //written all the incoming events
      if(ended) end()
    }
  }

  function next (err, data, number) {
    if(destroyed) return
    inNext = true

    if (!err || self.opts.failures) {
      queueData(data, number)
    }

    if (err) {
      stream.emit.apply(stream, [ errorEventName, err ]);
    }

    inNext = false;
  }

  // Wrap the mapper function by calling its callback with the order number of
  // the item in the stream.
  function wrappedMapper (input, number, callback) {
    return mapper.call(null, input, function(err, data){
      callback(err, data, number)
    })
  }

  stream.write = function (data) {
    if(ended) throw new Error('map stream is not writable')
    inNext = false
    inputs ++

    try {
      //catch sync errors and handle them like async errors
      var written = wrappedMapper(data, inputs, next)
      paused = (written === false)
      return !paused
    } catch (err) {
      //if the callback has been called syncronously, and the error
      //has occured in an listener, throw it again.
      if(inNext)
        throw err
      next(err)
      return !paused
    }
  }

  function end (data) {
    //if end was called with args, write it, 
    ended = true //write will emit 'end' if ended is true
    stream.writable = false
    if(data !== undefined) {
      return queueData(data, inputs)
    } else if (inputs == outputs) { //wait for processing 
      stream.readable = false, stream.emit('end'), stream.destroy() 
    }
  }

  stream.end = function (data) {
    if(ended) return
    end()
  }

  stream.destroy = function () {
    ended = destroyed = true
    stream.writable = stream.readable = paused = false
    process.nextTick(function () {
      stream.emit('close')
    })
  }
  stream.pause = function () {
    paused = true
  }

  stream.resume = function () {
    paused = false
  }

  return stream
}





},{"stream":undefined}],5:[function(require,module,exports){
//through@2 handles this by default!
module.exports = require('through')


},{"through":8}],6:[function(require,module,exports){
//filter will reemit the data if cb(err,pass) pass is truthy

// reduce is more tricky
// maybe we want to group the reductions or emit progress updates occasionally
// the most basic reduce just emits one 'data' event after it has recieved 'end'


var through = require('through')
var Decoder = require('string_decoder').StringDecoder

module.exports = split

//TODO pass in a function to map across the lines.

function split (matcher, mapper, options) {
  var decoder = new Decoder()
  var soFar = ''
  var maxLength = options && options.maxLength;
  if('function' === typeof matcher)
    mapper = matcher, matcher = null
  if (!matcher)
    matcher = /\r?\n/

  function emit(stream, piece) {
    if(mapper) {
      try {
        piece = mapper(piece)
      }
      catch (err) {
        return stream.emit('error', err)
      }
      if('undefined' !== typeof piece)
        stream.queue(piece)
    }
    else
      stream.queue(piece)
  }

  function next (stream, buffer) {
    var pieces = ((soFar != null ? soFar : '') + buffer).split(matcher)
    soFar = pieces.pop()

    if (maxLength && soFar.length > maxLength)
      stream.emit('error', new Error('maximum buffer reached'))

    for (var i = 0; i < pieces.length; i++) {
      var piece = pieces[i]
      emit(stream, piece)
    }
  }

  return through(function (b) {
    next(this, decoder.write(b))
  },
  function () {
    if(decoder.end)
      next(this, decoder.end())
    if(soFar != null)
      emit(this, soFar)
    this.queue(null)
  })
}


},{"string_decoder":undefined,"through":8}],7:[function(require,module,exports){
var duplexer = require('duplexer')

module.exports = function () {

  var streams = [].slice.call(arguments)
    , first = streams[0]
    , last = streams[streams.length - 1]
    , thepipe = duplexer(first, last)

  if(streams.length == 1)
    return streams[0]
  else if (!streams.length)
    throw new Error('connect called with empty args')

  //pipe all the streams together

  function recurse (streams) {
    if(streams.length < 2)
      return
    streams[0].pipe(streams[1])
    recurse(streams.slice(1))  
  }
  
  recurse(streams)
 
  function onerror () {
    var args = [].slice.call(arguments)
    args.unshift('error')
    thepipe.emit.apply(thepipe, args)
  }
  
  //es.duplex already reemits the error from the first and last stream.
  //add a listener for the inner streams in the pipeline.
  for(var i = 1; i < streams.length - 1; i ++)
    streams[i].on('error', onerror)

  return thepipe
}


},{"duplexer":2}],8:[function(require,module,exports){
var Stream = require('stream')

// through
//
// a stream that does nothing but re-emit the input.
// useful for aggregating a series of changing but not ending streams into one stream)

exports = module.exports = through
through.through = through

//create a readable writable stream.

function through (write, end, opts) {
  write = write || function (data) { this.queue(data) }
  end = end || function () { this.queue(null) }

  var ended = false, destroyed = false, buffer = [], _ended = false
  var stream = new Stream()
  stream.readable = stream.writable = true
  stream.paused = false

//  stream.autoPause   = !(opts && opts.autoPause   === false)
  stream.autoDestroy = !(opts && opts.autoDestroy === false)

  stream.write = function (data) {
    write.call(this, data)
    return !stream.paused
  }

  function drain() {
    while(buffer.length && !stream.paused) {
      var data = buffer.shift()
      if(null === data)
        return stream.emit('end')
      else
        stream.emit('data', data)
    }
  }

  stream.queue = stream.push = function (data) {
//    console.error(ended)
    if(_ended) return stream
    if(data === null) _ended = true
    buffer.push(data)
    drain()
    return stream
  }

  //this will be registered as the first 'end' listener
  //must call destroy next tick, to make sure we're after any
  //stream piped from here.
  //this is only a problem if end is not emitted synchronously.
  //a nicer way to do this is to make sure this is the last listener for 'end'

  stream.on('end', function () {
    stream.readable = false
    if(!stream.writable && stream.autoDestroy)
      process.nextTick(function () {
        stream.destroy()
      })
  })

  function _end () {
    stream.writable = false
    end.call(stream)
    if(!stream.readable && stream.autoDestroy)
      stream.destroy()
  }

  stream.end = function (data) {
    if(ended) return
    ended = true
    if(arguments.length) stream.write(data)
    _end() // will emit or queue
    return stream
  }

  stream.destroy = function () {
    if(destroyed) return
    destroyed = true
    ended = true
    buffer.length = 0
    stream.writable = stream.readable = false
    stream.emit('close')
    return stream
  }

  stream.pause = function () {
    if(stream.paused) return
    stream.paused = true
    return stream
  }

  stream.resume = function () {
    if(stream.paused) {
      stream.paused = false
      stream.emit('resume')
    }
    drain()
    //may have become paused again,
    //as drain emits 'data'.
    if(!stream.paused)
      stream.emit('drain')
    return stream
  }
  return stream
}


},{"stream":undefined}],9:[function(require,module,exports){
var through = require('through');

module.exports = ReplaceStream;
function ReplaceStream(search, replace, options) {
  var tail = '';
  var totalMatches = 0;
  var isRegex = search instanceof RegExp;

  options = options || {};
  options.limit = options.limit || Infinity;
  options.encoding = options.encoding || 'utf8';
  options.max_match_len = options.max_match_len || 100;

  var replaceFn = replace;

  replaceFn = createReplaceFn(replace, isRegex);

  var match;
  if (isRegex) {
    match = matchFromRegex(search, options)
  } else {
    match = matchFromString(search, options);
    options.max_match_len = search.length;
  }

  function write(buf) {
    var matches;
    var lastPos = 0;
    var runningMatch = '';
    var matchCount = 0;
    var rewritten = '';
    var haystack = tail + buf.toString(options.encoding);
    tail = '';

    while (totalMatches < options.limit &&
          (matches = match.exec(haystack)) !== null) {

      matchCount++;
      var before = haystack.slice(lastPos, matches.index);
      var regexMatch = matches;
      lastPos = matches.index + regexMatch[0].length;

      if (lastPos > haystack.length && regexMatch[0].length < options.max_match_len) {
        tail = regexMatch[0]
      } else {
        var dataToAppend = getDataToAppend(before,regexMatch);
        rewritten += dataToAppend;
      }
    }

    if (tail.length < 1)
      tail = haystack.slice(lastPos) > options.max_match_len ? haystack.slice(lastPos).slice(0 - options.max_match_len) : haystack.slice(lastPos)

    var dataToQueue = getDataToQueue(matchCount,haystack,rewritten,lastPos);
    this.queue(dataToQueue);
  }

  function getDataToAppend(before, match) {
    var dataToAppend = before;

    totalMatches++;

    dataToAppend += isRegex ? replaceFn.apply(this, match.concat([match.index, match.input])) : replaceFn(match[0]);

    return dataToAppend;
  }

  function getDataToQueue(matchCount, haystack, rewritten, lastPos) {
    var dataToQueue;

    if (matchCount > 0) {
      if (haystack.length > tail.length) {
        dataToQueue = rewritten + haystack.slice(lastPos, haystack.length - tail.length)
      } else {
        dataToQueue = rewritten
      }
    } else {
      dataToQueue = haystack.slice(0, haystack.length - tail.length)
    }

    return dataToQueue;
  }

  function end() {
    if (tail) this.queue(tail);
    this.queue(null);
  }

  var t = through(write, end);
  return t;
}

function createReplaceFn(replace, isRegEx) {
  var regexReplaceFunction = function () {
    var newReplace = replace;
    // ability to us $1 with captures
    // Start at 1 and end at length - 2 to avoid the match parameter and offset
    // And string parameters
    var paramLength = arguments.length - 2;
    for (var i = 1; i < paramLength; i++) {
      newReplace = newReplace.replace('$' + i, arguments[i] || '')
    }
    return newReplace;
  };

  var stringReplaceFunction = function () {
    return replace;
  };

  if (isRegEx && !(replace instanceof Function)) {
    return regexReplaceFunction;
  }

  if (!(replace instanceof Function)) {
    return stringReplaceFunction
  }

  return replace
}

function escapeRegExp(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function matchFromRegex(s, options) {
  var regex = s
  if (options.regExpOptions)
    regex = new RegExp(s.source, options.regExpOptions)

  // If there is no global flag then there can only be one match
  if (!regex.global) {
    options.limit = 1;
  }
  return regex
}

function matchFromString(s, options) {
  if (options.regExpOptions)
    return new RegExp(escapeRegExp(s), options.regExpOptions)

  return new RegExp(escapeRegExp(s), options.ignoreCase === false ? 'gm' : 'gmi')
}

},{"through":10}],10:[function(require,module,exports){
arguments[4][8][0].apply(exports,arguments)
},{"dup":8,"stream":undefined}],11:[function(require,module,exports){
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

},{"event-stream":1,"fs":undefined,"https":undefined,"path":undefined,"replacestream":9}]},{},[11])(11)
});