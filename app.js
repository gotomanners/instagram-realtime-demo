var express = require('express'),
    util = require('util'),
    fs = require('fs'),
    https = require("https"),
    querystring = require('querystring');

var app = express.createServer(),
    io = require('socket.io').listen(app),
    port = (process.env.PORT || 3000);
    
    
var APP_CLIENT_ID = '8f887b841c774e6cb9b8e5b7b3c9c663',
    userAccessToken,
    notificationsArray = [],
    PHOTO_BATCH_SIZE = 3,
    count = 0,
    doAwesomeThing = false;

// Remove debug messages from socket.io
io.set('log level', 1);

// Allow to parse the body of the POST requests
app.use(express.bodyParser());

// GET /public resources.css
app.use("/public", express.static(__dirname + '/public'));

// GET /
//   Render index.html
app.get('/', function(request, response){
    console.log("getting index!!!");
    if(request.query["access_token"]) {
        console.log("got access token", request);
        userAccessToken = request.query["access_token"];
    }    
  response.writeHead(200, {'Content-Type': 'text/html'});
  response.write(fs.readFileSync('./index.html', 'utf8'));
  response.end();
});

// GET /callback
//   If param hub.callenge is present, renders its value
//   This URL is used by suscription system of Instagram
//   to check if the callback URL provided when creating the suscription
//   is valid and works fine
app.get('/callback', function(request, response){
  if(request.param("hub.challenge") !== null){
    response.send(request.param("hub.challenge"));
  } else {
    console.log("ERROR on subscription request: %s", util.inspect(request));
  }
});

// POST /callback
//   Receives POST nofications with the geometries updated
//   Each notification contains a geography_id, which is
//   the identifier of the geography that has a new photo.
//   It's necessary to perform another API call to get the last
//   photo from that geography
app.post('/callback', function(request, response){
  // request.body is a JSON already parsed
  request.body.forEach(function(notificationPayload){
    // Every notification object contains the id of the geography
    // that has been updated, and the photo can be obtained from
    // that geography
    
    if(notificationsArray.length < PHOTO_BATCH_SIZE) {     
        notificationsArray.push(notificationPayload);
    }
  });
  
    if(notificationsArray.length === PHOTO_BATCH_SIZE) {
        notificationsArray.forEach(function(notificationOjb){
            https.get({
              host: 'api.instagram.com',
              path: '/v1/geographies/' + notificationOjb.object_id + '/media/recent' +
              '?' + querystring.stringify({client_id: APP_CLIENT_ID})
            }, function(res){
              var raw = "";
        
              res.on('data', function(chunk) {
                raw += chunk;
              });
        
              // When the whole body has arrived, it has to be a valid JSON, with data,
              // and the first photo of the date must to have a location attribute.
              // If so, the photo is emitted through the websocket
              res.on('end', function() {
                var response = JSON.parse(raw);
                if(response['data'].length > 0 && response['data'][0]['location'] !== null) {
                    count++;
                    io.sockets.emit('photo', raw);   
                } else {
                  console.log("ERROR: %s", util.inspect(response['meta']));
                }
              });
            });
        });
    }
    if(count >= PHOTO_BATCH_SIZE) {
        notificationsArray = [];
        count = 0;   
    }

  response.writeHead(200);
});

io.sockets.on('connection', function (socket) {
    
    // Toggle awesomeness
    socket.on('toggleAwesomeThing', function (fn) {
        doAwesomeThing = !doAwesomeThing;
        fn(doAwesomeThing);    
    });
    
    // Like Photos
    socket.on('receivedPhoto', function (accToken, photo, fn) {
      if(accToken && doAwesomeThing) {
          var post_data = querystring.stringify({client_id: APP_CLIENT_ID, 
        access_token:accToken});
            
        var options = {
          host: 'api.instagram.com',
          path: '/v1/media/'+photo.id+'/likes',
          method: 'POST',
          headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': post_data.length
            }
        };
        
        var post_req = https.request(options, function (res) {
            res.setEncoding('utf-8');
          var raw = "";
        
          res.on('data', function(chunk) {
            raw += chunk;
          });
        
          res.on('end', function() {
            var response = JSON.parse(raw);
            if(response['meta']['code'] === 200) {    
                fn(photo);   
            } else {
              console.log("ERROR in LIKE: %s", util.inspect(response['meta']));
            }
          });
        });
        post_req.write(post_data);
        post_req.end();
      }  
    });
    
    
    // Get Profile Info
    socket.on('getMyInstaData', function (accToken, fn) {
    console.log("getting insta data", accToken, userAccessToken);
    if(accToken) {
        https.get({
      host: 'api.instagram.com',
      path: '/v1/users/search' +
      '?' + querystring.stringify({client_id: APP_CLIENT_ID, 
            access_token:accToken, 
            q:'gotomanners'})
    }, function(res){
      var raw = "";
    
      res.on('data', function(chunk) {
        raw += chunk;
      });
    
      res.on('end', function() {
        var response = JSON.parse(raw);
        if(response['data'].length > 0 && response['data'][0]['id'] !== null) {    
            fn(raw, doAwesomeThing);
        } else {
          console.log("ERROR: %s", util.inspect(response['meta']));
        }
      });
    
    });
    }
    });   
});

// Run the app
app.listen(port, function(){
  console.log("Listening on port %d", port);
});
