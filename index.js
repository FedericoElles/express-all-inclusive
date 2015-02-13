'use strict';

var Q = require("q"),
    fs = require('fs'),
    path = require('path'),
    uglify = require("uglify-js"),
    CleanCSS = require('clean-css'),
    ngAnnotate = require("ng-annotate"),
    minify = require('html-minifier').minify;

var STATIC = {
  reload: ''+
    '<script src="//cdnjs.cloudflare.com/ajax/libs/sockjs-client/0.3.4/sockjs.min.js"></script>'+
    '<script>'+
    '    ;(function refresh () {'+
    '      var sock = new SockJS(\'http://localhost:<port>/sockreload\');'+
    '      sock.onclose = function() {'+
    '        setTimeout(function() {'+
    '          window.location.reload();'+
    '        },100);'+
    '      };'+
    '    })();'+
    '</script>'
};

var CONTENT_TYPES = {
  js: 'application/javascript',
  css: 'text/css',
  appcache: 'text/cache-manifest'
};


var _port = 5001,
    sostatic = {},
    transformer = {};

/**
 * Annotates & Minifies AngularJS files
 */
transformer.angular = function(text){
  var r =ngAnnotate(text, {
          add: true
        }).src;

  var ast = uglify.parse(r, true);
  ast.figure_out_scope();
  ast.compute_char_frequency();
  ast.mangle_names();
  //http://lisperator.net/uglifyjs/compress
  var compressor = uglify.Compressor({}); //no options yet
  ast = ast.transform(compressor);

  return ast.print_to_string();  
};

transformer.css = function(text){
  return new CleanCSS().minify(text).styles;
};

transformer.html = function(text){
  var r = minify(text, {
    //removeComments: true, //does break auto-reload
    collapseWhitespace: true,
    conservativeCollapse: true
  });
  return r.replace(/\s{2,}/g, ' ');
};

transformer.version = function(text, version){
  return text.replace('<!--version-->', version || 'v0.0.0');
};

transformer.reload = function(text){
  return text.replace('<!--reload-->', STATIC.reload.replace('<port>', _port));
};

function promiseReadFile(path){
  var deferred = Q.defer();
  fs.readFile(path, 'utf8', function (err,data) {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve({
        name: path,
        text: data
      });
    }
  });
  return deferred.promise;  
}


var _folders = []; //collect all Folder object names

/**
 * A Folder represents a static filesystem directory  
 */
function Folder(name, options){
  this._name = name;
  this._options = options;
  this._cache = {};
  _folders.push(name);
}



/**
 * Serve and cache the index.html
 *
 * options {
 *   force: <boolean> //if true, localhost will be overridden
 *   fileName: <string> //overrides file to be loaded
 * }
 */
Folder.prototype.serve = function(){
  var that = this;
  var options = arguments[arguments.length-1] || {}; 

  //if options is string, default to {fileName:string}
  if (typeof options === 'string'){
    options = {
      fileName: options
    };
  }

  var f = function(req, res){
    var fileName = options.fileName || req.path.split('/').pop() || 'index.html';
    var fileType = fileName.split('.').pop();
    if (fileName === fileType){  //default extention is html
      fileName = fileName + '.html';
      fileType = 'html';
    }
    //# Usageconsole.log('fileName', fileName, fileType);
    var key = req.hostname + '+' + req.originalUrl; //used for cache
    var isProd = (req.hostname !== 'localhost') || req.param('force');
    

    if (CONTENT_TYPES[fileType]){
      res.setHeader('Content-Type', CONTENT_TYPES[fileType]);   
    }

    //if cache available, use it!
    if (that._cache[key] && isProd){
      res.setHeader('X-Cached', 'true');   
      res.send(that._cache[key]);
      return;
    }

    promiseReadFile(path.join(__dirname, that._name, fileName)).then(function(data){
      var newData = data.text;

      if (fileType === 'html' || fileType === 'appcache'){
        newData = transformer.version(newData, that._options.version);
      }

      if (fileType === 'js' && isProd){
        newData = transformer.angular(newData);
      }

      if (fileType === 'css' && isProd){
        newData = transformer.css(newData);
      }    


      var asyncTasks = [];
      var filePath;
      //include files
      if (isProd && options.include && options.include.length){
        for (var i=0, ii= options.include.length;i<ii;i+=1){
          filePath = path.join(__dirname, that._name, options.include[i]);
          //console.log('filePath', filePath);
          asyncTasks.push(promiseReadFile(filePath));
        }
      }


      Q.allSettled(asyncTasks).then(function(data){
        //add includes to html
        if (data.length){
          var fileName, fileEnding, fileContent;
          for (var i=0, ii= data.length;i<ii;i+=1){
            if (data[i].state === 'fulfilled'){
              fileName = data[i].value.name.split(path.sep).pop();
              fileEnding = fileName.split('.').pop();
              fileContent = data[i].value.text;
              console.log('include:', fileName, fileEnding);

              switch(fileEnding){
                case 'js':
                  fileContent = transformer.angular(fileContent);
                  newData = newData.replace('<script src="'+fileName+'"></script>',
                                            '<script>' + fileContent + '</script>');
                  break;
                case 'css':
                  fileContent = transformer.css(fileContent);
                  newData = newData.replace('<link href="'+fileName+'" rel="stylesheet">', 
                                            '<style>' + fileContent + '</style>');
                  break;
              }
            }
          }
        }

        if (isProd){
          if (fileType === 'html'){
            newData = transformer.html(newData);
          }
        }

        if (isProd){
          that._cache[key] = newData;
        } else {
          if (fileType === 'html'){
            newData = transformer.reload(newData);
          }
        }
        res.setHeader('X-Cached', 'false');
        if (fileType === 'appcache' && !isProd){
          res.status(404)        // HTTP status 404: NotFound
             .send('Not found');
        } else {   
          res.send(newData);
        }
      }).fail(function(err){
        res.send({status: 'ERROR', reason: err});
      });


    }).fail(function(err){
      res.send({status: 'ERROR', reason: err});
    });
  };

  if (arguments.length === 3){
    //last argument is options
    f(arguments[0], arguments[1]);
  } else {
    return f;
  }
  
};



/**
 * Add a static folder, so it can be used for servering files
 */
sostatic.addFolder = function(name, options){
  this[name] = new Folder(name, options);
};


/**
 *
 */
sostatic.watch = function(port, folders){
  folders = folders || _folders;
  _port = port;
  var chokidar = require('chokidar');
  var sockjs = require('sockjs');
  var http = require('http');

  var watchers = {};
  for (var i=0, ii=folders.length; i<ii; i+=1){
    watchers[i] = chokidar.watch(folders[i]+'/', {
      ignored: /[\/\\]\./, persistent: true
    });
    watchers[i].on('raw', function(event, path, details) { closeAll(); });
  }

  

  var echo = sockjs.createServer();
  //{ sockjs_url: 'http://cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js' }
  var conns = [];

  var  closeAll = function(){
    conns.forEach(function(conn){
      conn.close();
    });
    conns = [];
  };

  echo.on('connection', function(conn) {
      conns.push(conn);
      conn.on('data', function(message) {});
      conn.on('close', function() {});
  });

  var server = http.createServer();
  echo.installHandlers(server, {prefix:'/sockreload'});
  server.listen(port);
  console.log("Auto-Reload enabled. Running at localhost:" + port);
};



module.exports = sostatic;