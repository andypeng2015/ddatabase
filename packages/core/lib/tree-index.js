var flat = require('flat-tree')
var thinBit = require('@benos/thinbit')

module.exports = DdbTreeIdx

function DdbTreeIdx (bits) {
  if (!(this instanceof DdbTreeIdx)) return new DdbTreeIdx(bits)
  this.thinBit = bits || thinBit()
}

DdbTreeIdx.prototype.proof = function (index, opts) {
  if (!opts) opts = {}

  var nodes = []
  var remoteTree = opts.tree || new DdbTreeIdx()
  var digest = opts.digest || 0

  if (!this.get(index)) return null
  if (opts.hash) nodes.push(index) // always return hash - no matter what the digest says
  if (digest === 1) return {nodes: nodes, verifiedBy: 0}

  var roots = null
  var sibling = index
  var next = index
  var hasRoot = digest & 1
  digest = rightShift(digest)

  while (digest) {
    if (digest === 1 && hasRoot) {
      if (this.get(next)) remoteTree.set(next)

      // having a root implies having prev roots as well
      // TODO: this can be optimized away be only sending "newer" roots,
      // when sending roots
      if (flat.sibling(next) < next) next = flat.sibling(next)
      roots = flat.fullRoots(flat.rightSpan(next) + 2)
      for (var i = 0; i < roots.length; i++) {
        if (this.get(roots[i])) remoteTree.set(roots[i])
      }
      break
    }

    sibling = flat.sibling(next)
    if (digest & 1) {
      if (this.get(sibling)) remoteTree.set(sibling)
    }
    next = flat.parent(next)
    digest = rightShift(digest)
  }

  next = index

  while (!remoteTree.get(next)) {
    sibling = flat.sibling(next)
    if (!this.get(sibling)) {
      // next is a local root
      var verifiedBy = this.verifiedBy(next)
      addFullRoots(verifiedBy, nodes, next, remoteTree)
      return {nodes: nodes, verifiedBy: verifiedBy}
    } else {
      if (!remoteTree.get(sibling)) nodes.push(sibling)
    }

    next = flat.parent(next)
  }

  return {nodes: nodes, verifiedBy: 0}
}

DdbTreeIdx.prototype.digest = function (index) {
  if (this.get(index)) return 1

  var digest = 0
  var next = flat.sibling(index)
  var max = Math.max(next + 2, this.thinBit.length) // TODO: make this less ... hacky

  var bit = 2
  var depth = flat.depth(index)
  var parent = flat.parent(next, depth++)

  while (flat.rightSpan(next) < max || flat.leftSpan(parent) > 0) {
    if (this.get(next)) {
      digest |= bit
    }
    if (this.get(parent)) {
      digest |= (2 * bit + 1)
      if (digest + 1 === 4 * bit) return 1
      return digest
    }
    next = flat.sibling(parent)
    parent = flat.parent(next, depth++)
    bit *= 2
  }

  return digest
}

DdbTreeIdx.prototype.blocks = function () {
  var top = 0
  var next = 0
  var max = this.thinBit.length

  while (flat.rightSpan(next) < max) {
    next = flat.parent(next)
    if (this.get(next)) top = next
  }

  return (this.get(top) ? this.verifiedBy(top) : 0) / 2
}

DdbTreeIdx.prototype.roots = function () {
  return flat.fullRoots(2 * this.blocks())
}

DdbTreeIdx.prototype.verifiedBy = function (index, nodes) {
  var hasIndex = this.get(index)
  if (!hasIndex) return 0

  // find root of current tree

  var depth = flat.depth(index)
  var top = index
  var parent = flat.parent(top, depth++)
  while (this.get(parent) && this.get(flat.sibling(top))) {
    top = parent
    parent = flat.parent(top, depth++)
  }

  // expand right down

  depth--
  while (depth) {
    top = flat.leftChild(flat.index(depth, flat.offset(top, depth) + 1), depth)
    depth--

    while (!this.get(top) && depth) top = flat.leftChild(top, depth--)
    if (nodes && this.get(top)) nodes.push(top)
  }

  return this.get(top) ? top + 2 : top
}

DdbTreeIdx.prototype.get = function (index) {
  return this.thinBit.get(index)
}

DdbTreeIdx.prototype.set = function (index) {
  if (!this.thinBit.set(index, true)) return false
  while (this.thinBit.get(flat.sibling(index))) {
    index = flat.parent(index)
    if (!this.thinBit.set(index, true)) break
  }
  return true
}

function rightShift (n) {
  return (n - (n & 1)) / 2
}

function addFullRoots (verifiedBy, nodes, root, remoteTree) {
  var roots = flat.fullRoots(verifiedBy)
  for (var i = 0; i < roots.length; i++) {
    if (roots[i] !== root && !remoteTree.get(roots[i])) nodes.push(roots[i])
  }
}
