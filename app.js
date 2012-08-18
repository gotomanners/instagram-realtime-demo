var express = require('express'),
		util = require('util'),
		fs = require('fs'),
		https = require("https"),
		querystring = require('querystring');

var app = express.createServer(),
		io = require('socket.io').listen(app),
		port = (process.env.PORT || 3000);


//var APP_URL = (process.env.IP || 'http://instagram-realtime-demo.gotomanners.c9.io'),
var APP_URL = 'http://instamap.gotomanners.com',
//var APP_URL = 'http://instagram-demo-app.nodejitsu.com',
		APP_CLIENT_ID = (process.env.APP_CLIENT_ID || '8f887b841c774e6cb9b8e5b7b3c9c663'),
		APP_CLIENT_SECRET = (process.env.APP_CLIENT_SECRET || 'c04728a0a2a5417faa9ab9b59c914cc2'),
		userAccessToken,
		notificationsArray = [],
		PHOTO_BATCH_SIZE = 1,
		count = 0,
		likePhotosEnabled = false,
		followPhotosEnabled = false,
		subscriptionIds = [];

// Remove debug messages from socket.io
io.set('log level', 1);

// use static resources in / && /public directories
app.use("/public", express.static(__dirname + '/public'));
app.use("/", express.static(__dirname + '/'));

// Allow to parse the body of the POST requests
app.use(express.bodyParser());

///*   GET /
// *   Render index.html
// */
//app.get('/', function (request, response) {
//	response.writeHead(200, {'Content-Type':'text/html'});
//	response.write(fs.readFileSync('./index.html', 'utf8'));
//	response.end();
//});

/*   GET /auth
 *   if params.code is present, then exchange that for the user access_token
 */
app.get('/auth', function (request, response) {
	if (request.param("code") !== null) {
//		response.send(request.param("code"));

		var req_body = querystring.stringify({
			client_id:APP_CLIENT_ID,
			client_secret:APP_CLIENT_SECRET,
			grant_type:'authorization_code',
			redirect_uri:APP_URL + '/auth',
			code:request.param("code")
		});
		var options = {
			host:'api.instagram.com',
			path:'/oauth/access_token',
			method:'POST',
			headers:{
				'Content-Type':'application/x-www-form-urlencoded',
				'Content-Length':req_body.length
			}
		};

		var post_req = https.request(options, function (res) {
			res.setEncoding('utf-8');
			var raw = "";

			res.on('data', function (chunk) {
				raw += chunk;
			});

			res.on('end', function () {
				var userData = JSON.parse(raw);
				if (userData.access_token !== null && userData.access_token !== undefined) {
					userAccessToken = userData.access_token;
					console.log("got access token for", userData.user.username, userAccessToken);
					io.sockets.emit('authenticated_user', raw);

					console.log("emitted to authenticated_user", raw);
					//All done, back to homepage
					setTimeout(function() {
						response.redirect(APP_URL);
					}, 2000);
				} else {
					console.log("ERROR retrieving access_token: %s", util.inspect(userData));
				}
			});
		});
		post_req.write(req_body);
		post_req.end();

	} else {
		console.log("ERROR on authentication request: %s", util.inspect(request));
	}
});

/*   GET /callback
 *   If param hub.callenge is present, renders its value
 *   This URL is used by suscription system of Instagram
 *   to check if the callback URL provided when creating the suscription
 *   is valid and works fine
 */
app.get('/callback', function (request, response) {
	if (request.param("hub.challenge") !== null) {
		response.send(request.param("hub.challenge"));
	} else {
		console.log("ERROR on subscription request /callback: %s", util.inspect(request));
	}
});

