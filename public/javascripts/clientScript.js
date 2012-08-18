$(document).ready(function() {
	var host = 'http://instamap.gotomanners.com',
//	var	host = 'http://instagram-demo-app.nodejitsu.com',
		socket = io.connect(host);

	var g2mInstaViewer = new GotomannersInstaViewer(host, socket);

	socket.on('connect', g2mInstaViewer.callbackOnConnect);

	socket.on('authenticated_user', g2mInstaViewer.callbackOnAuthenticatedUser);

	socket.on('photo', g2mInstaViewer.callbackOnPhoto);

	$('[id^=instaLoginButton-]').click(function() {
		g2mInstaViewer.login();
	});

	$('[id^=instaLogoutButton-]').click(function() {
		g2mInstaViewer.logout();
	});

	$('#settingsModalForm').submit(function(e) {
		e.preventDefault();
	});

	$('#reset').click(function() {
		g2mInstaViewer.listSubs(function(data) {
			console.log("Listing subs", data);
		});
		g2mInstaViewer.clearSubs('all', function(data) {
			console.log("Clearing subs", data);
		});
		g2mInstaViewer.clearScreen();
	});

	$('#topBarPlaceSearchForm').submit(function(e) {
		e.preventDefault();
		var address = $('#topBarPlaceSearchText').val();
		g2mInstaViewer.geocodeAddress(address, function(result) {
			console.log(result);
		});
	});

	$('#myLocation').click(function() {
		g2mInstaViewer.getCurrentLocation();
	});

	$('#saveSettings').click(function() {
		$('#saveSettings').button('loading');
		setTimeout(function(){
			g2mInstaViewer.saveSettings(function() {
				$('#saveSettings').button('complete');
				setTimeout(function() {
					$('#settingsModal').modal('hide');
				}, 200);
			});
		}, 200);
	});
});

