
window.GotomannersInstaViewer = (window && window.GotomannersInstaViewer) ? window.GotomannersInstaViewer : {};

GotomannersInstaViewer = (function(host, socket) {

	var client_id = '8f887b841c774e6cb9b8e5b7b3c9c663',
		defaultPosition = new google.maps.LatLng(53.345735,-6.257615),
		defaultMapOptions = {
			zoom: 15,
			center: defaultPosition,
			disableDefaultUI: true,
			mapTypeId: google.maps.MapTypeId.ROADMAP,
			streetViewControl: false,
			styles: [
				{ stylers: [ { saturation: -65 }, { gamma: 1.52 } ] },
				{ featureType: "administrative", stylers: [ { saturation: -95 },{ gamma: 2.26 } ] },
				{ featureType: "water", elementType: "labels", stylers: [ { visibility: "off" } ] },
				// Remove road names
				{ featureType: "road", stylers: [ { visibility: "simplified" }, { saturation: -99 }, { gamma: 2.22 } ] },
				{ featureType: "poi", elementType: "labels", stylers: [ { visibility: "off" },{ saturation: -55 } ] }
			]
		},
		defaultPanoramaOptions = {
			position: defaultPosition,
			pov: {
				heading: 0,
				pitch: -10,
				zoom: 0
			}
		},
		streetViewZIndexValue = -1,
		streetViewService = new google.maps.StreetViewService(),
		markersArray = [],
		geocoder = new google.maps.Geocoder(),
		photos = [];
//		socket = io.connect(host);

	var getMap = function(mapOptions) {
		if(mapOptions) {
			mapOptions = $.extend(defaultMapOptions, mapOptions);
		} else {
			mapOptions = defaultMapOptions;
		}
		return new google.maps.Map(document.getElementById("map_container"), mapOptions);
	};

	var getPanorama = function(panoramaOptions) {
		if(panoramaOptions) {
			panoramaOptions = $.extend(defaultPanoramaOptions, panoramaOptions);
		} else {
			panoramaOptions = defaultPanoramaOptions;
		}
		return new google.maps.StreetViewPanorama(document.getElementById("pano_container"), panoramaOptions);
	};

	var map = getMap(),
		panorama = getPanorama();

	var toggleStreetView = function(speed,fn) {
		streetViewZIndexValue *= -1;
		return $('#pano_container').animate({
			'z-index' : streetViewZIndexValue
		},speed || 400,function() {
			$.isFunction(fn) && fn.call(this);
		});
	};

	var setupMarker = function(map, photo){
		var position = new google.maps.LatLng(photo.location.latitude, photo.location.longitude);
		map.setCenter(position);
		var markerOptions = {
			map: map,
			position:position,
			animation:google.maps.Animation.DROP,
			html:photo
		};
		var panoramaOptions = {
			position: position
		},  marker = addMarker(markerOptions);
		google.maps.event.addListener(marker, "click", function () {
			panorama = getPanorama(panoramaOptions);
			toggleMarkerBounce(this);
			streetViewService.getPanoramaByLocation(event.latLng, 100, processSVData);
			toggleStreetView(400, function(){
				toggleMarkerBounce(marker);
			});
			showPhotoPopup(markerOptions.html);
		});
	};

	var showPhotoPopup = function(photo){
		var date = new Date(parseInt(photo.created_time)*1000),
				formatedDate = date.getFullYear() + '-' + parseInt(date.getMonth()+1) + '-' + date.getDate() +
						' ' + date.getUTCHours() + ':' + date.getUTCMinutes() + ':' + date.getUTCSeconds();
		$('.item_data img').attr('src', photo.user.profile_picture);
		$('.item_data p strong').html(photo.user.username);
		$('.item_data span.date').html(formatedDate);
		$('.item_data a').attr('href', photo.link);
		$('.content.instagram').html('<img src="' + photo.images.low_resolution.url + '" />');
		$('#content').show();
	};

	var hidePhotoPopup = function() {
		$('#content').hide();
	};

	var clearScreen = function() {
		hidePhotoPopup();
		clearMarkers();
	};

	var authInstagram = function() {
		window.location.href= 'https://instagram.com/oauth/authorize/?client_id='
				+ client_id + '&redirect_uri=' + host
				+ '/auth&scope=likes+comments+relationships&response_type=code';
	};

	var logoutInstagram = function() {
		if (localStorage.getItem("instagram_user_access_token")) {
			localStorage.removeItem("instagram_user_access_token");
		}
		if (localStorage.getItem("instagram_logged_in_user")) {
			localStorage.removeItem("instagram_logged_in_user");
		}
		$('#logoutIframeDiv').html('<iframe src="https://instagram.com/accounts/logout/" width="0" height="0">');
		window.location=host;
	};

	var getRadioToggleValue = function(toggleOptionsWildcard, toggleAttr) {
		var radioOptions = $(toggleOptionsWildcard);
		for(var i = 0; i < radioOptions.length; i++) {
			var b = $(radioOptions[i]);
			if(b.hasClass('active')) {
				return (b.attr(toggleAttr).toLowerCase() === 'true'); //convert to bool
			}
		}
	};

	var saveSettings = function(callback) {
		var toggleLikeValue = getRadioToggleValue('[id^=togglePhotoLikesBtn-]', 'data-togglePhotoLikes');
		var toggleFollowValue = getRadioToggleValue('[id^=togglePhotoFollowsBtn-]', 'data-togglePhotoFollows');
		var batchSize = parseInt($('#batchSize').val());

		togglePhotoLikes(toggleLikeValue, function() {
			togglePhotoFollows(toggleFollowValue, function() {
				changePhotoBatchSize(batchSize, function() {
					callback();
				});
			});
		});
	};

	var changePhotoBatchSize = function(batchSize, callback) {
		socket.emit('changePhotoBatchSize', batchSize, function (data) {
			console.log("Photo Batch Size set to", data);
			callback();
		});
	};

	var togglePhotoLikes = function(value, callback) {
		socket.emit('togglePhotoLikes', value, function (data) {
			console.log("Like* things happenin'", data ? 'YES' : 'NO');
			callback();
		});
	};

	var togglePhotoFollows = function(value, callback) {
		socket.emit('togglePhotoFollows', value, function (data) {
			console.log("Follow* things happenin'", data ? 'YES' : 'NO');
			callback();
		});
	};

	var getAccessTokenFromLocalStorage = function() {
		var accToken;
		if (localStorage.getItem("instagram_user_access_token")) {
			accToken = JSON.parse(localStorage.getItem("instagram_user_access_token"));
		}
		return accToken;
	};

	var getUserFromLocalStorage = function() {
		var user;
		if (localStorage.getItem("instagram_logged_in_user")) {
			user = JSON.parse(localStorage.getItem("instagram_logged_in_user"));
		}
		return user;
	};

	var geocodeAddress = function(address, callback) {
		if (navigator.geolocation) {
			geocoder.geocode({'address': address}, function(results, status) {
				if (status === google.maps.GeocoderStatus.OK) {
					var mapOptions = {
						center: results[0].geometry.location
					};
					map = getMap(mapOptions);
					map.setZoom(11);
					var markerOptions = {
						map: map,
						position: results[0].geometry.location,
						title: results[0].formatted_address,
						animation:google.maps.Animation.DROP
					};
					clearScreen();
					var panoramaOptions = {
							position: results[0].geometry.location
						},
						marker = addMarker(markerOptions);

					addSubscription(results[0].geometry.location, function(res) {
						console.log("You are now looking at"+ address + "here is your id"+ res);
					});

					google.maps.event.addListener(marker, "click", function (event) {
						panorama = getPanorama(panoramaOptions);
						toggleMarkerBounce(this);
						streetViewService.getPanoramaByLocation(event.latLng, 100, processSVData);
						toggleStreetView(400, function() {
							toggleMarkerBounce(marker);
						});
					});
					callback(results[0]);
				} else {
					alert("Geocode was not successful for the following reason: " + status);
					callback(status);
				}
			});
		} else {
			alert("Your browser does not support Geolocation. :(");
		}
	};

	var geocodeLatLng = function(latlng, callback) {
		if (navigator.geolocation) {
			geocoder.geocode({'latLng': latlng}, function(results, status) {
				if (status == google.maps.GeocoderStatus.OK) {
					if (results[1]) {
						map.setZoom(15);
						var markerOptions = {
							map: map,
							position: latlng,
							title: 'Your current location',
							animation:google.maps.Animation.DROP
						};
						clearScreen();
						var marker = addMarker(markerOptions);
						callback(marker, results[1]);
					}
				} else {
					alert("Geocoder failed due to: " + status);
				}
			});
		} else {
			alert("Your browser does not support Geolocation. :(");
		}
	};

	var getBrowserLocation = function() {
		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(function(position){
				var latitude = position.coords.latitude;
				var longitude = position.coords.longitude;
				var coords = new google.maps.LatLng(latitude, longitude);
				var mapOptions = {
					center: coords
				},  panoramaOptions = {
					position: coords
				};
				mapOptions = $.extend(defaultMapOptions, mapOptions);

				map = getMap(mapOptions);
				geocodeLatLng(coords, function(marker, result) {
					console.log("Address is", result.formatted_address);
					addSubscription(coords, function(res) {
						console.log("You are now looking at"+ result.formatted_address+ "here is your id"+ res);
					});
					google.maps.event.addListener(marker, "click", function (event) {
						panorama = getPanorama(panoramaOptions);
						toggleMarkerBounce(this);
						streetViewService.getPanoramaByLocation(event.latLng, 100, processSVData);
						toggleStreetView(400, function() {
							toggleMarkerBounce(marker);
						});
					});
				});

			});
		} else {
			alert("Your browser does not support Geolocation. :(");
		}
	};

	var processSVData = function(data, status) {
		var markerPanoID = data.location.pano;
		// Set the Pano to use the passed panoID
		panorama.setPano(markerPanoID);
		panorama.setPov(defaultPanoramaOptions.pov);
		panorama.setVisible(true);
	};

	var toggleMarkerBounce = function(marker) {
		if (marker.getAnimation() != null) {
			marker.setAnimation(null);
		} else {
			marker.setAnimation(google.maps.Animation.BOUNCE);
		}
	};

	var addMarker = function(markerOptions) {
		if(markerOptions) {
			var marker = new google.maps.Marker(markerOptions);
			markersArray.push(marker);
			return marker;
		}
	};

	var clearMarkers = function() {
		if (markersArray) {
			for (var i in markersArray) {
				if(markersArray.hasOwnProperty(i)){
					markersArray[i].setMap(null);
				}
			}
		}
	};

	var showOverlays = function() {
		if (markersArray) {
			for (var i in markersArray) {
				if(markersArray.hasOwnProperty(i)){
					markersArray[i].setMap(map);
				}
			}
		}
	};

	var deleteOverlays = function() {
		if (markersArray) {
			for (var i in markersArray) {
				if(markersArray.hasOwnProperty(i)){
					markersArray[i].setMap(null);
				}
			}
			markersArray.length = 0;
		}
	};

	var addSubscription = function(position, callback) {
		socket.emit('instaSubscribe', position.lat(), position.lng(), function (data) {
			if(data) {
				callback(data);
			} else {
				console.log("ERROR :: Response to add subscription", data);

			}
		});
	};

	var listSubscription = function(callback) {
		socket.emit('listSubscription', function (data) {
			if(data) {
				callback(data);
			} else {
				console.log("ERROR :: Response to list subscription", data);

			}
		});
	};

	var deleteSubscription = function(object, callback) {
		socket.emit('deleteSubscription', object, function (data) {
			if(data) {
				callback(data);
			} else {
				console.log("ERROR :: Response to delete subscription", data);

			}
		});
	};

	var callbackOnConnect = function() {
		var user = getUserFromLocalStorage();

		if(user) {
			socket.emit('getTogglePhotoLikes', function (data) {
				console.log("Awesome*1 things happenin' now", data ? 'YES' : 'NO');
				if(data) {
					$('#togglePhotoLikesBtn-yes').button('toggle');
				} else {
					$('#togglePhotoLikesBtn-no').button('toggle');
				}
			});
			socket.emit('getTogglePhotoFollows', function (data) {
				console.log("Awesome*2 things happenin' now", data ? 'YES' : 'NO');
				if(data) {
					$('#togglePhotoFollowsBtn-yes').button('toggle');
				} else {
					$('#togglePhotoFollowsBtn-no').button('toggle');
				}
			});

			console.log("Logged in as "+user.username+" ;)");
			$('#username').text(" "+user.username);
			$('#profilePic').attr('src', user.profile_picture);
			$('#profilePic').show();
			$('[id^=instaLoginButton-]').hide();
			$('[id^=instaLogoutButton-]').show();
			$('#topBarUserProfileDropdown').show();
			if(user.username === 'gotomanners' && user.id === '29675634') {
				$('[id^=topBarSettingsButton-]').show();
			} else {
				$('[id^=topBarSettingsButton-]').hide();			
			}
		} else {
			console.log("Not logged in......yet ;)");
			$('[id^=instaLoginButton-]').show();
			$('[id^=instaLogoutButton-]').hide();
			$('#topBarUserProfileDropdown').hide();
			$('[id^=topBarSettingsButton-]').hide();
		}
	};

	var callbackOnAuthenticatedUser = function (authData) {
		console.log("auth callback", authData);
		var userData = JSON.parse(authData);
		if(userData) {
			var access_token = userData.access_token,
					user = userData.user;
			localStorage.setItem("instagram_user_access_token", JSON.stringify(access_token));
			localStorage.setItem("instagram_logged_in_user", JSON.stringify(user));
		}
		console.log("redirecting to host", host);
		window.location = host;
	};

	var callbackOnPhoto = function (raw) {
		var photo = JSON.parse(raw)['data'][0];
		photos.push(photo.link);
		showPhotoPopup(photo);
		setupMarker(map, photo);
		$('h1 span').html('(' + photos.length + ' ' + (photos.length == 1 ? 'photo' : 'photos') + ')');

		socket.emit('likePhoto', photo.id, function (data) {
			console.log("DL'd", data);
		});

		socket.emit('followPhoto', photo.user.id, 'follow', function (data) {
			console.log("DF'd", data);
		});
	};

	return {
		login : authInstagram,
		logout : logoutInstagram,
		saveSettings : saveSettings,
		getCurrentLocation : getBrowserLocation,
		geocodeAddress : geocodeAddress,
		listSubs : listSubscription,
		clearSubs : deleteSubscription,
		clearScreen : clearScreen,
		callbackOnPhoto : callbackOnPhoto,
		callbackOnConnect : callbackOnConnect,
		callbackOnAuthenticatedUser : callbackOnAuthenticatedUser
	}
});