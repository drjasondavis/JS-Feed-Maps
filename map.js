function Location(userAddress, geoCoderResult) {
    this.userAddress = userAddress;
    this.geoCoderResult = geoCoderResult;
}

Location.prototype = {

    getGeocoderResult: function() {
	return this.geoCoderResult;
    },

    prettyFormatLocation: function() {
	var r = this.geoCoderResult.address_components;	
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
    }
};

function GeoDecoder() {
    this.geocodePlaces = function(addresses, callback) {
	var successes = 0;
	var that = this;
	if( Object.prototype.toString.call(addresses) !== '[object Array]' ) {
	    addresses = [addresses];
	}
	
	$.each(addresses, function(i, place) {
	    setTimeout(function() {
		that.geoCoder.geocode({address: place}, function(geocoderResults, geocoderStatus) {
		    if (!geocoderResults || geocoderResults.length == 0) {
			console.log("Could not find location for address: " + place + ", status: " + geocoderStatus);
			return;
		    }
		    that.cacheLocations(place, geocoderResults[0]);
		    successes += 1;
		    if (successes == addresses.length) {
			callback(that.userLocations);
		    }
		});
	    }, 250 * i);
	});
    };

    this.cacheLocations = function(address, geocoderResult) {	
	var loc = new Location(address, geocoderResult);
	this.userLocations[address] = loc;
    };

    this.getLatLongForLocation = function(place) {
	return this.userLocations[place].getGeocoderResult().geometry.location;
    };

    this.geoCoder = new google.maps.Geocoder();
    this.userLocations = {};
};

function TripMap(homeLocation, mapDiv) {

    this.map = null;

    this.initMap = function(div, lat, long) {
	var mapOptions = {
	    center: new google.maps.LatLng(lat, long),
	    zoom: 10,
	    scrollwheel: false,
	    mapTypeId: google.maps.MapTypeId.ROADMAP
	};
	this.map = new google.maps.Map(document.getElementById(div),
				      mapOptions);
    };

    this.formatInfoWindowText = function(gp) {
	var canonPlace = this.geoCoder.userLocations[gp.place].prettyFormatLocation();
	var postDate = new Date(gp.time * 1000);
	title = gp.title;
	if (typeof title === "undefined") {
	    title = gp.place;
	}
	return "<div class='maps-info-window'><a target='_blank' href=" + gp.url + ">" + title + "</a><br/><i>"
	    + dateFormat(postDate, "dddd, mmmm dS, yyyy") + "<br/>" + canonPlace + "</i></div>";
    };
    
    this.center = function(geoPlaces, callback) {
	Array.prototype.max = function() {
	    return Math.max.apply({}, this);
	};
	
	Array.prototype.min = function() {
	    return Math.min.apply({}, this);
	};

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
	var that = this;
	$.each(geoPlaces, function(i, gp) {
	    var latLong = that.geoCoder.getLatLongForLocation(gp.place);
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

	this.map.fitBounds(varLatLongBounds);
	if (callback) {callback();}
    };



    this.drawRoute = function(places, callback) {
	var that = this;
	p = places;
	var addresses = $.map(places, function(p) { return p.place; });
	this.geoCoder.geocodePlaces(addresses, function() {
	    var path = [];
	    $.each(places, function(i, gp) {
		var latLong = that.geoCoder.getLatLongForLocation(gp.place);
		path.push(latLong);
		
		var markerOptions = {map: that.map, 
				     position: latLong, 
				     animation: google.maps.Animation.DROP};
		that.markers.push(markerOptions);
		var infoWindowText = that.formatInfoWindowText(gp);
		var infoWindow = new google.maps.InfoWindow({content: infoWindowText, 
							     disableAutoPan: true});
		that.infoWindows.push(infoWindow);
	    });
	    var polyline = new google.maps.Polyline({path: path, 
						     map: that.map, 
						     geodesic: true, 
						     strokeColor: 'grey'});
	    that.center(places, callback);
	    setTimeout(function() {that.maybeCenterMapOnUrlParam()}, 1000);
	});
    };

    this.dropPinsAndAnimate = function(callback) {	
	var timeBetweenPins = 200;
	var that = this;
	function doCallback() {
	    if (callback) {
		var time = that.markers.length * timeBetweenPins + 500;
		setTimeout(callback, time);
	    }
	};

	if (this.markersRendered) {
	    doCallback();
	    return;
	}
	this.markersRendered = true;
	$.each(this.markers, function(i, markerOptions) {
	    var markerTimeout = that.markers.length * timeBetweenPins - (i * timeBetweenPins);
	    setTimeout(function() {
		var marker = new google.maps.Marker(markerOptions);
		google.maps.event.addListener(marker, 'click', function () {
		    $.each(that.infoWindows, function(i, w) {
			w.close();
		    });
		    that.infoWindows[i].open(that.map, marker);
		});
	    }, markerTimeout);
	});
	doCallback();
    };

    this.maybeCenterMapOnUrlParam = function() {
	function getURLParameter(name) {
	    p = decodeURI(
		(RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[,null])[1]
	    );
	    if (p === "null") {
		return null;
	    }
	    return p;
	};
	var center = getURLParameter('q');
	if (center == null) {
	    return;
	}
	var that = this;
	this.dropPinsAndAnimate(function() {
	    that.geoCoder.geocodePlaces(center, function(locations) {
		var loc = that.geoCoder.getLatLongForLocation(center);
		that.map.setCenter(loc);
		that.map.setZoom(6);
	    });
	});
    };


    this.mapDiv = mapDiv;
    this.mapCenter = homeLocation;
    this.geoCoder = new GeoDecoder();
    this.markersRendered = false;
    this.markers = [];
    this.infoWindows = [];
    var that = this;

    this.geoCoder.geocodePlaces(this.mapCenter, function(locations) {
	loc = locations[that.mapCenter];	
	var lat = loc.geoCoderResult.geometry.location.lat();
	var long = loc.geoCoderResult.geometry.location.lng();
	that.initMap(that.mapDiv, lat, long);
    });
};

function TumblrLocations() {
    this.extract = function() {
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
	this.locations = geoPlaces;
    };

    this.locations = null;
    this.extract();
};


function loadDependencies(callback) {
    var scripts = ["http://maps.googleapis.com/maps/api/js?key=" + googleMapsKey + "&sensor=false&callback=isNaN",
		   "http://" + tumblrBlogName + ".tumblr.com/api/read/json?num=50",
		   "http://ajax.googleapis.com/ajax/libs/jquery/1.8.3/jquery.min.js",
		   "http://stevenlevithan.com/assets/misc/date.format.js"];

    function loadSingleScript(index) {
	if (index >= scripts.length) {
	    callback();
	    return;
	}
	var s = scripts[index];
	var scriptElement = document.createElement('script');
	scriptElement.setAttribute("type","text/javascript");
	scriptElement.setAttribute("src", s);
	document.getElementsByTagName("head")[0].appendChild(scriptElement);
	scriptElement.onload = function(i) { loadSingleScript(index + 1); };
    }
    loadSingleScript(0);
};

loadDependencies(function() {
    $(document).ready(function() {
	var tumblrLocations = new TumblrLocations();
	var geoPlaces = tumblrLocations.locations;
	var tripMap = new TripMap(homeLocation, mapDiv);
	tripMap.drawRoute(geoPlaces, function() {
	    $('#' + mapDiv).on('touchstart', function() {
		tripMap.dropPinsAndAnimate();
	    });
	    $('#' + mapDiv).mouseover(function() {
		tripMap.dropPinsAndAnimate();
	    });
	});
    });
});