// POST /callback
//   Receives POST notifications with the geometries updated
//   Each notification contains a geography_id, which is
//   the identifier of the geography that has a new photo.
//   It's necessary to perform another API call to get the last
//   photo from that geography
app.post('/callback', function (request, response) {
	// request.body is a JSON already parsed
	request.body.forEach(function (notificationPayload) {
		// Every notification object contains the id of the geography
		// that has been updated, and the photo can be obtained from
		// that geography

		if (notificationsArray.length < PHOTO_BATCH_SIZE) {
			notificationsArray.push(notificationPayload);
		}
	});

	if (notificationsArray.length === PHOTO_BATCH_SIZE) {
		notificationsArray.forEach(function (notificationOjb) {
			https.get({
				host:'api.instagram.com',
				path:'/v1/geographies/' + notificationOjb.object_id + '/media/recent' +
						'?' + querystring.stringify({client_id:APP_CLIENT_ID})
			}, function (res) {
				var raw = "";

				res.on('data', function (chunk) {
					raw += chunk;
				});

				// When the whole body has arrived, it has to be a valid JSON, with data,
				// and the first photo of the date must to have a location attribute.
				// If so, the photo is emitted through the websocket
				res.on('end', function () {
					var response = JSON.parse(raw);
					if (response['data'].length > 0 && response['data'][0]['location'] !== null) {
						count++;
						io.sockets.emit('photo', raw);
					} else {
						console.log("ERROR: %s", util.inspect(response['meta']));
					}
				});
			});
		});
	}
	if (count >= PHOTO_BATCH_SIZE) {
		notificationsArray = [];
		count = 0;
	}

	response.writeHead(200);
});

