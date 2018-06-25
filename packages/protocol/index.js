var stream = require('readable-stream')
var inherits = require('inherits')
var varint = require('varint')
var sodium = require('sodium-universal')
var indexOf = require('sorted-indexof')
var ddb = require('./ddb')
var messages = require('./messages')
var bufferAlloc = require('buffer-alloc-unsafe')
var bufferFrom = require('buffer-from')

module.exports = Protocol

function Protocol (opts) {
  if (!(this instanceof Protocol)) return new Protocol(opts)
  if (!opts) opts = {}

  stream.Duplex.call(this)
  var self = this

  this.id = opts.id || randomBytes(32)
  this.live = !!opts.live
  this.ack = !!opts.ack
  this.userData = opts.userData || null
  this.remoteId = null
  this.remoteLive = false
  this.remoteUserData = null

  this.destroyed = false
  this.encrypted = opts.encrypt !== false
  this.key = null
  this.revelationKey = null
  this.remoteRevelationKey = null
  this.ddbs = []
  this.expectedDdbs = opts.expectedDdbs || 0
  this.extensions = opts.extensions || []
  this.remoteExtensions = null

  this._localDdbs = []
  this._remoteDdbs = []
  this._ddbs = {}

  this._nonce = null
  this._remoteNonce = null
  this._xor = null
  this._remoteXor = null
  this._needsKey = false
  this._length = bufferAlloc(varint.encodingLength(8388608))
  this._missing = 0
  this._buf = null
  this._pointer = 0
  this._data = null
  this._start = 0
  this._cb = null
  this._interval = null
  this._keepAlive = 0
  this._remoteKeepAlive = 0
  this._maybeFinalize = maybeFinalize

  if (opts.timeout !== 0 && opts.timeout !== false) this.setTimeout(opts.timeout || 5000, this._ontimeout)
  this.on('finish', this.finalize)

  function maybeFinalize (err) {
    if (err) return self.destroy(err)
    if (!self.expectedDdbs) self.finalize()
  }
}

inherits(Protocol, stream.Duplex)

Protocol.prototype._prefinalize = function () {
  if (!this.emit('prefinalize', this._maybeFinalize)) this.finalize()
}

Protocol.prototype.setTimeout = function (ms, ontimeout) {
  if (this.destroyed) return
  if (ontimeout) this.once('timeout', ontimeout)

  var self = this

  this._keepAlive = 0
  this._remoteKeepAlive = 0

  clearInterval(this._interval)
  if (!ms) return

  this._interval = setInterval(kick, (ms / 4) | 0)
  if (this._interval.unref) this._interval.unref()

  function kick () {
    self._kick()
  }
}

Protocol.prototype.ddb = function (key, opts) {
  if (this.destroyed) return null
  if (!opts) opts = {}

  var dk = opts.revelationKey || revelationKey(key)
  var ch = this._ddb(dk)

  if (ch.id > -1) {
    if (opts.peer) ch.peer = opts.peer
    return ch
  }

  if (this._localDdbs.length >= 128) {
    this._tooManyDdbs()
    return null
  }

  ch.id = this._localDdbs.push(ch) - 1
  ch.header = ch.id << 4
  ch.headerLength = varint.encodingLength(ch.header)
  ch.key = key
  ch.revelationKey = dk
  if (opts.peer) ch.peer = opts.peer

  this.ddbs.push(ch)

  var first = !this.key
  var ddb = {
    revelationKey: dk,
    nonce: null
  }

  if (first) {
    this.key = key
    this.revelationKey = dk

    if (!this._sameKey()) return null

    if (this.encrypted) {
      ddb.nonce = this._nonce = randomBytes(24)
      this._xor = sodium.crypto_stream_xor_instance(this._nonce, this.key)
      if (this._remoteNonce) {
        this._remoteXor = sodium.crypto_stream_xor_instance(this._remoteNonce, this.key)
      }
    }

    if (this._needsKey) {
      this._needsKey = false
      this._resume()
    }
  }

  var box = encodeDdb(ddb, ch.id)
  if (!ddb.nonce && this.encrypted) this._xor.update(box, box)
  this._keepAlive = 0
  this.push(box)

  if (this.destroyed) return null

  if (first) {
    ch.handshake({
      id: this.id,
      live: this.live,
      userData: this.userData,
      extensions: this.extensions,
      ack: this.ack
    })
  }

  if (ch._buffer.length) ch._resume()
  else ch._buffer = null

  return ch
}

