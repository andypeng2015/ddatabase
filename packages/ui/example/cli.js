#!/usr/bin/env node

var stats = require('./server.js')
var http = require('http')
var flockRevelation = require('@flockcore/revelation')
var minimist = require('minimist')

var argv = minimist(process.argv.slice(2), {
  alias: {port: 'p', '@ddrive/core': 'd', wait: 'w'},
  boolean: ['@ddrive/core']
})

var ddatabase = require('@ddatabase/core')
var ddrive = require('@ddrive/core')
var dwRem = require('@dwcore/rem')

var key = argv._[0]
if (!key) {
  console.error(
    `Usage: node cli [--port=<port>] [--ddrive] \n` +
    `          [--wait=<seconds>] <key>\n`
  )
  process.exit(1)
}

var target = argv.ddrive ? ddrive(dwRem, key) : ddatabase(dwRem, key)

var server = http.createServer(stats(target))

server.on('listening', function () {
  target.ready(function () {
    console.log('Ddb/vault:', target.key.toString('hex'))
    console.log('Stats listening on port ' + server.address().port)

    if (argv.wait) setTimeout(join, Number(argv.wait) * 1000)
    else join()
  })
})

server.listen(argv.port || process.env.PORT || 10000)
server.once('error', function () {
  server.listen(0)
})

function join () {
  var sw = flockRevelation(target)
  sw.on('connection', function (peer, type) {
    console.log('connected to', sw.connections.length, 'peers')
    peer.on('close', function () {
      console.log('peer disconnected')
    })
  })
}
