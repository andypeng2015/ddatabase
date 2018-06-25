var protocol = require('@ddatabase/protocol')
var thinBit = require('@benos/thinbit')
var set = require('unordered-set')
var rle = require('thinBit-rle')

module.exports = replicate

function replicate (ddb, opts) {
  var stream = opts.stream

  if (!stream) {
    if (!opts.expectedDdbs) opts.expectedDdbs = 1
    if (!opts.id) opts.id = ddb.id
    stream = protocol(opts)
  }

  ddb.ready(function (err) {
    if (err) return stream.destroy(err)
    if (stream.destroyed) return

    var peer = new Peer(ddb, opts)
    peer.ddb = ddb
    peer.stream = stream.ddb(ddb.key, {peer: peer})

    peer.remoteId = stream.remoteId
    stream.setMaxListeners(0)
    stream.on('handshake', function () {
      peer.remoteId = stream.remoteId
    })

    // stream might get destroyed on ddb init in case of conf errors
    if (stream.destroyed) return

    peer.ready()
  })

  return stream
}

function Peer (ddb, opts) {
  this.ddb = ddb
  this.stream = null // set by replicate just after creation
  this.remoteId = null
  this.remoteBitfield = null
  this.remoteLength = 0
  this.remoteWant = false
  this.live = !!opts.live
  this.thin = ddb.thin

  this.remoteDownloading = true
  this.downloading = typeof opts.download === 'boolean' ? opts.download : !ddb.writable
  this.uploading = true

  this.maxRequests = opts.maxRequests || ddb.maxRequests || 16
  this.inflightRequests = []

  this._index = -1
  this._lastBytes = 0
  this._first = true
  this._closed = false
  this._destroyed = false
  this._defaultDownloading = this.downloading
}

Peer.prototype.onwant = function () {
  // TODO: reply to the actual want context
  this.remoteWant = true
  var rle = this.ddb.thinBit.compress()
  this.stream.have({start: 0, thinBit: rle})
}

Peer.prototype.ondata = function (data) {
  var self = this

  // Ignore unrequested messages unless we allow push
  // TODO: would be better to check if the byte range was requested instead, but this works fine
  var allowPush = this.ddb.allowPush || !data.value
  if (!allowPush && !this.ddb._reserved.get(data.index)) {
    // If we do not have this block, send back unhave message for this index,
    // to let the remote know we rejected it.
    // TODO: we might want to have some "unwanted push" threshold to punish spammers
    if (!self.ddb.thinBit.get(data.index)) self.unhave({start: data.index})
    self._clear(data.index, !data.value)
    return
  }

  this.ddb._putBuffer(data.index, data.value, data, this, function (err) {
    if (err) return self.destroy(err)
    self._clear(data.index, !data.value)
  })
}

Peer.prototype._clear = function (index, hash) {
  // TODO: optimize me (no splice and do not run through all ...)
  for (var i = 0; i < this.inflightRequests.length; i++) {
    if (this.inflightRequests[i].index === index) {
      this.inflightRequests.splice(i, 1)
      i--
    }
  }

  this.ddb._reserved.set(index, false)
  // TODO: only update all if we have overlapping selections
  this.ddb._updatePeers()
}

Peer.prototype.onrequest = function (request) {
  if (request.bytes) return this._onbytes(request)

  var self = this
  var opts = {digest: request.nodes, hash: request.hash}

  this.ddb.proof(request.index, opts, onproof)

  function onproof (err, proof) {
    if (err) return self.destroy(err)
    if (request.hash) onvalue(null, null)
    else if (self.ddb.thinBit.get(request.index)) self.ddb._getBuffer(request.index, onvalue)

    function onvalue (err, value) {
      if (err) return self.destroy(err)

      if (!self.remoteBitfield) self.remoteBitfield = thinBit()

      if (value) {
        if (!self.remoteBitfield.set(request.index, true)) return
        self.ddb.emit('upload', request.index, value, self)
      } else {
        if (self.remoteBitfield.get(request.index)) return
      }

      if (request.index + 1 > self.remoteLength) {
        self.remoteLength = request.index + 1
        self._updateEnd()
      }

      self.stream.data({
        index: request.index,
        value: value,
        nodes: proof.nodes,
        signature: proof.signature
      })
    }
  }
}