Protocol.prototype._resume = function () {
  var self = this
  process.nextTick(resume)

  function resume () {
    if (!self._data) return

    var data = self._data
    var start = self._start
    var cb = self._cb

    self._data = null
    self._start = 0
    self._cb = null
    self._parse(data, start, cb)
  }
}

Protocol.prototype._kick = function () {
  if (this._remoteKeepAlive > 4) {
    clearInterval(this._interval)
    this.emit('timeout')
    return
  }

  for (var i = 0; i < this.ddbs.length; i++) {
    var ch = this.ddbs[i]
    if (ch.peer) ch.peer.ontick()
    else ch.emit('tick')
  }

  this._remoteKeepAlive++

  if (this._keepAlive > 2) {
    this.ping()
    this._keepAlive = 0
  } else {
    this._keepAlive++
  }
}

Protocol.prototype.ping = function () {
  if (!this.key) return true
  var ping = bufferFrom([0])
  if (this._xor) this._xor.update(ping, ping)
  return this.push(ping)
}

Protocol.prototype.destroy = function (err) {
  if (this.destroyed) return
  this.destroyed = true
  if (err) this.emit('error', err)
  this._close()
  this.emit('close')
}

Protocol.prototype.finalize = function () {
  if (this.destroyed) return
  this.destroyed = true
  this._close()
  this.push(null)
}

Protocol.prototype._close = function () {
  clearInterval(this._interval)

  var ddbs = this.ddbs
  this.ddbs = []
  for (var i = 0; i < ddbs.length; i++) ddbs[i]._onclose()

  if (this._xor) {
    this._xor.final()
    this._xor = null
  }
}

Protocol.prototype._read = function () {
  // do nothing, user back-pressures
}

Protocol.prototype._push = function (data) {
  if (this.destroyed) return
  this._keepAlive = 0
  if (this._xor) this._xor.update(data, data)
  return this.push(data)
}

Protocol.prototype._write = function (data, enc, cb) {
  this._remoteKeepAlive = 0
  this._parse(data, 0, cb)
}

Protocol.prototype._ddb = function (dk) {
  var hex = dk.toString('hex')
  var ch = this._ddbs[hex]
  if (ch) return ch
  ch = this._ddbs[hex] = ddb(this)
  return ch
}

Protocol.prototype.remoteSupports = function (name) {
  var i = this.extensions.indexOf(name)
  return i > -1 && !!this.remoteExtensions && this.remoteExtensions.indexOf(i) > -1
}

Protocol.prototype._onhandshake = function (handshake) {
  if (this.remoteId) return

  this.remoteId = handshake.id || randomBytes(32)
  this.remoteLive = handshake.live
  this.remoteUserData = handshake.userData
  this.remoteExtensions = indexOf(this.extensions, handshake.extensions)
  this.remoteAck = handshake.ack

  this.emit('handshake')
}

Protocol.prototype._onopen = function (id, data, start, end) {
  var ddb = decodeDdb(data, start, end)

  if (!ddb) return this._badDdb()

  if (!this.remoteRevelationKey) {
    this.remoteRevelationKey = ddb.revelationKey
    if (!this._sameKey()) return

    if (this.encrypted && !this._remoteNonce) {
      if (!ddb.nonce) {
        this.destroy(new Error('Remote did not include a nonce'))
        return
      }
      this._remoteNonce = ddb.nonce
    }

    if (this.encrypted && this.key && !this._remoteXor) {
      this._remoteXor = sodium.crypto_stream_xor_instance(this._remoteNonce, this.key)
    }
  }

  this._remoteDdbs[id] = this._ddb(ddb.revelationKey)
  ddb.remoteId = id

  this.emit('ddb', ddb.revelationKey)
}

