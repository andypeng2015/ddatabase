var events = require('events')
var inherits = require('inherits')
var varint = require('varint')
var messages = require('./messages')
var bufferAlloc = require('buffer-alloc-unsafe')

module.exports = Ddb

function Ddb (stream) {
  if (!(this instanceof Ddb)) return new Ddb(stream)
  events.EventEmitter.call(this)

  this.key = null
  this.revelationKey = null
  this.stream = stream
  this.peer = null // support a peer object to avoid event emitter + closures overhead

  this.id = -1
  this.remoteId = -1
  this.header = 0
  this.headerLength = 0
  this.closed = false

  this._buffer = []
}

inherits(Ddb, events.EventEmitter)

Ddb.prototype.handshake = function (message) {
  return this._send(1, messages.Handshake, message)
}

Ddb.prototype.info = function (message) {
  return this._send(2, messages.Info, message)
}

Ddb.prototype.have = function (message) {
  return this._send(3, messages.Have, message)
}

Ddb.prototype.unhave = function (message) {
  return this._send(4, messages.Unhave, message)
}

Ddb.prototype.want = function (message) {
  return this._send(5, messages.Want, message)
}

Ddb.prototype.unwant = function (message) {
  return this._send(6, messages.Unwant, message)
}

Ddb.prototype.request = function (message) {
  return this._send(7, messages.Request, message)
}

Ddb.prototype.cancel = function (message) {
  return this._send(8, messages.Cancel, message)
}

Ddb.prototype.data = function (message) {
  return this._send(9, messages.Data, message)
}

Ddb.prototype.extension = function (type, message) {
  var id = this.stream.extensions.indexOf(type)
  if (id === -1) return false

  var header = this.header | 15
  var len = this.headerLength + varint.encodingLength(id) + message.length
  var box = bufferAlloc(varint.encodingLength(len) + len)
  var offset = 0

  varint.encode(len, box, offset)
  offset += varint.encode.bytes

  varint.encode(header, box, offset)
  offset += varint.encode.bytes

  varint.encode(id, box, offset)
  offset += varint.encode.bytes

  message.copy(box, offset)
  return this.stream._push(box)
}

Ddb.prototype.remoteSupports = function (name) {
  return this.stream.remoteSupports(name)
}

Ddb.prototype.destroy = function (err) {
  this.stream.destroy(err)
}

Ddb.prototype.close = function () {
  var i = this.stream.ddbs.indexOf(this)

  if (i > -1) {
    this.stream.ddbs[i] = this.stream.ddbs[this.stream.ddbs.length - 1]
    this.stream.ddbs.pop()
    this.stream._localDdbs[this.id] = null
    this.id = -1

    if (this.stream.destroyed) return
    if (this.stream.expectedDdbs <= 0 || --this.stream.expectedDdbs) return

    this.stream._prefinalize()
  }
}

Ddb.prototype._onclose = function () {
  if (this.closed) return
  this.closed = true

  if (!this.stream.destroyed) {
    this.close()
    if (this.remoteId > -1) this.stream._remoteDdbs[this.remoteId] = null
    var hex = this.revelationKey.toString('hex')
    if (this.stream._ddbs[hex] === this) delete this.stream._ddbs[hex]
  }

  if (this.peer) this.peer.onclose()
  else this.emit('close')
}

Ddb.prototype._resume = function () {
  var self = this
  process.nextTick(resume)

  function resume () {
    while (self._buffer.length) {
      var next = self._buffer.shift()
      self._emit(next.type, next.message)
    }
    self._buffer = null
  }
}

Ddb.prototype._onextension = function (data, start, end) {
  if (end <= start) return

  var id = varint.decode(data, start)
  var r = this.stream.remoteExtensions
  var localId = !r || id >= r.length ? -1 : r[id]

  if (localId === -1) return

  var message = data.slice(start + varint.decode.bytes, end)
  var name = this.stream.extensions[localId]

  if (this.peer && this.peer.onextension) this.peer.onextension(name, message)
  else this.emit('extension', name, message)
}

Ddb.prototype._onmessage = function (type, data, start, end) {
  var message = decodeMessage(type, data, start, end)
  if (!message || this.closed) return

  if (type === 1) return this.stream._onhandshake(message)

  if (!this._buffer) {
    this._emit(type, message)
    return
  }

  if (this._buffer.length > 16) {
    this.destroy(new Error('Remote sent too many messages on an unopened ddb'))
    return
  }

  this._buffer.push({type: type, message: message})
}

Ddb.prototype._emit = function (type, message) {
  if (this.peer) {
    switch (type) {
      case 2: return this.peer.oninfo(message)
      case 3: return this.peer.onhave(message)
      case 4: return this.peer.onunhave(message)
      case 5: return this.peer.onwant(message)
      case 6: return this.peer.onunwant(message)
      case 7: return this.peer.onrequest(message)
      case 8: return this.peer.oncancel(message)
      case 9: return this.peer.ondata(message)
    }
  } else {
    switch (type) {
      case 2: return this.emit('info', message)
      case 3: return this.emit('have', message)
      case 4: return this.emit('unhave', message)
      case 5: return this.emit('want', message)
      case 6: return this.emit('unwant', message)
      case 7: return this.emit('request', message)
      case 8: return this.emit('cancel', message)
      case 9: return this.emit('data', message)
    }
  }
}

Ddb.prototype._send = function (type, enc, message) {
  var header = this.header | type
  var len = this.headerLength + enc.encodingLength(message)
  var box = bufferAlloc(varint.encodingLength(len) + len)
  var offset = 0

  varint.encode(len, box, offset)
  offset += varint.encode.bytes

  varint.encode(header, box, offset)
  offset += varint.encode.bytes

  enc.encode(message, box, offset)

  return this.stream._push(box)
}

function decodeMessage (type, data, start, end) {
  switch (type) {
    case 1: return decode(messages.Handshake, data, start, end)
    case 2: return decode(messages.Info, data, start, end)
    case 3: return decode(messages.Have, data, start, end)
    case 4: return decode(messages.Unhave, data, start, end)
    case 5: return decode(messages.Want, data, start, end)
    case 6: return decode(messages.Unwant, data, start, end)
    case 7: return decode(messages.Request, data, start, end)
    case 8: return decode(messages.Cancel, data, start, end)
    case 9: return decode(messages.Data, data, start, end)
  }
}

function decode (enc, data, start, end) {
  try {
    return enc.decode(data, start, end)
  } catch (err) {
    return null
  }
}
