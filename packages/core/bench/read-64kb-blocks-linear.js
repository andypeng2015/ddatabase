var path = require('path')
var ddatabase = require('../')

var ddb = ddatabase(path.join(__dirname, 'cores/64kb'))

var then = Date.now()
var size = 0
var cnt = 0

ddb.createReadStream()
  .on('data', function (data) {
    size += data.length
    cnt++
  })
  .on('end', function () {
    console.log(Math.floor(1000 * size / (Date.now() - then)) + ' bytes/s')
    console.log(Math.floor(1000 * cnt / (Date.now() - then)) + ' blocks/s')
  })
