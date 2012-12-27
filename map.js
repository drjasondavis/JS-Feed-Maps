$(document).ready(function() {

    function createMap(lat, long) {
	var mapOptions = {
	    center: new google.maps.LatLng(lat, long),
	    zoom: 10,
	    scrollwheel: false,
	    mapTypeId: google.maps.MapTypeId.ROADMAP
	};
	var map = new google.maps.Map(document.getElementById("map_canvas"),
				      mapOptions);
	return map;
    };

    function lookupGeo(geoPlaces, callback) {
	$.each(geoPlaces, function(i, gp) {
	    latLongPlaceMap[gp.place] = null;
	});
	$.each(latLongPlaceMap, function(place, location) {
	    geoCoder.geocode({address: place}, function(geocoderResult) {
		addLatLongPlace(place, geocoderResult, callback);
	    });
	});
    };

    function addLatLongPlace(geoPlaceRequestName, geocoderResult, callback) {
	if (geocoderResult.length == 0) {
	    //console.log("No matches found for location: " + geoPlaceRequestName);
	    return;
	}
	latLongPlaceMap[geoPlaceRequestName] = geocoderResult[0].geometry.location;

	function formatGeocoderResultName(r) {
	    var adminLabel = "";
	    var countryLabel = "";
	    var localityLabel = "";
	    for (var key in r) {
		if (r.hasOwnProperty(key)) {
		    if (r[key].types[0] === "administrative_area_level_2") {
			adminLabel = r[key].long_name;
		    }
		    if (r[key].types[0] === "country") {
			countryLabel = r[key].long_name;
		    }
		    if (r[key].types[0] === "locality") {
			localityLabel = r[key].long_name;
		    }
		}
	    }
	    var fullLabel;
	    if (localityLabel != "") {
		fullLabel = localityLabel + ", " + countryLabel;
	    } else if (adminLabel != "") {
		fullLabel = adminLabel + ", " + countryLabel;
	    } else {
		fullLabel = countryLabel;
	    }
	    return fullLabel;
	};

	var formattedAddress = formatGeocoderResultName(geocoderResult[0].address_components);
	canonicalPlaceNames[geoPlaceRequestName] = formattedAddress;
	if (nullMapCount(latLongPlaceMap) == 0) {
	    callback(geoPlaces, map);
	}
    };

    function formatInfoWindowText(gp) {
	var canonPlace = canonicalPlaceNames[gp.place];
	var postDate = new Date(gp.time * 1000);
	title = gp.title;
	if (typeof title === "undefined") {
	    title = gp.place;
	}
	return "<div class='maps-info-window'><a target='_blank' href=" + gp.url + ">" + title + "</a><br/><i>"
	    + dateFormat(postDate, "dddd, mmmm dS, yyyy") + "<br/>" + canonPlace + "</i></div>";
    };

    function drawRoutes(geoPlaces, map) {
	var path = [];
	var markers = [];
	$.each(geoPlaces, function(i, gp) {
	    var latLong = latLongPlaceMap[gp.place];
	    path.push(latLong);

	    var markerOptions = {map: map, position: latLong, animation: google.maps.Animation.DROP};
	    markers.push(markerOptions);
	    var infoWindowText = formatInfoWindowText(gp);
	    var infoWindow = new google.maps.InfoWindow({content: infoWindowText, disableAutoPan: true});
	    infoWindows.push(infoWindow);
	});
	function onMouseOrTouch() {
	    if (markersRendered) {
		return;
	    }
	    markersRendered = true;
	    animateMarkers(infoWindows, markers);
	};
	$('#map_canvas').on('touchstart', function() {
	    onMouseOrTouch();
	});
	$('#map_canvas').mouseover(function(){
	    onMouseOrTouch();
	});
	var polyline = new google.maps.Polyline({path: path, map: map, geodesic: true, strokeColor: 'grey'});
    };

    function animateMarkers(infoWindows, markers) {
	$.each(markers, function(i, markerOptions) {
	    var markerTimeout = markers.length * 200 - (i * 200);
	    setTimeout(function() {
		var marker = new google.maps.Marker(markerOptions);
		google.maps.event.addListener(marker, 'click', function () {
		    $.each(infoWindows, function(i, w) {
			w.close();
		    });
		    infoWindows[i].open(map, marker);
		});
	    }, markerTimeout);
	});
    };

    function nullMapCount(map) {
	var c = 0;
	$.each(map, function(k, v) {
	    if (v == null) {
		c += 1;
	    }
	});
	return c;
    };

    Array.prototype.max = function() {
	return Math.max.apply({}, this);
    };

    Array.prototype.min = function() {
	return Math.min.apply({}, this);
    };


    function centerMap(geoPlaces, map) {
	var splitLong = -20;
	var overRunPerc = 0.0;
	function mapLong(l) {
	    if (l < 0) {
		l = 360 + l;
	    }
	    return (l - splitLong) % 360;
	};

	function unmapLong(l) {
	    l = (l + splitLong) % 360;
	    if (l > 180) {
		l = l - 360;
	    }
	    return l;
	};

	var adjustedLongs = Array();
	var lats = Array();
	$.each(geoPlaces, function(i, gp) {
	    var latLong = latLongPlaceMap[gp.place];
	    var lat = latLong.Ya;
	    var long = latLong.Za;
	    adjustedLongs.push(mapLong(long));
	    lats.push(lat);
	});
	var minLong = adjustedLongs.min();
	var maxLong = adjustedLongs.max();
	var longRange = maxLong - minLong;
	var longBorder = longRange * overRunPerc;
	minLong = unmapLong(minLong - longBorder);
	maxLong = unmapLong(maxLong + longBorder);
	var minLat = lats.min();
	var maxLat = lats.max();
	var latRange = maxLat - minLat;
	var latBorder = latRange * overRunPerc;
	minLat -= latBorder;
	maxLat += latBorder;
	var sw = new google.maps.LatLng(minLat, minLong);
	var ne = new google.maps.LatLng(maxLat, maxLong);

	varLatLongBounds = new google.maps.LatLngBounds(sw, ne);

	map.fitBounds(varLatLongBounds);
    };

    function extractTumblrLocations() {
	var geoPlaces = [];
	var placeRegex = /place:(.*)$/;
	$.each(tumblr_api_read.posts, function(i, p) {
	    var tags = p.tags;
	    var placeTags = $.map(tags, function(t) {
		m = placeRegex.exec(t);
		if (m && m.length == 2) {
		    return m[1];
		} else {
		    return null;
		}
	    });
	    if (placeTags.length == 0) {
		return;
	    }
	    gp = {
		place: placeTags[0],
		time: p['unix-timestamp'],
		url: p.url,
		title: p['regular-title']
	    };
	    geoPlaces.push(gp);
	});
	return geoPlaces;
    };

    function getURLParameter(name) {
	p = decodeURI(
	    (RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[,null])[1]
	);
	if (p === "null") {
	    return null;
	}
	return p;
    };

    function maybeCenterMapOnUrlParam(map) {
	var center = getURLParameter('q');
	if (center == null) {
	    return false;
	}
	geoCoder.geocode({address: center}, function(gr, status) {
	    map.setCenter(gr[0].geometry.location);
	    map.setZoom(6);
	});
	return true;
    }

    var markersRendered = false;
    var infoWindows = [];
    latLongPlaceMap = {};
    var canonicalPlaceNames = {};
    var geoPlaces = extractTumblrLocations();
    var geoCoder = new google.maps.Geocoder();
    var map = createMap(40.7, -74);

    lookupGeo(geoPlaces, function(geoPlaces, map) {
	drawRoutes(geoPlaces, map);
	centerMap(geoPlaces, map);
	setTimeout(function() {maybeCenterMapOnUrlParam(map)}, 1000);
    });
});
