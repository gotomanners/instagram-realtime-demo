
window.gotomannersInstaData = (window && window.gotomannersInstaData) ? window.gotomannersInstaData : {};

$(document).ready(function() {
	gotomannersInstaData.client_id = '8f887b841c774e6cb9b8e5b7b3c9c663',
//			gotomannersInstaData.host = 'http://gotomanners.no-ip.org:3000';
			gotomannersInstaData.host = 'http://instagram-demo-app.nodejitsu.com';

	var mapOptions = {
		zoom: 15,
		center: new google.maps.LatLng(53.345735,-6.257615),
		disableDefaultUI: true,
		mapTypeId: google.maps.MapTypeId.ROADMAP,
		styles: [
			{ stylers: [ { saturation: -65 }, { gamma: 1.52 } ] },
			{ featureType: "administrative", stylers: [ { saturation: -95 },{ gamma: 2.26 } ] },
			{ featureType: "water", elementType: "labels", stylers: [ { visibility: "off" } ] },
			// Remove road names
			{ featureType: "road", stylers: [ { visibility: "simplified" }, { saturation: -99 }, { gamma: 2.22 } ] },
			{ featureType: "poi", elementType: "labels", stylers: [ { visibility: "off" },{ saturation: -55 } ] }
		]
	};

	var map = new google.maps.Map(document.getElementById("map_container"), mapOptions);

	var photos = [],
			socket = io.connect(gotomannersInstaData.host);
	gotomannersInstaData.socket = socket;

	socket.on('photo', function (raw) {
		var photo = JSON.parse(raw)['data'][0];
		photos.push(photo.link);
		loadInfoWindow(photo);
		setupMarker(map, photo);
		$('h1 span').html('(' + photos.length + ' ' + (photos.length == 1 ? 'photo' : 'photos') + ')');

		socket.emit('likePhoto', photo.id, function (data) {
			console.log("Displayed and liked", data);
		});

		socket.emit('followPhoto', photo.user.id, 'follow', function (data) {
			console.log("Displayed and followed", data);
		});
	});

	socket.on('connect', function () {
		var user = getUserFromLocalStorage();

		if(user) {
			socket.emit('getTogglePhotoLikes', function (data) {
				console.log("Awesome*1 things happenin' now", data ? 'YES' : 'NO');
			});
			socket.emit('getTogglePhotoFollows', function (data) {
				console.log("Awesome*2 things happenin' now", data ? 'YES' : 'NO');
			});

			$('#username').text(user.username);
			$('#profilePic').attr('src', user.profile_picture);
			$('#profilePic').show();
			$('#instaLoginButton').hide();
			$('#instaLogoutButton').show();
		} else {
			console.log("Not logged in......yet ;)");
			$('#instaLoginButton').show();
			$('#instaLogoutButton').hide();
		}
	});

	socket.on('authenticated_user', function (authData) {
		var userData = JSON.parse(authData);
		if(userData) {
			var access_token = userData.access_token,
					user = userData.user;
			localStorage.setItem("instagram_user_access_token", JSON.stringify(access_token));
			localStorage.setItem("instagram_logged_in_user", JSON.stringify(user));
		}
	});

	//InstaAuthentication
	$('#instaLoginButton').click(function() {
		authInstagram();
	});

	$('#instaLogoutButton').click(function() {
		logoutInstagram();
	});

	$('#changePhotoBatchSize').click(function() {
		var batchSize = Number($('#batchSize').val());
		changePhotoBatchSize(batchSize);
	});

	$('#togglePhotoLikesButton').click(function() {
		togglePhotoLikes();
	});

	$('#togglePhotoFollowsButton').click(function() {
		togglePhotoFollows();
	});
});

function setupMarker(map, photo){
	var position = new google.maps.LatLng(photo.location.latitude, photo.location.longitude);
	map.setCenter(position);
	var marker = new google.maps.Marker({ position:position,map:map,animation:google.maps.Animation.DROP,html:photo});
	google.maps.event.addListener(marker, "click", function () {
		loadInfoWindow(this.html);
	});
}

function loadInfoWindow(photo){
	var date = new Date(parseInt(photo.created_time)*1000),
			formatedDate = date.getFullYear() + '-' + parseInt(date.getMonth()+1) + '-' + date.getDate() +
					' ' + date.getUTCHours() + ':' + date.getUTCMinutes() + ':' + date.getUTCSeconds();
	$('.item_data img').attr('src', photo.user.profile_picture);
	$('.item_data p strong').html(photo.user.username);
	$('.item_data span.date').html(formatedDate);
	$('.item_data a').attr('href', photo.link);
	$('.content.instagram').html('<img src="' + photo.images.low_resolution.url + '" />');
	$('#content').show();
}

function authInstagram() {
	var instaAuthURL = 'https://instagram.com/oauth/authorize/?client_id='
			+gotomannersInstaData.client_id+'&redirect_uri='+gotomannersInstaData.host
			+'/auth&scope=likes+comments+relationships&response_type=code'
	window.location.href= instaAuthURL;

}

function logoutInstagram() {
	if (localStorage.getItem("instagram_user_access_token")) {
		localStorage.removeItem("instagram_user_access_token");
		console.log("Logging out step 1")
	}
	if (localStorage.getItem("instagram_logged_in_user")) {
		localStorage.removeItem("instagram_logged_in_user");
		console.log("Logging out step 2")
	}
	window.location=gotomannersInstaData.host;
}

function changePhotoBatchSize(batchSize) {
	gotomannersInstaData.socket.emit('changePhotoBatchSize', batchSize, function (data) {
		console.log("Photo Batch Size set to", data);
	});
}

function togglePhotoLikes() {
	gotomannersInstaData.socket.emit('togglePhotoLikes', function (data) {
		console.log("Like* things happenin'", data ? 'YES' : 'NO');
	});
}

function togglePhotoFollows() {
	gotomannersInstaData.socket.emit('togglePhotoFollows', function (data) {
		console.log("Follow* things happenin'", data ? 'YES' : 'NO');
	});
}

function getAccessTokenFromLocalStorage() {
	var accToken;
	if (localStorage.getItem("instagram_user_access_token")) {
		accToken = JSON.parse(localStorage.getItem("instagram_user_access_token"));
	}
	return accToken;
}

function getUserFromLocalStorage() {
	var user;
	if (localStorage.getItem("instagram_logged_in_user")) {
		user = JSON.parse(localStorage.getItem("instagram_logged_in_user"));
	}
	return user;
}

function getMyLikeCount() {
	var accToken = getAccessTokenFromLocalStorage();
	if(accToken.length > 0) {
		$.ajax({
			url: "https://api.instagram.com/v1/users/self/media/liked?access_token=" + accToken,
			type: "GET",
			success: function(data) {
				console.log(data);
			}
		});
	}
}