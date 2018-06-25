var ddatabase = require('./')

var ddb = ddatabase('./tmp', {valueEncoding: 'json'})

ddb.append({
  hello: 'world'
})

ddb.append({
  hej: 'verden'
})

ddb.append({
  hola: 'mundo'
})

ddb.flush(function () {
  console.log('Appended 3 more blocks, %d in total (%d bytes)\n', ddb.length, ddb.byteLength)

  ddb.createReadStream()
    .on('data', console.log)
    .on('end', console.log.bind(console, '\n(end)'))
})
