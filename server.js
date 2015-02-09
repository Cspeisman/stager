// Serve's a branch's build (directly from the repo) based on the subdomain of the request

// A POST to /_update will sync the repo with github and rebuild all the branches.

var fs = require('fs')
var http = require('http')
var url = require('url')
var childProcess = require('child_process')
var through = require('through2')
var mime = require('mime')
var chain = require('fun-chain')

;['PORT', 'DOMAIN' ].forEach(function(envVar){
  if (!process.env[envVar]) throw envVar + ' environment variable must be set!'
})

var server = http.createServer(chain([
  // Handle all requests during initialization
  function(next, req, res){
    fs.exists(__dirname + '/init.lock', function(exists){
      if (exists) res.end("Initializing ... (keep reloading)\n")
      else next(req, res)
    })
  }
  ,
  // Handle update/rebuild request
  function(next, req, res){
    if ('/_update' === reqPathname(req)) {
      fs.exists(__dirname + '/update.lock', function(exists){
        if (exists) return res.end("Updating ...\n")
        else {
          var cp = childProcess.spawn('./update')
          cp.stdout.pipe(res)
          cp.stderr.pipe(process.stderr)
        }
      })
    }
    else next(req, res)
  }
  ,
  // Otherwise handle serving a request for a specific file in a specific branch
  function(next, req, res){
    var branchName = branchNameFromHost(req.headers.host)
    if (!branchName) { next(req, res) ; return }

    var path = urlPathnameToSiteFilePath(reqPathname(req))
    serveBlob(branchName, path)
      .on('error', function(err) {
        if (err.pathIsntBlob) {
          var redirectUrl = reqPathname(req) + '/'
          res.writeHead(302, { 'Location' : redirectUrl })
          res.end('Redirecting to: ' + redirectUrl + '\n')
        } else {
          res.writeHead(err.pathDoesntExist ? 404 : 500)
          res.end(err.message + "\n")
        }
      })
      .on('pipe', function() {
        var type = mime.lookup(path)
        var charset = mime.charsets.lookup(type)
        res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''))
      })
      .pipe(res)
  }
  ,
  // Otherwise we got nothing
  function(next, req, res) {
    res.writeHead(404)
    res.end('Nothing here, did you use a branch name as the subdomain?\n')
  }
]))

// ---

function serveBlob(branchName, path) {
  var ts = through()
  pathType(branchName, path, function(err, type){
    if (err) {
      if (err.pathDoesntExist) {
        err = doesntExistError(path + " doesn't exist in " + branchName + " branch")
      }
      ts.emit('error', err)
    } else {
      if ('blob' === type) readBlob(branchName, path).pipe(ts)
      else ts.emit('error', isNotBlobError(
        "the " + path + " path in " + branchName + " is not a blob"))
    }
  })
  return ts
}

function pathType(branchName, path, callback) {
  var type
  var cp = childProcess.spawn(
      'git', ['cat-file', '-t', 'build-' + branchName + ':' + '_site/' + path]
    , { cwd: __dirname+'/repo' })
    .on('close', function(statusCode){
      if (0 !== statusCode) callback(doesntExistError("can't get type of non-existent path"))
      else callback(null, type)
    })
  cp.stdout.on('data', function(data) { type = data.toString().trim() }) // will only be one data evet emitted
}

function readBlob(branchName, path) {
  return childProcess.spawn(
      'git', ['cat-file', 'blob', 'build-' + branchName + ':' + '_site/' + path]
    , { cwd: __dirname+'/repo' }).stdout
}

function doesntExistError(msg) {
  var err = new Error(msg)
  err.pathDoesntExist = true
  return err
}

function isNotBlobError(msg) {
  var err = new Error(msg)
  err.pathIsntBlob = true
  return err
}

// ---

function reqPathname(req) {
  return url.parse(req.url).pathname
}

// ---

function urlPathnameToSiteFilePath(urlPathname) {
  // remove prefixed slash
  urlPathname = urlPathname.slice(1)
  // empty path maps to index.html
  if ('' === urlPathname) return 'index.html'
  // trailing slash gets index.html appended
  if ('/' === urlPathname.slice(-1)) return urlPathname + 'index.html'
  return urlPathname
}

function test_urlPathnameToSiteFilePath() {
  assert('index.html'   === urlPathnameToSiteFilePath('/'))
  assert('foo/bar' === urlPathnameToSiteFilePath('/foo/bar'))
  assert('foo/bar/index.html' === urlPathnameToSiteFilePath('/foo/bar/'))
  assert('foo/bar.jpg'  === urlPathnameToSiteFilePath('/foo/bar.jpg'))
}

// ---

function branchNameFromHost(host) {
  var name = host.replace('.' + nonBranchDomainNamePart, '')
  return host === name ? null : name
}

var nonBranchDomainNamePart = process.env.DOMAIN + '.dev'

function test_branchNameFromHost() {
  nonBranchDomainNamePart = 'example.com'
  assert('foo' === branchNameFromHost('foo.example.com'))
}

// ---

// Only run in development mode, returns the subdomains that local-tld knows about
function branchHostnames() {
  var localTldConfig = JSON.parse(
    fs.readFileSync(process.env.HOME + '/.local-tld.json')
  )[process.env.PORT]

  return localTldConfig.aliases.map(function(alias){
    return [alias, localTldConfig.name, 'dev'].join('.')
  })
}

// ---

function assert(expression) { if (!expression) throw "Boom" }

// ---

// Start server when invoked with no args
if (!module.parent && !process.argv[2]) {
  server.listen(process.env.PORT, function(){
    // If using local-tld show the hostnames that are being served
    if (process.env.USE_LOCAL_TLD) console.log('Listening on:\n' + branchHostnames().join('\n'))
    // Otherwise just show the port
    else console.log('Listening on :' + process.env.PORT)
  })
}

// Run test when invoked with "test" arg
if (!module.parent && 'test' === process.argv[2]) {
  test_urlPathnameToSiteFilePath()
  test_branchNameFromHost()

  pathType('t1', 'test_branch_one', function(err, type){
    if (err) throw err
      console.log(type)
  })
}