Peer.prototype._onbytes = function (request) {
  var self = this

  this.ddb.seek(request.bytes, {wait: false}, function (err, index) {
    if (err) {
      request.bytes = 0
      self.onrequest(request)
      return
    }

    // quick'n'dirty filter for parallel bytes requests
    // it does not matter that this doesn't catch ALL parallel requests - just a bandwidth optimization
    if (self._lastBytes === request.bytes) return
    self._lastBytes = request.bytes

    request.bytes = 0
    request.index = index
    request.nodes = 0

    self.onrequest(request)
  })
}

Peer.prototype.ontick = function () {
  if (!this.inflightRequests.length) return

  var first = this.inflightRequests[0]
  if (--first.tick) return

  if (first.hash ? this.ddb.tree.get(2 * first.index) : this.ddb.thinBit.get(first.index)) {
    // prob a bytes response
    this.inflightRequests.shift()
    this.ddb._reserved.set(first.index, false)
    return
  }

  this.destroy(new Error('Request timeout'))
}

Peer.prototype.onhave = function (have) {
  var updated = this._first
  if (this._first) this._first = false

  if (have.thinBit) { // TODO: handle start !== 0
    this.remoteBitfield = thinBit(rle.decode(have.thinBit))
    if (this.remoteBitfield.length > this.remoteLength) {
      this.remoteLength = this.remoteBitfield.length
      while (this.remoteLength && !this.remoteBitfield.get(this.remoteLength - 1)) this.remoteLength--
      updated = true
    }
  } else {
    if (!this.remoteBitfield) this.remoteBitfield = thinBit()
    // TODO: if len > something simply copy a 0b1111... buffer to the thinBit

    var start = have.start
    var len = have.length || 1

    while (len--) this.remoteBitfield.set(start++, true)
    if (start > this.remoteLength) {
      this.remoteLength = start
      updated = true
    }
  }

  if (updated) {
    this.ddb.emit('remote-update', this)
  }

  this._updateEnd()
  this.update()
}

Peer.prototype._updateEnd = function () {
  if (this.live || this.ddb.thin || !this.ddb._selections.length) return

  var sel = this.ddb._selections[0]
  var remoteLength = this.ddb.length || -1

  for (var i = 0; i < this.ddb.peers.length; i++) {
    if (this.ddb.peers[i].remoteLength > remoteLength) {
      remoteLength = this.ddb.peers[i].remoteLength
    }
  }

  sel.end = remoteLength
}

Peer.prototype.oninfo = function (info) {
  this.remoteDownloading = info.downloading
  if (info.downloading || this.live) return
  this.update()
  if (this.ddb._selections.length && this.downloading) return
  this.end()
}

Peer.prototype.onunhave = function (unhave) {
  if (!this.remoteBitfield) return

  var start = unhave.start
  var len = unhave.length || 1

  while (len--) this.remoteBitfield.set(start++, false)
}

Peer.prototype.onunwant =
Peer.prototype.oncancel = function () {
  // TODO: impl all of me
}

Peer.prototype.onclose = function () {
  this.destroy()
}

Peer.prototype.have = function (have) { // called by ddb
  if (this.stream && this.remoteWant) this.stream.have(have)
}

Peer.prototype.unhave = function (unhave) { // called by ddb
  if (this.stream && this.remoteWant) this.stream.unhave(unhave)
}

Peer.prototype.haveBytes = function (bytes) { // called by ddb
  for (var i = 0; i < this.inflightRequests.length; i++) {
    if (this.inflightRequests[i].bytes === bytes) {
      this.ddb._reserved.set(this.inflightRequests[i].index, false)
      this.inflightRequests.splice(i, 1)
      i--
    }
  }

  this.update()
}

Peer.prototype.update = function () {
  // do nothing
  while (this._update()) {}
}

Peer.prototype._update = function () {
  // should return true if mutated false if not
  if (!this.downloading || !this.remoteBitfield) return false

  var selections = this.ddb._selections
  var waiting = this.ddb._waiting
  var wlen = waiting.length
  var slen = selections.length
  var inflight = this.inflightRequests.length
  var offset = 0
  var i = 0

  // TODO: less duplicate code here
  // TODO: re-add priority levels

  while (inflight < this.maxRequests) {
    offset = Math.floor(Math.random() * waiting.length)

    for (i = 0; i < waiting.length; i++) {
      var w = waiting[offset++]
      if (offset === waiting.length) offset = 0

      this._downloadWaiting(w)
      if (waiting.length !== wlen) return true // mutated
      if (this.inflightRequests.length >= this.maxRequests) return false
    }
    if (inflight === this.inflightRequests.length) break
    inflight = this.inflightRequests.length
  }

  while (inflight < this.maxRequests) {
    offset = Math.floor(Math.random() * selections.length)

    for (i = 0; i < selections.length; i++) {
      var s = selections[offset++]
      if (offset === selections.length) offset = 0

      if (!s.iterator) s.iterator = this.ddb.thinBit.iterator(s.start, s.end)
      this._downloadRange(s)
      if (selections.length !== slen) return true // mutated
      if (this.inflightRequests.length >= this.maxRequests) return false
    }

    if (inflight === this.inflightRequests.length) return false
    inflight = this.inflightRequests.length
  }

  return false
}

