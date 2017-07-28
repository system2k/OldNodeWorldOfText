module.exports.begin = function() {
	var views = require("./views.js")
	var PRT = +process.env.PORT || SETTINGS.port
	var cluster = require('cluster');
	
	function redirect_to(permanent) {
		if (permanent === true) return 301;
		if (permanent === false) return 302
		if (permanent === undefined) return 510;
	}
	
    xrange = function(start, stop, step) { // block from: http://stackoverflow.com/questions/8273047/javascript-function-similar-to-python-range
        if (typeof stop == 'undefined') {
            stop = start;
            start = 0;
        }
        if (typeof step == 'undefined') {
            step = 1;
        }
        if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
            return [];
        }
        var result = [];
        for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
            result.push(i);
        }
        return result;
    };

    function clone(obj) { // block from: http://stackoverflow.com/questions/728360/how-do-i-correctly-clone-a-javascript-object
        if (null == obj || "object" != typeof obj) return obj;
        var copy = obj.constructor();
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
        }
        return copy;
    }
	
	function parseCookie(cookie) {
		
	}
	
    function _staticfiles(req, callback, res) {
        var parse = url.parse(req.url).pathname.substr(1)
        var mime = mimetypes[parse.replace(/.*[\.\/\\]/, '').toLowerCase()];
        if (mime !== "image/png") {
            callback([200, _static[parse].toString("utf-8")], mime)
        } else {
            callback([200, _static[parse]], mime)
        }
    }

    function _check(url_) {
        for (var i in urlpatterns) {
            var PN = url.parse(url_).pathname
            if (PN === null) {
                PN = ""
            }
            var _match = PN.match(urlpatterns[i][0]);
            if (!!_match && !urlpatterns[i][2]) {
                var fc = urlpatterns[i][1];
				if(typeof fc === "string") {
					fc = views[fc]
				}
				return fc
            }
            if (!!_match && urlpatterns[i][2]) {
				var fc = urlpatterns[i][1]
				if(typeof fc === "string") {
					fc = views[fc]
				}
                return [fc, urlpatterns[i][2]]
            }
        }
        return views.response_404
    }
    var urlpatterns = [ // regexp , function , redirect to (optional)
        ["^(\\w*)$", "yourworld"],
        ["^(beta/(.*))$", "yourworld"],
        ["^(frontpage/(.*))$", "yourworld"],
        ["^favicon\.ico$", null, [redirect_to(false), "/static/favicon.png"]],
		["^home/$", "home"],
		["^accounts/login", "login"],
		["^accounts/logout", "logout"],
		["^accounts/register", "register"],
		["^ajax/protect/$", "protect"],
		["^ajax/unprotect/$", "unprotect"],
		["^ajax/coordlink/$", "coordlink"],
		["^ajax/urllink/$", "urllink"],
		["^accounts/profile/", "profile"],
		["^accounts/private/", "private"],
		["^accounts/configure/$", null, [redirect_to(false), "/accounts/profile/"]],
		["^accounts/configure/(.*)/$", "configure"],
		["^accounts/configure/(beta/\\w+)/$", "configure"],
		["^accounts/member_autocomplete/$", "member_autocomplete"],
		["^accounts/timemachine/(.*)/$", "timemachine"]
    ]
    var staticKeys = Object.keys(_static);
    for (var i in staticKeys) {
        urlpatterns.push(["^" + staticKeys[i] + "$", _staticfiles])
    }

    var server = http.createServer(function(req, res) {
		if(!isDown()) {
			var d = domain.create();
			d.on('error', function(er) {
			   res.statusCode = 500;
			   res.end(_template["500.html"].toString("utf8"));
			   logProblem(er.stack);
			})
			
			d.add(req);
			d.add(res);
			d.run(function(){
				process.nextTick(function() {
					res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
					res.setHeader("Pragma", "no-cache");
					res.setHeader("Expires", "0");
					
					var URL = req.url.substr(1);
					var CHK = _check(URL);
					var fc, TY;
					if (typeof CHK === "function") TY = 0;
					if (typeof CHK === "object") TY = 1;
					if (TY === 0) {
						fc = CHK;
					}
					var rq = req
					if (TY === 1) {
						rq = {
							url: CHK[1][1]
						}
					}
					if(TY === 0){
						fc(rq, function(data, mime, cookie, redir) {
							var Information = {};
							var Location = data[0];
							var Redirect = false;
							var Binary = false;
							
							if(mime) {
								Information['Content-Type'] = mime
								if(mime === "image/png") Binary = true;
							}
							if(TY === 1) {
								Location = CHK[1][0];
								Information['Location'] = CHK[1][1];
								Redirect = true;
							}
							if(redir) {
								Location = 302
								Information['Location'] = redir;
								Redirect = true;
							}
							if(cookie) {
								Information['Set-Cookie'] = cookie;
							}
							
							if(Object.keys(Information).length === 0) {
								res.writeHead(Location)
							} else {
								res.writeHead(Location, Information);
							}
							if(!Binary) {
								res.write(data[1]);
								res.end();
							} else {
								if(Redirect){
									res.end();
								} else {
									res.end(data[1], "binary");
								}
							}
						});
					}
					if(TY === 1){
						var Information = {};
						Information['Location'] = CHK[1][1];
						res.writeHead(302, Information);
						res.end();
					}
				})
			});
		} else {
			var dat = isDown(1);
			var e = "<!DOCTYPE HTML PUBLIC \"-\/\/W3C\/\/DTD HTML 4.01 Transitional\/\/EN\" \"http:\/\/www.w3.org\/TR\/html4\/loose.dtd\">\r\n<html>\r\n    <head>\r\n        <style>\r\n            body {\r\n                background-color: rgb(200,200,200);\r\n            }\r\n            table {\r\n                width: 100%;\r\n                height: 100%;\r\n            }\r\n            #label {\r\n                background-color: white;\r\n                height: 40px;\r\n            }\r\n            * {\r\n                margin: 0;\r\n                padding: 0;\r\n                border-collapse: collapse;\r\n                border-spacing: 0;\r\n            }\r\n            #desc_cont {\r\n                padding: 10px;\r\n                height: 90px;\r\n            }\r\n            #desc {\r\n                background-color: rgb(210,210,210);\r\n                height: 90px;\r\n            }\r\n            #spacing {\r\n                height: 100%;\r\n            }\r\n            #message {\r\n                background-color: rgb(220,220,220);\r\n                white-space: pre;\r\n                font-family: Consolas;\r\n            }\r\n        <\/style>\r\n    <\/head>\r\n    <body>\r\n        <table>\r\n            <tbody>\r\n                <th id=\"label\">\r\n                    The site is offline for updates.\r\n                <\/th>\r\n                <tr>\r\n                    <td id=\"desc_cont\">\r\n                        <div id=\"desc\">\r\n                            This site is temporarily offline so that updates can be made.\r\n                            <br>\r\n                            This site went offline at: <b>{{Offline}}<\/b>\r\n                            <br>\r\n                            <br>\r\n                            Additional messages:\r\n                            <br>\r\n                            <div id=\"message\">{{Message}}<\/div>\r\n                        <\/div>\r\n                    <\/td>\r\n                <\/tr>\r\n                <tr>\r\n                    <td>\r\n                        <div id=\"spacing\"><\/div>\r\n                    <\/td>\r\n                <\/tr>\r\n            <\/tbody>\r\n        <\/table>\r\n    <\/body>\r\n<\/html>".replace(/{{Offline}}/, dat[1]).replace(/{{Message}}/, dat[0]);
			res.end(e);
		}
    })
    server.listen(PRT, function() {
        var addr = server.address();
        console.log("Server is hosted on " + addr.address + ":" + addr.port)
    });
}