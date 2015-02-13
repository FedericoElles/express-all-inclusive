# sostatic
Express Middleware for Mobile Apps to be used by very lazy people


#Usage

Install module

	npm install sostatic --save

In app:

	var sostatic = require('sostatic');

## Folders

Your mobile app might have multiple endpoints:
project, each inside a single folder, e.g.

- www
- landing
- adm

Registering a folder to serve its content:


	sostatic.addFolder('www', { //options object
	  version: 'v1.0.0'
	});

The folder is now available via `sostatic.www`

### Options ###

**version**: will replace `<!--version-->` in appcache and html files, e.g.:

	CACHE MANIFEST
	# Generated: <!--version--> 

becomes

	CACHE MANIFEST
	# Generated: v1.0.0 

To deploy a new app version, increase the app version.

## Files
So far there is build in support for `html`, `js`, `css` and `appcache` files.

### Simple serve ###

	app.get('/app.js', sostatic.static.serve());

This will server the `/static/app.js` file.

### Advanced serve ###
If you want to server files only in special cases, pass req and res parameters on the the serve method.

	app.get('/cache.appcache', function(req, res){
	  if (false){
	    res.send('');
	  } else {
	    sostatic.static.serve(req, res, {});
	  }
	});


### Options ###

**fileName**

By default

	app.get('/test', sostatic.static.serve());

would serve the text.html file. You can change this behaviour by either passing the fileName directly or as object property.

	app.get('/test', sostatic.static.serve('testPage.html'));
	//equals
	app.get('/test', sostatic.static.serve({fileName:'testPage.html'}))

**include**

For mobile applications it is nice to save some requests, there for you can merge files.

    sostatic.static.serve(req, res, {
      include: ['app.js', 'style.css']
    });

This code would replace in production inside index.html

`<script src="app.js"></script>` with `<script>//Minified JS code</script>`

and

`<link href="style.css">` with `<style>/* Minified CSS code*/</style>`

### Bonus features ###
Files are served differently on localhost and in production. In production

-  js files are ng-annotated and uglyfied
-  css files are minified
-  html files are minified
-  js and css files and be merged into html files

On localhost

- appcache files are not served

You can emulate production on localhost by added the `?force=true` parameter to all requests.


## Auto-Reload
Since we are so lazy, auto-reload is build in for html files.

	if (localhost){
	  var port = app.get('port') + 1;
	  sostatic.watch();
	}

By default, all files inside the registered folders are watched. You can register files via `sostatic.addFolder`. 
You can specify the watched folders by passing an array of folders.

	sostatic.watch(['adm', 'static']);