io.sockets.on('connection', function (socket) {

	// Change photo batch size
	socket.on('changePhotoBatchSize', function (batchSize, fn) {
		console.log("setting batch size to", batchSize);
		PHOTO_BATCH_SIZE = batchSize;
		fn(PHOTO_BATCH_SIZE);
	});

	// Toggle Likenesss
	socket.on('togglePhotoLikes', function (value, fn) {
		console.log("toggling photo likes value from", likePhotosEnabled,"to", value);
		likePhotosEnabled = value;
		fn(likePhotosEnabled);
	});

	// Get Like toggle status
	socket.on('getTogglePhotoLikes', function (fn) {
		console.log("getting photo likes value", likePhotosEnabled);
		fn(likePhotosEnabled);
	});

	// Toggle Follownesss
	socket.on('togglePhotoFollows', function (value, fn) {
		console.log("toggling photo follows value from", followPhotosEnabled, "to", value);
		followPhotosEnabled = value;
		fn(followPhotosEnabled);
	});

	// Get Follow toggle status
	socket.on('getTogglePhotoFollows', function (fn) {
		console.log("getting photo follows value", followPhotosEnabled);
		fn(followPhotosEnabled);
	});

	// Like Photos
	socket.on('likePhoto', function (photoId, fn) {
		if (likePhotosEnabled && userAccessToken !== undefined) {
			var req_body = querystring.stringify({client_id:APP_CLIENT_ID,
				access_token:userAccessToken});

			var options = {
				host:'api.instagram.com',
				path:'/v1/media/' + photoId + '/likes',
				method:'POST',
				headers:{
					'Content-Type':'application/x-www-form-urlencoded',
					'Content-Length':req_body.length
				}
			};

			var post_req = https.request(options, function (res) {
				res.setEncoding('utf-8');
				var raw = "";

				res.on('data', function (chunk) {
					raw += chunk;
				});

				res.on('end', function () {
					var response = JSON.parse(raw);
					if (response['meta']['code'] === 200) {
						console.log("liked", photoId);
						fn(photoId);
					} else {
						console.log("ERROR in LIKE: %s", util.inspect(response['meta']));
					}
				});
			});
			post_req.write(req_body);
			post_req.end();
		}
	});

	// Follow Photos
	socket.on('followPhoto', function (userId, action, fn) {
		if (followPhotosEnabled && userAccessToken !== undefined) {
			var req_body = querystring.stringify({action:action,
				access_token:userAccessToken});

			var options = {
				host:'api.instagram.com',
				path:'/v1/users/' + userId + '/relationship',
				method:'POST',
				headers:{
					'Content-Type':'application/x-www-form-urlencoded',
					'Content-Length':req_body.length
				}
			};

			var post_req = https.request(options, function (res) {
				res.setEncoding('utf-8');
				var raw = "";

				res.on('data', function (chunk) {
					raw += chunk;
				});

				res.on('end', function () {
					var response = JSON.parse(raw);
					if (response['meta']['code'] === 200) {
						console.log("followed", userId);
						fn(userId);
					} else {
						console.log("ERROR in "+action+": %s", util.inspect(response['meta']));
					}
				});
			});
			post_req.write(req_body);
			post_req.end();
		}
	});

	// Add Geo subscription
	socket.on('instaSubscribe', function (lat, lng, fn) {
		if (userAccessToken !== undefined) {
			var req_body = querystring.stringify({
				client_id:APP_CLIENT_ID,
				client_secret:APP_CLIENT_SECRET,
				object:'geography',
				aspect:'media',
				lat:lat,
				lng:lng,
				radius:'5000',
				callback_url:APP_URL + '/callback'
			});

			var options = {
				host:'api.instagram.com',
				path:'/v1/subscriptions',
				method:'POST',
				headers:{
					'Content-Type':'application/x-www-form-urlencoded',
					'Content-Length':req_body.length
				}
			};

			var post_req = https.request(options, function (res) {
				res.setEncoding('utf-8');
				var raw = "";

				res.on('data', function (chunk) {
					raw += chunk;
				});

				res.on('end', function () {
					var response = JSON.parse(raw);
					if (response['meta']['code'] === 200) {
						console.log("subscribed to", response.data.id);
						subscriptionIds.push(response.data.id);
						fn(response.data.id);
					} else {
						console.log("ERROR in add subscription", util.inspect(response['meta']));
					}
				});
			});
			post_req.write(req_body);
			post_req.end();
		}
	});

	// List all subscriptions
	socket.on('listSubscription', function(fn){
		if(userAccessToken !== undefined) {
		var req_body = querystring.stringify({
			client_secret:APP_CLIENT_SECRET,
			client_id:APP_CLIENT_ID
		});

		var options = {
			host:'api.instagram.com',
			path:'/v1/subscriptions?'+req_body,
			method:'GET',
			headers:{
				'Content-Type':'application/x-www-form-urlencoded'
//					'Content-Length':req_body.length
			}
		};

		var post_req = https.request(options, function (res) {
			res.setEncoding('utf-8');
			var raw = "";

			res.on('data', function (chunk) {
				raw += chunk;
			});

			res.on('end', function () {
				var response = JSON.parse(raw);
				if (response['meta']['code'] === 200) {
					console.log("Listing all subs", response);
					fn(response);
				} else {
					console.log("ERROR in list subscription", util.inspect(response['meta']));
				}
			});
		});
		post_req.write(querystring.stringify({}));
		post_req.end();
		}
	});

	// Delete all subscriptions
	socket.on('deleteSubscription', function (object, fn) {
		if (userAccessToken !== undefined) {
			var req_body = querystring.stringify({
				id:object,
				object:object,
				client_secret:APP_CLIENT_SECRET,
				client_id:APP_CLIENT_ID
			});

			var options = {
				host:'api.instagram.com',
				path:'/v1/subscriptions?'+req_body,
				method:'DELETE',
				headers:{
					'Content-Type':'application/x-www-form-urlencoded'
//					'Content-Length':req_body.length
				}
			};

			var post_req = https.request(options, function (res) {
				res.setEncoding('utf-8');
				var raw = "";

				res.on('data', function (chunk) {
					raw += chunk;
				});

				res.on('end', function () {
					var response = JSON.parse(raw);
					if (response['meta']['code'] === 200) {
						console.log("Deleted all subs", response);
						fn(response);
					} else {
						console.log("ERROR in delete subscription", util.inspect(response['meta']));
					}
				});
			});
			post_req.write(querystring.stringify({}));
			post_req.end();
		}
	});
});

// Run the app
app.listen(port, function () {
	console.log("Listening on port %d", port);
});
