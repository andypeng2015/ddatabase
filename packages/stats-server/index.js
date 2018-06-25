module.exports = function (ddb, res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')

  var vault = ddb.metadata ? ddb : null

  if (vault) {
    ddb = vault.metadata
  }

  var key = ddb.key.toString('hex')

  send(res, {type: 'key', key: key})

  ddb.ready(function () {
    if (vault) track(ddb, 'metadata')
    else track(ddb, null)
  })

  send(res, {type: 'peer-update', peers: ddb.peers.length})

  ddb.on('peer-add', onpeeradd)
  ddb.on('peer-remove', onpeerremove)

  if (vault) {
    if (vault.content) {
      track(vault.content, 'content')
    } else {
      vault.on('content', function () {
        track(vault.content, 'content')
      })
    }
  }

  res.on('close', function () {
    ddb.removeListener('peer-add', onpeeradd)
    ddb.removeListener('peer-remove', onpeerremove)
  })

  function track (ddb, name) {
    send(res, {type: 'ddb', name: name, key: key, blocks: bitfield(ddb), bytes: ddb.byteLength})

    ddb.on('update', onupdate)
    ddb.on('append', onupdate)
    ddb.on('download', ondownload)
    ddb.on('upload', onupload)

    res.on('close', function () {
      ddb.removeListener('update', onupdate)
      ddb.removeListener('download', ondownload)
      ddb.removeListener('upload', onupload)
    })

    function onupdate () {
      send(res, {type: 'update', name: name, key: key, blocks: bitfield(ddb), bytes: ddb.byteLength})
    }

    function ondownload (index, data) {
      send(res, {type: 'download', name: name, index: index, bytes: data.length})
    }

    function onupload (index, data) {
      send(res, {type: 'upload', name: name, index: index, bytes: data.length})
    }
  }

  function onpeeradd () {
    send(res, {type: 'peer-update', peers: ddb.peers.length})
  }

  function onpeerremove () {
    send(res, {type: 'peer-update', peers: ddb.peers.length})
  }

  function bitfield (ddb) {
    var list = []
    for (var i = 0; i < ddb.length; i++) {
      list.push(ddb.has(i))
    }
    return list
  }

  function send (res, message) {
    res.write('data: ' + JSON.stringify(message) + '\n\n')
  }
}
