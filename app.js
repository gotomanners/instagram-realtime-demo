var express = require("express"),
		util = require("util"),
		fs = require("fs"),
		https = require("https"),
		querystring = require("querystring"),
		connect = require("connect"),
		cookie = require('cookie'),
		MemoryStore = express.session.MemoryStore,
		sessionStore = new MemoryStore(),

		app = express(),
		server = require("http").createServer(app),
		io = require("socket.io").listen(server),
		port = (process.env.PORT || 3000);


//var APP_URL = (process.env.IP || 'http://instagram-realtime-demo.gotomanners.c9.io'),
//var APP_URL = 'http://gotomanners.dyndns.org:3000',
var APP_URL = 'http://instamap.gotomanners.com',
		APP_CLIENT_ID = (process.env.APP_CLIENT_ID || '8f887b841c774e6cb9b8e5b7b3c9c663'),
		APP_CLIENT_SECRET = (process.env.APP_CLIENT_SECRET || 'c04728a0a2a5417faa9ab9b59c914cc2'),
		globalSubscriptionMap = {};

// Remove debug messages from socket.io
io.set('log level', 1);

app.configure(function () {
	// Allow to parse the body of the POST requests
	app.use(express.bodyParser());

	// Pass secret for signed cookies
	app.use(express.cookieParser('cookieSecret'));

	// Populates req.session
	app.use(express.session({store: sessionStore, secret: 'cookieSecret', key: 'express.sid'}));

	app.use(express.methodOverride());
	app.use(app.router);
	app.use(logErrors);
	app.use(clientErrorHandler);
	app.use(errorHandler);

	// use static resources in / && /public directories
	app.use("/public", express.static(__dirname + '/public'));
	app.use("/", express.static(__dirname + '/'));
});


var	Session = connect.middleware.session.Session;

io.set('authorization', function (data, accept) {
	if (data.headers.cookie) {
		data.cookie = connect.utils.parseSignedCookies(cookie.parse(data.headers.cookie),'cookieSecret');
		data.sessionID = data.cookie['express.sid'];
		// save the session store to the data object (as required by the Session constructor)
		data.sessionStore = sessionStore;
		sessionStore.get(data.sessionID, function (err, session) {
			if (err || !session) {
				accept('Error', false);
			} else {
				// create a session object, passing data as request and our just acquired session data
				data.session = new Session(data, session);
				accept(null, true);
			}
		});
	} else {
		return accept('No cookie transmitted.', false);
	}
});

function logErrors(err, req, res, next) {
	console.error(err.stack);
	next(err);
}

function clientErrorHandler(err, req, res, next) {
	if (req.xhr) {
		res.send(500, { error: 'Something blew up!' });
	} else {
		next(err);
	}
}

function errorHandler(err, req, res, next) {
	res.status(500);
	res.render('error', { error: err });
}

function initSessionVariables(session, fn) {
	session.userAccessToken = undefined;
	session.notificationsArray = [];
	session.PHOTO_BATCH_SIZE = 1;
	session.count = 0;
	session.likePhotosEnabled = false;
	session.followPhotosEnabled = false;
	session.subscriptionIds = [];
	session.isReady = true;
	session.save();
	fn(session.isReady);
}

function getSessionFromGlobalSubscriptionMap(obj, value, fn) {
	for(var sess in obj) {
		if(obj.hasOwnProperty(sess)) {
			for(var i=0; i < obj[sess].length; i++) {
				if(obj[sess][i] === value.toString()) {
					fn(sess)
				}
			}
		}
	}
}


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
				var rawJSON = JSON.parse(raw);
				if (rawJSON.access_token !== null && rawJSON.access_token !== undefined) {
					// Add the access token to the session
					request.session.userAccessToken = rawJSON.access_token;
					request.session.save();
					console.log("got access token for", rawJSON.user.username, request.session.userAccessToken);
					io.sockets.in(request.sessionID).emit('authenticated_user', raw);
					//All done, back to homepage
					setTimeout(function() {
						response.redirect(APP_URL);
					}, 2000);
				} else {
					console.log("ERROR retrieving access_token: %s", util.inspect(rawJSON));
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

		getSessionFromGlobalSubscriptionMap(globalSubscriptionMap, notificationPayload.subscription_id, function(sess) {
			https.get({
				host:'api.instagram.com',
				path:'/v1/geographies/' + notificationPayload.object_id + '/media/recent' +
						'?' + querystring.stringify({client_id:APP_CLIENT_ID})
			}, function (res) {
				var raw = "";

				res.on('data', function (chunk) {
					raw += chunk;
				});

				// When the whole body has arrived, it has to be a valid JSON, with data,
				// and the first photo of the data must to have a location attribute.
				// If so, the photo is emitted through the websocket
				res.on('end', function () {
					var photoResponse = JSON.parse(raw);
					if (photoResponse['data'].length > 0 && photoResponse['data'][0]['location'] !== null) {
						io.sockets.in(sess).emit('photo', raw);
					} else {
						console.log("ERROR: %s", util.inspect(photoResponse['meta']));
					}
				});
			});
		});
	});

	response.writeHead(200);
});

function deleteSubscriptions(id, object, fn) {
	var req_body = querystring.stringify({
		id:id,
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
			var rawJSON = JSON.parse(raw);
			if (rawJSON['meta']['code'] === 200) {
				console.log("SUCCESS Deleting subs", rawJSON);
				fn(rawJSON);
			} else {
				console.log("ERROR in delete subscription", util.inspect(rawJSON['meta']));
			}
		});
	});
	post_req.write(querystring.stringify({}));
	post_req.end();
}