Protocol.prototype._onmessage = function (data, start, end) {
  if (end - start < 2) return

  var header = decodeHeader(data, start)
  if (header === -1) return this.destroy(new Error('Remote sent invalid header'))

  start += varint.decode.bytes

  var id = header >> 4
  var type = header & 15

  if (id >= 128) return this._tooManyDdbs()
  while (this._remoteDdbs.length < id) this._remoteDdbs.push(null)

  var ch = this._remoteDdbs[id]

  if (type === 0) {
    if (ch) ch._onclose()
    return this._onopen(id, data, start, end)
  }

  if (!ch) return this._badDdb()
  if (type === 15) return ch._onextension(data, start, end)
  ch._onmessage(type, data, start, end)
}

Protocol.prototype._parse = function (data, start, cb) {
  var decrypted = !!this._remoteXor

  if (start) {
    data = data.slice(start)
    start = 0
  }

  if (this._remoteXor) this._remoteXor.update(data, data)

  while (start < data.length && !this.destroyed) {
    if (this._missing) start = this._parseMessage(data, start)
    else start = this._parseLength(data, start)

    if (this._needsKey) {
      this._data = data
      this._start = start
      this._cb = cb
      return
    }

    if (!decrypted && this._remoteXor) {
      return this._parse(data, start, cb)
    }
  }

  cb()
}

Protocol.prototype._parseMessage = function (data, start) {
  var end = start + this._missing

  if (end <= data.length) {
    var ret = end

    if (this._buf) {
      data.copy(this._buf, this._pointer, start)
      data = this._buf
      start = 0
      end = data.length
      this._buf = null
    }

    this._missing = 0
    this._pointer = 0
    if (this.encrypted && !this.key) this._needsKey = true
    this._onmessage(data, start, end)

    return ret
  }

  if (!this._buf) {
    this._buf = bufferAlloc(this._missing)
    this._pointer = 0
  }

  var rem = data.length - start

  data.copy(this._buf, this._pointer, start)
  this._pointer += rem
  this._missing -= rem

  return data.length
}

Protocol.prototype._parseLength = function (data, start) {
  while (!this._missing && start < data.length) {
    var byte = this._length[this._pointer++] = data[start++]

    if (!(byte & 0x80)) {
      this._missing = varint.decode(this._length)
      this._pointer = 0
      if (this._missing > 8388608) return this._tooBig(data.length)
      return start
    }

    if (this._pointer >= this._length.length) return this._tooBig(data.length)
  }

  return start
}

Protocol.prototype._sameKey = function () {
  if (!this.revelationKey || !this.remoteRevelationKey) return true
  if (this.remoteRevelationKey.toString('hex') === this.revelationKey.toString('hex')) return true
  this.destroy(new Error('First shared ddatabase must be the same'))
  return false
}

Protocol.prototype._tooManyDdbs = function () {
  this.destroy(new Error('Only 128 ddbs currently supported. Open a Github issue if you need more'))
}

Protocol.prototype._tooBig = function (len) {
  this.destroy(new Error('Remote message is larger than 8MB (max allowed)'))
  return len
}

Protocol.prototype._badDdb = function () {
  this.destroy(new Error('Remote sent invalid ddb message'))
}

Protocol.prototype._ontimeout = function () {
  this.destroy(new Error('Remote timed out'))
}

function decodeHeader (data, start) {
  try {
    return varint.decode(data, start)
  } catch (err) {
    return -1
  }
}

function decodeDdb (data, start, end) {
  var ddb = null

  try {
    ddb = messages.Ddb.decode(data, start, end)
  } catch (err) {
    return null
  }

  if (ddb.revelationKey.length !== 32) return null
  if (ddb.nonce && ddb.nonce.length !== 24) return null

  return ddb
}

function encodeDdb (ddb, id) {
  var header = id << 4
  var len = varint.encodingLength(header) + messages.Ddb.encodingLength(ddb)
  var box = bufferAlloc(varint.encodingLength(len) + len)
  var offset = 0

  varint.encode(len, box, offset)
  offset += varint.encode.bytes

  varint.encode(header, box, offset)
  offset += varint.encode.bytes

  messages.Ddb.encode(ddb, box, offset)
  return box
}

function revelationKey (key) {
  var buf = bufferAlloc(32)
  sodium.crypto_generichash(buf, bufferFrom('ddatabase'), key)
  return buf
}

function randomBytes (n) {
  var buf = bufferAlloc(n)
  sodium.randombytes_buf(buf)
  return buf
}
