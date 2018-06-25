var flat = require('flat-tree')
var rle = require('bitfield-rle')
var benPager = require('@benos/benbenPager')
var thinBit = require('@benos/thinbit')

var INDEX_UPDATE_MASK = [63, 207, 243, 252]
var INDEX_ITERATE_MASK = [0, 192, 240, 252]
var DATA_ITERATE_MASK = [128, 192, 224, 240, 248, 252, 254, 255]
var DATA_UPDATE_MASK = [127, 191, 223, 239, 247, 251, 253, 254]
var MAP_PARENT_RIGHT = new Array(256)
var MAP_PARENT_LEFT = new Array(256)
var NEXT_DATA_0_BIT = new Array(256)
var NEXT_INDEX_0_BIT = new Array(256)
var TOTAL_1_BITS = new Array(256)

for (var i = 0; i < 256; i++) {
  var a = (i & (15 << 4)) >> 4
  var b = i & 15
  var nibble = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
  MAP_PARENT_RIGHT[i] = ((a === 15 ? 3 : a === 0 ? 0 : 1) << 2) | (b === 15 ? 3 : b === 0 ? 0 : 1)
  MAP_PARENT_LEFT[i] = MAP_PARENT_RIGHT[i] << 4
  NEXT_DATA_0_BIT[i] = i === 255 ? -1 : (8 - Math.ceil(Math.log(256 - i) / Math.log(2)))
  NEXT_INDEX_0_BIT[i] = i === 255 ? -1 : Math.floor(NEXT_DATA_0_BIT[i] / 2)
  TOTAL_1_BITS[i] = nibble[i >> 4] + nibble[i & 0x0F]
}

module.exports = ThinBit

function ThinBit (buffer) {
  if (!(this instanceof ThinBit)) return new ThinBit(buffer)

  this.pages = benPager(3328)

  if (buffer) {
    for (var i = 0; i < buffer.length; i += 3328) {
      this.pages.set(i / 3328, buffer.slice(i, i + 3328))
    }
  }

  this.data = thinBit({
    pageSize: 1024,
    pageOffset: 0,
    pages: this.pages,
    trackUpdates: true
  })

  this.tree = thinBit({
    pageSize: 2048,
    pageOffset: 1024,
    pages: this.pages,
    trackUpdates: true
  })

  this.index = thinBit({
    pageSize: 256,
    pageOffset: 1024 + 2048,
    pages: this.pages,
    trackUpdates: true
  })

  this.length = this.data.length
  this._iterator = flat.iterator(0)
}

ThinBit.prototype.set = function (i, value) {
  var o = i & 7
  i = (i - o) / 8
  var v = value ? this.data.getByte(i) | (128 >> o) : this.data.getByte(i) & DATA_UPDATE_MASK[o]

  if (!this.data.setByte(i, v)) return false
  this.length = this.data.length
  this._setIndex(i, v)
  return true
}

ThinBit.prototype.get = function (i) {
  return this.data.get(i)
}

ThinBit.prototype.total = function (start, end) {
  if (!start || start < 0) start = 0
  if (!end) end = this.data.length
  if (end < start) return 0
  if (end > this.data.length) {
    this._expand(end)
  }
  var o = start & 7
  var e = end & 7
  var pos = (start - o) / 8
  var last = (end - e) / 8
  var leftMask = (255 - (o ? DATA_ITERATE_MASK[o - 1] : 0))
  var rightMask = (e ? DATA_ITERATE_MASK[e - 1] : 0)
  var byte = this.data.getByte(pos)
  if (pos === last) {
    return TOTAL_1_BITS[byte & leftMask & rightMask]
  }
  var total = TOTAL_1_BITS[byte & leftMask]
  for (var i = pos + 1; i < last; i++) {
    total += TOTAL_1_BITS[this.data.getByte(i)]
  }
  total += TOTAL_1_BITS[this.data.getByte(last) & rightMask]
  return total
}

// TODO: use the index to speed this up *a lot*
ThinBit.prototype.compress = function () {
  return rle.encode(this.data.toBuffer())
}

ThinBit.prototype._setIndex = function (i, value) {
  //                    (a + b | c + d | e + f | g + h)
  // -> (a | b | c | d)                                (e | f | g | h)
  //

  var o = i & 3
  i = (i - o) / 4

  var thinBit = this.index
  var ite = this._iterator
  var start = 2 * i
  var byte = (thinBit.getByte(start) & INDEX_UPDATE_MASK[o]) | (getIndexValue(value) >> (2 * o))
  var len = thinBit.length
  var maxLength = this.pages.length * 256

  ite.seek(start)

  while (ite.index < maxLength && thinBit.setByte(ite.index, byte)) {
    if (ite.isLeft()) {
      byte = MAP_PARENT_LEFT[byte] | MAP_PARENT_RIGHT[thinBit.getByte(ite.sibling())]
    } else {
      byte = MAP_PARENT_RIGHT[byte] | MAP_PARENT_LEFT[thinBit.getByte(ite.sibling())]
    }
    ite.parent()
  }

  if (len !== thinBit.length) this._expand(len)

  return ite.index !== start
}