io.sockets.on('connection', function (socket) {
	var hs = socket.handshake,
		userSession = hs.session;
	console.log('A socket with sessionID ' + hs.sessionID+ ' connected!');

	// setup an inteval that will keep our session fresh
	var intervalID = setInterval(function () {
		// reloading will also ensure we keep an up2date copy of the session with our connection.
		userSession.reload( function () {
			// "touch" it (resetting maxAge and lastAccess) and save it back again.
			userSession.touch().save();
		});
	}, 60 * 1000);
	socket.on('disconnect', function () {
		console.log('A socket with sessionID ' + hs.sessionID+ ' disconnected!');
		// clear the socket interval to stop refreshing the session
		clearInterval(intervalID);
	});

	socket.join(hs.sessionID);

	if(!userSession.isReady) {
		initSessionVariables(userSession, function() {
			console.log("Session ready.....................................................");
		});
	}

	// Change photo batch size
	socket.on('changePhotoBatchSize', function (batchSize, fn) {
		console.log("setting batch size to", batchSize);
		userSession.PHOTO_BATCH_SIZE = batchSize;
		userSession.save();
		fn(userSession.PHOTO_BATCH_SIZE);
	});

	// Toggle Likenesss
	socket.on('togglePhotoLikes', function (value, fn) {
		console.log("toggling photo likes value from", userSession.likePhotosEnabled,"to", value);
		userSession.likePhotosEnabled = value;
		userSession.save();
		fn(userSession.likePhotosEnabled);
	});

	// Get Like toggle status
	socket.on('getTogglePhotoLikes', function (fn) {
		console.log("getting photo likes value", userSession.likePhotosEnabled);
		fn(userSession.likePhotosEnabled);
	});

	// Toggle Follownesss
	socket.on('togglePhotoFollows', function (value, fn) {
		console.log("toggling photo follows value from", userSession.followPhotosEnabled, "to", value);
		userSession.followPhotosEnabled = value;
		userSession.save();
		fn(userSession.followPhotosEnabled);
	});

	// Get Follow toggle status
	socket.on('getTogglePhotoFollows', function (fn) {
		console.log("getting photo follows value", userSession.followPhotosEnabled);
		fn(userSession.followPhotosEnabled);
	});

	// Like Photos
	socket.on('likePhoto', function (photoId, fn) {
		if (userSession.likePhotosEnabled && userSession.userAccessToken !== undefined) {
			var req_body = querystring.stringify({client_id:APP_CLIENT_ID,
				access_token:userSession.userAccessToken});

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
					var rawJSON = JSON.parse(raw);
					if (rawJSON['meta']['code'] === 200) {
						console.log("liked", photoId);
						fn(photoId);
					} else {
						console.log("ERROR in LIKE: %s", util.inspect(rawJSON['meta']));
					}
				});
			});
			post_req.write(req_body);
			post_req.end();
		}
	});

	// Follow Photos
	socket.on('followPhoto', function (userId, action, fn) {
		if (userSession.followPhotosEnabled && userSession.userAccessToken !== undefined) {
			var req_body = querystring.stringify({action:action,
				access_token:userSession.userAccessToken});

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
					var rawJSON = JSON.parse(raw);
					if (rawJSON['meta']['code'] === 200) {
						console.log("followed", userId);
						fn(userId);
					} else {
						console.log("ERROR in "+action+": %s", util.inspect(rawJSON['meta']));
					}
				});
			});
			post_req.write(req_body);
			post_req.end();
		}
	});

	// Add Geo subscription
	socket.on('addSubscription', function (lat, lng, fn) {
		if (userSession.userAccessToken !== undefined) {
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
					var rawJSON = JSON.parse(raw);
					if (rawJSON['meta']['code'] === 200) {
						console.log("subscribed to", rawJSON.data.id);
						userSession.subscriptionIds.push(rawJSON.data.id);
						userSession.save();
						globalSubscriptionMap[userSession.id] = userSession.subscriptionIds;
						fn(rawJSON.data.id);
					} else {
						console.log("ERROR in add subscription", util.inspect(rawJSON['meta']));
					}
				});
			});
			post_req.write(req_body);
			post_req.end();
		}
	});

	// List all subscriptions
	socket.on('listAllSubscriptions', function(fn){
		if(userSession.userAccessToken !== undefined) {
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
				var rawJSON = JSON.parse(raw);
				if (rawJSON['meta']['code'] === 200) {
					console.log("Listing all subs", rawJSON);
					fn(rawJSON);
				} else {
					console.log("ERROR in list subscription", util.inspect(rawJSON['meta']));
				}
			});
		});
		post_req.write(querystring.stringify({}));
		post_req.end();
		}
	});

	// List my subscriptions
	socket.on('listMySubscriptions', function(fn){
		if(userSession.userAccessToken !== undefined) {
			console.log("listing my subscriptions ", userSession.subscriptionIds);
			fn(userSession.subscriptionIds);
		}
	});

	// Delete all subscriptions
	socket.on('deleteAllSubscriptions', function (object, fn) {
		if (userSession.userAccessToken !== undefined) {
			console.log("Deleting "+object+" subs");
			deleteSubscriptions("", object, function(data) {
				fn(data);
				globalSubscriptionMap = {};
			});
		}
	});

	// delete my subscriptions
	socket.on('deleteMySubscriptions', function (fn) {
		if (userSession.userAccessToken !== undefined) {
			console.log("Deleting my subs");
			userSession.subscriptionIds.forEach(function(subID) {
				deleteSubscriptions(subID, "", function(data) {
					fn(data);
				});
			});
			userSession.subscriptionIds = [];
			globalSubscriptionMap[userSession.id] = [];
		}
	});
});

// Run the app
server.listen(port, function () {
	console.log("Listening on port %d", port);
});