Peer.prototype.ready = function () {
  set.add(this.ddb.peers, this)
  this.stream.want({start: 0}) // TODO: don't just subscribe to *EVERYTHING* hehe
  this.ddb.emit('peer-add', this)
}

Peer.prototype.end = function () {
  if (!this.downloading && !this.remoteDownloading && !this.live) {
    if (!this._defaultDownloading) {
      this.stream.info({downloading: false, uploading: false})
    }
    this._close()
    return
  }
  if (!this._closed) {
    this._closed = true
    this.downloading = false
    this.stream.info({downloading: false, uploading: true})
  } else {
    if (!this.live) this._close()
  }
}

Peer.prototype._close = function () {
  if (this._index === -1) return
  if (!this._destroyed) {
    this.stream.close()
    this._destroyed = true
  }
  set.remove(this.ddb.peers, this)
  this._index = -1
  for (var i = 0; i < this.inflightRequests.length; i++) {
    this.ddb._reserved.set(this.inflightRequests[i].index, false)
  }
  this._updateEnd()
  this.remoteWant = false
  this.ddb._updatePeers()
  this.ddb.emit('peer-remove', this)
}

Peer.prototype.destroy = function (err) {
  if (this._index === -1 || this._destroyed) return
  this.stream.destroy(err)
  this._destroyed = true
  this._close()
}

Peer.prototype._downloadWaiting = function (wait) {
  if (!wait.bytes) {
    if (!this.remoteBitfield.get(wait.index) || !this.ddb._reserved.set(wait.index, true)) return
    this._request(wait.index, 0, false)
    return
  }

  this._downloadRange(wait)
}

Peer.prototype._downloadRange = function (range) {
  if (!range.iterator) range.iterator = this.ddb.thinBit.iterator(range.start, range.end)

  var reserved = this.ddb._reserved
  var ite = range.iterator
  var wantedEnd = Math.min(range.end === -1 ? this.remoteLength : range.end, this.remoteLength)

  if (ite.end !== wantedEnd) ite.range(range.start, wantedEnd)

  var i = range.linear ? ite.next() : ite.random()
  var reset = false
  var start = i

  if (i === -1) {
    if (!range.bytes && ite.seek(0).next() === -1 && (range.end > -1 && this.remoteLength >= range.end)) {
      set.remove(this.ddb._selections, range)
      range.callback(null)
      if (!this.live && !this.thin && !this.ddb._selections.length) this.end()
    }
    return
  }

  while (!this.remoteBitfield.get(i) || (range.hash && this.ddb.tree.get(2 * i)) || !reserved.set(i, true)) {
    i = ite.next()
    reset = true

    if (i > -1) {
      // check this index
      continue
    }

    if (!range.linear && start !== 0) {
      // retry from the beginning since we are iterating randomly and started !== 0
      i = ite.seek(0).next()
      start = 0
      continue
    }

    // we have checked all indexes.
    // if we are looking for hashes we should check if we have all now (first check only checks blocks)
    if (range.hash) {
      // quick'n'dirty check if have all hashes - can be optimized be checking only tree roots
      // but we don't really request long ranges of hashes so yolo
      for (var j = range.start; j < wantedEnd; j++) {
        if (!this.ddb.tree.get(2 * j)) return
      }
      if (!range.bytes) {
        set.remove(this.ddb._selections, range)
        range.callback(null)
      }
    }

    // exit the update loop - nothing to do
    return
  }

  if (reset) ite.seek(0)

  this._request(i, range.bytes || 0, range.hash)
}

Peer.prototype._request = function (index, bytes, hash) {
  var request = {
    tick: 6,
    bytes: bytes,
    index: index,
    hash: hash,
    nodes: this.ddb.digest(index)
  }

  this.inflightRequests.push(request)
  this.stream.request(request)
}