ThinBit.prototype._expand = function (len) {
  var roots = flat.fullRoots(2 * len)
  var thinBit = this.index
  var ite = this._iterator
  var byte = 0

  for (var i = 0; i < roots.length; i++) {
    ite.seek(roots[i])
    byte = thinBit.getByte(ite.index)

    do {
      if (ite.isLeft()) {
        byte = MAP_PARENT_LEFT[byte] | MAP_PARENT_RIGHT[thinBit.getByte(ite.sibling())]
      } else {
        byte = MAP_PARENT_RIGHT[byte] | MAP_PARENT_LEFT[thinBit.getByte(ite.sibling())]
      }
    } while (setByteNoAlloc(thinBit, ite.parent(), byte))
  }
}

function setByteNoAlloc (thinBit, i, b) {
  if (8 * i >= thinBit.length) return false
  return thinBit.setByte(i, b)
}

ThinBit.prototype.iterator = function (start, end) {
  var ite = new Iterator(this)

  ite.range(start || 0, end || this.length)
  ite.seek(0)

  return ite
}

function Iterator (thinBit) {
  this.start = 0
  this.end = 0

  this._indexEnd = 0
  this._pos = 0
  this._byte = 0
  this._thinBit = thinBit
}

Iterator.prototype.range = function (start, end) {
  this.start = start
  this.end = end
  this._indexEnd = 2 * Math.ceil(end / 32)

  if (this.end > this._thinBit.length) {
    this._thinBit._expand(this.end)
  }

  return this
}

Iterator.prototype.seek = function (offset) {
  offset += this.start
  if (offset < this.start) offset = this.start

  if (offset >= this.end) {
    this._pos = -1
    return this
  }

  var o = offset & 7

  this._pos = (offset - o) / 8
  this._byte = this._thinBit.data.getByte(this._pos) | (o ? DATA_ITERATE_MASK[o - 1] : 0)

  return this
}

Iterator.prototype.random = function () {
  var i = this.seek(Math.floor(Math.random() * (this.end - this.start))).next()
  return i === -1 ? this.seek(0).next() : i
}

Iterator.prototype.next = function () {
  if (this._pos === -1) return -1

  var dataThinBit = this._thinBit.data
  var free = NEXT_DATA_0_BIT[this._byte]

  while (free === -1) {
    this._byte = dataThinBit.getByte(++this._pos)
    free = NEXT_DATA_0_BIT[this._byte]

    if (free === -1) {
      this._pos = this._skipAhead(this._pos)
      if (this._pos === -1) return -1

      this._byte = dataThinBit.getByte(this._pos)
      free = NEXT_DATA_0_BIT[this._byte]
    }
  }

  this._byte |= DATA_ITERATE_MASK[free]

  var n = 8 * this._pos + free
  return n < this.end ? n : -1
}

Iterator.prototype.peek = function () {
  if (this._pos === -1) return -1

  var free = NEXT_DATA_0_BIT[this._byte]
  var n = 8 * this._pos + free
  return n < this.end ? n : -1
}

Iterator.prototype._skipAhead = function (start) {
  var indexThinBit = this._thinBit.index
  var treeEnd = this._indexEnd
  var ite = this._thinBit._iterator
  var o = start & 3

  ite.seek(2 * ((start - o) / 4))

  var treeByte = indexThinBit.getByte(ite.index) | INDEX_ITERATE_MASK[o]

  while (NEXT_INDEX_0_BIT[treeByte] === -1) {
    if (ite.isLeft()) {
      ite.next()
    } else {
      ite.next()
      ite.parent()
    }

    if (rightSpan(ite) >= treeEnd) {
      while (rightSpan(ite) >= treeEnd && isParent(ite)) ite.leftChild()
      if (rightSpan(ite) >= treeEnd) return -1
    }

    treeByte = indexThinBit.getByte(ite.index)
  }

  while (ite.factor > 2) {
    if (NEXT_INDEX_0_BIT[treeByte] < 2) ite.leftChild()
    else ite.rightChild()

    treeByte = indexThinBit.getByte(ite.index)
  }

  var free = NEXT_INDEX_0_BIT[treeByte]
  if (free === -1) free = 4

  var next = ite.index * 2 + free

  return next <= start ? start + 1 : next
}

function rightSpan (ite) {
  return ite.index + ite.factor / 2 - 1
}

function isParent (ite) {
  return ite.index & 1
}

function getIndexValue (n) {
  switch (n) {
    case 255: return 192
    case 0: return 0
    default: return 64
  }
}
