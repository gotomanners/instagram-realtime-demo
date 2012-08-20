$(document).ready(function() {
//	var host = 'http://gotomanners.dyndns.org:3000',
	var	host = 'http://instamap.gotomanners.com',
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

	$('#listAllSubs').click(function() {
		g2mInstaViewer.listAllSubs(function(data) {
			console.log("Listing all subs", data);
		});
	});

	$('#clearAllSubs').click(function() {
		g2mInstaViewer.clearSubs('all', function(data) {
			console.log("Clearing all subs", data);
		});
		g2mInstaViewer.clearScreen();
	});

	$('#reset').click(function() {
		g2mInstaViewer.listMySubs(function(data) {
			console.log("Listing my subs", data);
		});
		g2mInstaViewer.clearMySubs(function(data) {
			console.log("Clearing my subs", data);
		});
		g2mInstaViewer.clearScreen();
	});

	$('[id^=topBarPlaceSearchForm-]').submit(function(e) {
		e.preventDefault();
		var address = e.target.children[0].value;
		g2mInstaViewer.geocodeAddress(address, function(result) {
			console.log(result);
		});
	});

	$('[id^=myLocation-]').click(function() {
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

