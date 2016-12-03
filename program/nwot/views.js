var $;
var xrange;

var path = require("path")

module.exports.vars = function(a) {
	$ = a;
	xrange = $.xrange
}

var next_proc_id = 0;

var templateCache = {};

var tileWidth = 16;
var tileHeight = 8;
var tileArea = tileWidth * tileHeight;

function world_get_or_create(name, callback) {
	$.execSQL("get", "SELECT * FROM ywot_world WHERE name=? COLLATE NOCASE", function(a, b) {
		if (b === undefined) {
			if(name.match(/^(\w*)$/g)) {
				var dat = $.make_date(Date.now());
				
				$.execSQL("run", "INSERT INTO ywot_world VALUES(null, ?, null, ?, ?, 1, 1, '{}')", function(a, b) {
					$.execSQL("get", "SELECT * FROM ywot_world WHERE name=? COLLATE NOCASE", function(a, b){
						callback(b.id, b);
					}, [name])
				}, [name, dat, dat])
			} else {
				callback(null, undefined)
			}
		} else {
			callback(b.id, b);
		}
	}, [name])
}

function parseCookie(cookie) {
	try {
		if(typeof cookie !== "string") {
			return {};
		}
		cookie = cookie.split(";");
		var list = {}
		for(i in cookie) {
			var c = cookie[i].split("=");
			if(c.length > 2) {
				var ar = c;
				var var2 = ar.pop();
				ar = ar.join("=")
				ar = ar.replace(/ /g, "");
				var2 = var2.replace(/ /g, "");
				list[ar] = var2
			} else if(c.length === 2) {
				list[decodeURIComponent(c[0].replace(/ /g, ""))] = decodeURIComponent(c[1].replace(/ /g, ""))
			} else if(c.length === 1) {
				if(c[0] !== "") list[c[0]] = null
			}
		}
		return list;
	} catch(e) {
		return {};
	}
}

function csplit(str, rem, count) {
	var arr = str.split(rem)
	var result = arr.splice(0,count);
	result.push(arr.join(rem));
	return result;
}

module.exports.yourworld = function(req, callback) {
	var cookie = req.headers.cookie
	var URL = $.url.parse(req.url)
	var prse = URL.query;
	var queryData = ""
	var error = false;
	
	var wldname = URL.pathname
	if (wldname) wldname = wldname.substr(1)
	if(req.method === "POST") {
		req.on('data', function(data) {
			queryData += data;
			if (queryData.length > 1000000) {
				queryData = "";
				callback([413, ""])
				error = true
				req.connection.destroy();
			}
		});
		req.on('end', world_);
	}
	if(req.method === "GET") {
		world_();
	}
	function world_() {
		if (error) return;
		if (req.method === "GET") {
			if (!prse) {
				world_get_or_create(wldname, cmp)
				function cmp(a, b) {
					if(!b) {
						module.exports.response_404(req, callback)
						return;
					}
					function wld(canwrite, canadmin, cl, ul, gtc) {
						var comp = $.swig.compileFile("./program/html/templates/yourworld.html")
						var output = comp({
							urlhome: "/home/",
							state: JSON.stringify({
								canWrite: canwrite,
								canAdmin: canadmin,
								worldName: b.name,
								features: {
									coordLink: cl,
									urlLink: ul,
									go_to_coord: gtc
								}
							})
						});
						callback([200, output])
					}
					manageDefaultCookie(req.headers.cookie, nxt_)
					function nxt_(a) {
						var data = a[1];
						if(b.public_readable) {
							var cw; // can_write
							if(b.public_writable) {
								cw = true;
							} else {
								cw = false;
							}
							//can_admin, coordLink, urlLink, go_to_coord
							var ca = false, cl = false, ul = false, gtc = false;
							if(data.authenticated) {
								if(data.id === b.owner_id) {
									cw = true, ca = true, cl = true, ul = true, gtc = true;
								}
							}
							wld(cw, ca, cl, ul, gtc);
						} else {
							if(data.authenticated) {
								if(data.id === b.owner_id) {
									wld(true, true, true, true, true)
								} else {
									priv_callbk(a)
								}
							} else {
								priv_callbk(a)
							}
							function priv_callbk(a) {
								callback([0, ""], null, a[0], "/accounts/private/")
							}
						}
					}
				}
			} else {
				var response = {};
				if (wldname !== undefined) {
					var QU = $.querystring.parse(prse)
					if (QU.fetch === '1' && (QU.v === '2' || QU.v === '3') && QU.min_tileY && QU.min_tileX && QU.max_tileY && QU.max_tileX) {
						var min_tileY = parseInt(QU.min_tileY)
						var min_tileX = parseInt(QU.min_tileX)
						var max_tileY = parseInt(QU.max_tileY)
						var max_tileX = parseInt(QU.max_tileX)
						if (min_tileY < max_tileY && min_tileX < max_tileX) {
							if (((max_tileY - min_tileY) * (max_tileX - min_tileX)) < 400) {
								function op(wld_id, perm) {
									if(!perm) {
										module.exports.response_404(req, callback)
										return;
									}
									function public_wld(){
										var YTileRange = xrange(min_tileY, max_tileY + 1);
										var XTileRange = xrange(min_tileX, max_tileX + 1);
										var rta = []
										for (ty in YTileRange) {
											for (tx in XTileRange) {
												response[YTileRange[ty] + "," + XTileRange[tx]] = null
												rta.push([YTileRange[ty], XTileRange[tx]])
											}
										}
										for (i in rta) {
											rta[i] = ["SELECT * FROM ywot_tile WHERE world_id=? AND tileY=? AND tileX=?", [wld_id, rta[i][0], rta[i][1]]]
										}
										function finish_return_tiles(re) {
											for (i in re) {
												if (re[i] !== undefined) {
													var co = re[i]
													response[co.tileY + "," + co.tileX] = {
														content: co.content,
														properties: JSON.parse(co.properties)
													}
												} else {
													response[YTileRange[ty] + "," + XTileRange[tx]] = null
												}
											}
											_done()
										}
										$.returnTables(rta, finish_return_tiles)
									}
									if(perm.public_readable) {
										public_wld()
									} else {
										manageDefaultCookie(req.headers.cookie, nxt_)
										function nxt_(a) {
											var data = a[1];
											if(data.authenticated) {
												if(data.id === perm.owner_id) {
													public_wld()
												} else {
													priv_callbk(a)
												}
											} else {
												priv_callbk(a)
											}
										}
									}
								}
								function priv_callbk(a) {
									callback([0, ""], null, a[0], "/accounts/private/")
								}
								world_get_or_create(wldname, op)
							}
						}
					}
				}
				function _done() {
					callback([200, JSON.stringify(response)])
				}
			}
		}
		if(req.method === "POST") {
			var QD = $.querystring.parse(queryData)
			var edi = QD.edits
			var DAT;
			function op(wld_id, perm) {
				if(!perm) {
					module.exports.response_404(req, callback)
					return;
				}
				function access_pcd() {
					if(typeof edi === "string") {
						edi = [edi];
					}
					var tiles = {}
					var queries = [];
					var new_queries = []
					
					var done = [];
					
					for (i in edi) {
						edi[i] = csplit(edi[i], ",", 5);
						edi[i][0] = parseInt(edi[i][0])
						edi[i][1] = parseInt(edi[i][1])
						edi[i][2] = parseInt(edi[i][2])
						edi[i][3] = parseInt(edi[i][3])
						if (tiles[edi[i][0] + "," + edi[i][1]] === undefined) {
							queries.push(["SELECT * FROM ywot_tile WHERE world_id=? AND tileY=? AND tileX=?", [wld_id, edi[i][0], edi[i][1]]])
							tiles[edi[i][0] + "," + edi[i][1]] = []
						}
						tiles[edi[i][0] + "," + edi[i][1]].push(edi[i])
					}
					function return_tables_to_edit(data) {
						for (i in data) {
							if (data[i]) {
								var pos = data[i].tileY + "," + data[i].tileX
								var con = data[i].content.split("")
								var LNK = JSON.parse(data[i].properties)
								var _access = false;
								
								var prot = false;
								if(LNK.protected) {
									prot = true
								}
								if(prot) {
									if(DAT[1].authenticated) {
										if(DAT[1].id === perm.owner_id) {
											_access = true
										}
									}
								} else {
									_access = true
								}
								
								if(_access) {
									for (j in tiles[pos]) {
										var POS = tiles[pos][j];
										if(POS) {
											if(POS[0] !== undefined && POS[1] !== undefined && POS[2] !== undefined && POS[3] !== undefined && POS[4] !== undefined && POS[5] !== undefined) {
												if(typeof POS[0] === "number" && typeof POS[1] === "number" && typeof POS[2] === "number" && typeof POS[3] === "number" && typeof POS[5] === "string") {
													if(POS[5].length === 1) {
														if(LNK.cell_props) {
															if(LNK.cell_props[POS[2]] !== undefined) {
																if(LNK.cell_props[POS[2]][POS[3]] !== undefined) {
																	LNK.cell_props[POS[2]][POS[3]] = {};
																}
															}
														}
														con[POS[2] * tileWidth + POS[3]] = POS[5]
														var POS = POS;
														done.push([POS[0], POS[1], POS[2], POS[3], POS[4], POS[5]])
													}
												}
											}
										}
									}
									if(done.length > 0) {
										con = con.join("")
										new_queries.push(["UPDATE ywot_tile SET (content,properties)=(?, ?) WHERE world_id=? AND tileY=? AND tileX=?", [con.slice(0,tileArea), JSON.stringify(LNK), wld_id, data[i].tileY, data[i].tileX]])
										
										var u_id = DAT[1].id;
										if(!u_id) u_id = null;
										var dat = $.make_date(Date.now());
										var content_ = JSON.stringify(tiles[pos]);
										new_queries.push(["INSERT INTO ywot_edit VALUES(null, ?, null, ?, ?, ?)", [u_id, wld_id, dat, content_]])
									}
								}
								delete tiles[pos] // delete tiles from cache if they are in the request
							}
						}
						for (i in tiles) { // insert remaining tiles
							var con = " ".repeat(tileArea).split("");
							for (j in tiles[i]) {
								var POS = tiles[i][j]
								if(POS) {
									if(POS[0] !== undefined && POS[1] !== undefined && POS[2] !== undefined && POS[3] !== undefined && POS[4] !== undefined && POS[5] !== undefined) {
										if(typeof POS[0] === "number" && typeof POS[1] === "number" && typeof POS[2] === "number" && typeof POS[3] === "number" && typeof POS[5] === "string") {
											if(POS[5].length === 1) {
												con[POS[2] * tileWidth + POS[3]] = POS[5]
												var POS = POS;
												done.push([POS[0], POS[1], POS[2], POS[3], POS[4], POS[5]])
											}
										}
									}
								}
							}
							if(done.length > 0) {
								con = con.join("")
								var c = i.split(",");
								c[0] = parseInt(c[0])
								c[1] = parseInt(c[1])
								var dat = $.make_date(Date.now());
								new_queries.push(["INSERT INTO ywot_tile VALUES(null, ?, ?, ?, ?, '{}', ?)", [wld_id, con.slice(0,tileArea), c[0], c[1], dat]])
								
								var u_id = DAT[1].id;
								if(!u_id) u_id = null;
								var dat = $.make_date(Date.now());
								var content_ = JSON.stringify(tiles[i]);
								new_queries.push(["INSERT INTO ywot_edit VALUES(null, ?, null, ?, ?, ?)", [u_id, wld_id, dat, content_]])
							}
						}
						if(new_queries.length > 0) {
							$.createTables(new_queries, function(){
								callback([200, JSON.stringify(done)])
							})
						} else {
							callback([200, "[]"])
						}
					}
					$.returnTables(queries, return_tables_to_edit)
				}
				
				//perm
				if(perm.public_writable && perm.public_readable) {
					access_pcd()
				} else {
					var data = DAT[1];
					if(data.authenticated) {
						if(data.id === perm.owner_id) {
							access_pcd()
						} else {
							priv_callbk()
						}
					} else {
						priv_callbk()
					}
				}
				function priv_callbk() {
					callback([403, ""], null, DAT[0])
				}
			}
			manageDefaultCookie(req.headers.cookie, nxt_)
			function nxt_(a) {
				DAT = a;
				world_get_or_create(wldname, op)
			}
		}
	}
}

function manageDefaultCookie(cookie, callback) {
	cookie = parseCookie(cookie)
	var SendCookie = null;
	var ar = {
		authenticated: false,
		username: "",
		id: null,
		_csrftoken: null
	};
	var SQLWork = false;
	if(!cookie.csrftoken) {
		var TKN = tknNew(32)
		var date = Date.now();
		SendCookie = "csrftoken=" + TKN + "; expires=" + CookieExpires(date + Year) + "; path=/";
		ar._csrftoken = TKN;
	} else {
		ar._csrftoken = cookie.csrftoken;
	}
	if(cookie.sessionid){
		$.execSQL("get", "SELECT * FROM django_session WHERE session_key=?", resp_, cookie.sessionid);
		var SQLWork = false;
		function resp_(a, b) {
			if(b) {
				ar = JSON.parse(Db64(b.session_data));
				if(ar.csrftoken === cookie.csrftoken) {
					ar.authenticated = true;
					callback([SendCookie, ar]);
					SQLWork = true
				}
			}
			if(!SQLWork) {
				callback([SendCookie, ar]);
			}
		}
	} else {
		callback([SendCookie, ar, cookie.csrftoken]);
	}
}

module.exports.home = function(req, callback) {
	var tmp = $.swig.compileFile("./program/html/templates/home.html")
	manageDefaultCookie(req.headers.cookie, next)
	function next(a) {
		var data = a[1];
		var output = tmp({
			user_is_authenticated: data.authenticated,
			user: data.username,
			block_super: "Your World Of Text",
			url_home: "/home/",
			url_profile: "/accounts/profile/",
			url_logout: "/accounts/logout",
			url_auth_login: "/accounts/login/",
			url_registration_register: "/accounts/register/"
		});
		callback([200, output], null, a[0])
	}
}

module.exports.response_404 = function(req, callback) {
	var tmp = $.swig.compileFile("./program/html/templates/404.html")
	manageDefaultCookie(req.headers.cookie, next)
	function next(a) {
		var data = a[1];
		var output = tmp({
			user_is_authenticated: data.authenticated,
			user: data.username,
			block_super: "Your World Of Text",
			url_home: "/home/",
			url_profile: "/accounts/profile/",
			url_logout: "/accounts/logout",
			url_auth_login: "/accounts/login/",
			url_registration_register: "/accounts/register/"
		});
		callback([200, output], null, a[0])
	}
}

function default_login(token, auth, error, user, user_error) {
	var tmp = $.swig.compileFile("./program/html/templates/registration/login.html")
	var output = tmp({
		user_is_authenticated: auth,
		user: user,
		block_super: "Your World Of Text",
		url_home: "/home/",
		url_profile: "/accounts/profile/",
		url_logout: "/accounts/logout",
		url_auth_login: "/accounts/login/",
		url_registration_register: "/accounts/register/",
		
		auth_login_url: "/accounts/login/",
		form_username_label_tag: "<label for=\"id_username\">Username</label>",
		form_username: "<input id=\"id_username\" type=\"text\" name=\"username\" maxlength=\"30\" " + user_error + "/>",
		form_password_label_tag: "<label for=\"id_password\">Password</label>",
		form_password: "<input type=\"password\" name=\"password\" id=\"id_password\" />",
		next: "",
		csrf_token: "<div style='display:none'><input type='hidden' name='csrfmiddlewaretoken' value='" + token + "' /></div>",
		form_errors: error
	});
	return output;
}

var TOK = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
function tknNew(len) {
	var TK = "";
	for(var i = 0; i < len; i++) {
		TK += TOK.charAt(Math.floor(Math.random()*TOK.length))
	}
	return TK;
}

//In milliseconds
var Second = 1000;
var Minute = 60000;
var Hour = 3600000;
var Day = 86400000;
var Week = 604800000;
var Month = 2628002880;
var Year = 31536034560;
var Decade = 315360345600;

function CookieExpires(timeStamp) {
    var dayWeekList = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var monthList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    var _DayOfWeek = dayWeekList[new Date(timeStamp).getDay()];
    var _Day = new Date(timeStamp).getDate();
    var _Month = monthList[new Date(timeStamp).getMonth()];
    var _Year = new Date(timeStamp).getFullYear();
    var _Hour = new Date(timeStamp).getHours();
    var _Minute = new Date(timeStamp).getMinutes();
    var _Second = new Date(timeStamp).getSeconds();

    var compile = _DayOfWeek + ", " + _Day + " " + _Month + " " + _Year + " " + _Hour + ":" + _Minute + ":" + _Second + " UTC";
    return compile
}

function Eb64(str) {
	return new Buffer(str).toString('base64')
}
function Db64(b64str) {
	return new Buffer(b64str, 'base64').toString('ascii')
}

module.exports.login = function(req, callback, mod, opt) {
	var cookie = req.headers.cookie
	cookie = parseCookie(cookie)
	var output;
	var SendCookie = null;
	var S_ID; // sessionid
	var _CSRF; // csrftoken
	function checkCookie(auth, error, success, user, err) {
		if(cookie.csrftoken) {
			_CSRF = cookie.csrftoken.slice(0, 32);
			var user_err;
			if(err) {
				user_err = "value=\"" + err + "\""
			}
			output = default_login(cookie.csrftoken, auth, error, user, user_err)
			S_ID = tknNew(32);
			var date = Date.now();
			if(success) {
				SendCookie = "sessionid=" + S_ID + "; expires=" + CookieExpires(date + Month) + "; path=/";
			}
		} else {
			var user_err;
			if(err) {
				user_err = "value=\"" + err + "\""
			}
			var TKN = tknNew(32)
			S_ID = tknNew(32)
			_CSRF = TKN;
			output = default_login(TKN, auth, error, user, user_err)
			var date = Date.now();
			SendCookie = "csrftoken=" + TKN + "; expires=" + CookieExpires(date + Year) + "; path=/";
			if(success) {
				SendCookie = [SendCookie, "sessionid=" + S_ID + "; expires=" + CookieExpires(date + Month) + "; path=/"]
			}
		}
	}
	
	if(req.method === "GET") {
		manageDefaultCookie(req.headers.cookie, next)
		function next(a) {
			var data = a[1];
			checkCookie(data.authenticated, false, false, data.username, false)
			callback([200, output], null, a[0])
		}
	}
	if(req.method === "POST" || mod) {
		if(!mod){
			var queryData = "";
			var error;
			req.on('data', function(data) {
				queryData += data;
				if (queryData.length > 1000000) {
					queryData = "";
					callback([413, ""])
					error = true
					req.connection.destroy();
				}
			});
			req.on('end', account_);
		} else {
			var error = false;
			account_();
		}
		var user, pass, output;
		function account_() {
			if(error) return;
			if(!mod){
				var QD = $.querystring.parse(queryData)
				user = QD.username
				pass = QD.password;
			} else{
				user = opt.username;
				pass = opt.password;
			}
			$.execSQL("get", "SELECT * FROM auth_user WHERE username=? COLLATE NOCASE", account_fnd_done, [user])
		}
		function account_fnd_done(a, b) {
			if(b === undefined) {
				checkCookie(false, true, false, false, user)
				callback([200, output], null, SendCookie)
			} else {
				var res = $.checkHash(b.password, b.username, pass)
				if(!res) {
					checkCookie(false, true, false, false, user)
					callback([200, output], null, SendCookie)
				} else {
					checkCookie(true, false, true)
					var _DT = JSON.stringify({
						type: "sessionid_auth",
						date: Date.now(),
						csrftoken: _CSRF,
						id: b.id,
						username: b.username
					});
					var _expire = $.make_date(Date.now() + (Day * 10));
					$.execSQL("run", "INSERT INTO django_session VALUES(?, ?, ?)", function(){
						var redir = "/accounts/profile/"
						if(!mod){
							var URL = $.url.parse(req.headers.referer)
							var prse = URL.query;
							var QU = $.querystring.parse(prse)
							if(QU.next !== undefined) {
								redir = QU.next;
							}
						}
						callback([0, ""], null, SendCookie, redir)
					}, [S_ID, Eb64(_DT), _expire])
				}
			}
		}
	}
}

module.exports.logout = function(req, callback) {
	var cookie = parseCookie(req.headers.cookie);
	if(cookie.sessionid) {
		$.execSQL("run", "DELETE FROM django_session WHERE session_key=?", after_logout, [cookie.sessionid])
		function after_logout() {
			callback([0, ""], false, "sessionid=; expires=" + CookieExpires(0) + "; path=/", "/home/")
		}
	}
}
/*
csrfmiddlewaretoken:
username:
email:
password1:
password2:
*/
module.exports.register = function(req, callback) {
	function renderRegister(e1, e2, e3, e4){
		var tmp = $.swig.compileFile("./program/html/templates/registration/registration_form.html")
		manageDefaultCookie(req.headers.cookie, next)
		function next(a) {
			var data = a[1];
			var output = tmp({
				user_is_authenticated: data.authenticated,
				user: data.username,
				block_super: "Your World Of Text",
				url_home: "/home/",
				url_profile: "/accounts/profile/",
				url_logout: "/accounts/logout",
				url_auth_login: "/accounts/login/",
				url_registration_register: "/accounts/register/",
				
				auth_login_url: "/accounts/login/",
				form_username: "<input id=\"id_username\" type=\"text\" name=\"username\" maxlength=\"30\" " + "" + "/>",
				form_email: "<input id=\"id_email\" type=\"text\" class=\"required\" name=\"email\" maxlength=\"75\" />",
				form_password1: "<input id=\"id_password1\" type=\"password\" class=\"required\" name=\"password1\" />",
				form_password2: "<input id=\"id_password2\" type=\"password\" class=\"required\" name=\"password2\" />",
				csrf_token: "<div style='display:none'><input type='hidden' name='csrfmiddlewaretoken' value='" + data._csrftoken + "' /></div>",
				form_username_errors: e1,
				form_email_errors: e2,
				form_password1_errors: e3,
				form_password2_errors: e4
			});
			callback([200, output], null, a[0])
		}
	}
	
	if(req.method === "GET") {
		renderRegister(null, null, null, null)
	}
	if(req.method === "POST") {
		var queryData = "";
		var error = false;
		req.on('data', function(data) {
			queryData += data;
			if (queryData.length > 1000000) {
				queryData = "";
				callback([413, ""])
				error = true
				req.connection.destroy();
			}
		});
		req.on('end', registration);
		function registration() {
			if(error) return;
			manageDefaultCookie(req.headers.cookie, next)
			function next(a){
				QD = $.querystring.parse(queryData)
				var data = a[1]
				if(QD.csrfmiddlewaretoken === data._csrftoken) {
					var e1, e2, e3, e4
					var err = false;
					if(QD.password1 !== QD.password2) {
						e4 = ["The two password fields didn't match."]
						err = true;
					}
					if(QD.username.length > 30) {
						e1 = ["The username must be 30 characters or less."]
						err = true;
					}
					if(err) renderRegister(e1,e2,e3,e4)
					if(!err) {
						$.execSQL("get", "SELECT username FROM auth_user WHERE username=? COLLATE NOCASE", userCheck, [QD.username])
						function userCheck(a, b){
							if(b) {
								renderRegister(["The username already exists."],null,null,null)
							} else {
								var Date_ = $.make_date(Date.now())
								var passHash = $.encryptHash(QD.username, QD.password1)
								$.execSQL("run", "INSERT INTO auth_user VALUES(null, ?, '', '', ?, ?, 0, 1, 0, ?, ?)", function(a, b){
									module.exports.login(req, function(a,b,c,d){
										callback(a,b,c,d)
									}, true, {username: QD.username, password: QD.password1})
								}, [QD.username, QD.email, passHash, Date_, Date_])
							}
						}
					}
				}
			}
		}
	}
}

module.exports.protect = function(req, callback) {
	var queryData = "";
	var error = false;
	var qd;
	var AddCookie;
	req.on('data', function(data) {
		queryData += data;
		if (queryData.length > 1000000) {
			queryData = "";
			callback([413, ""])
			error = true
			req.connection.destroy();
		}
	});
	req.on('end', checkaccess);
	function checkaccess() {
		QD = $.querystring.parse(queryData)
		world_get_or_create(QD.namespace, next)
		var WLDDATA = {};
		function next(a, b) {
			WLDDATA = b;
			manageDefaultCookie(req.headers.cookie, next2);
		}
		function next2(a, b) {
			AddCookie = a[0]
			var data = a[1];
			if(data.id === WLDDATA.owner_id) {
				tileaccess()
			} else {
				callback([403, "", false, AddCookie])
			}
		}
	}
	function tileaccess() {
		if(error) return;
		world_get_or_create(QD.namespace, res_)
		function res_(WLD_ID) {
			$.execSQL("get", "SELECT * FROM ywot_tile WHERE world_id=? AND tileY=? AND tileX=?", tilecall, [WLD_ID, QD.tileY, QD.tileX])
			function tilecall(a, b) {
				if(b) {
					var prse = JSON.parse(b.properties);
					prse.protected = true
					$.execSQL("run", "UPDATE ywot_tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?", next_, [JSON.stringify(prse), WLD_ID, QD.tileY, QD.tileX])
				} else {
					var prse = {
						protected: true
					}
					var dat = $.make_date(Date.now());
					$.execSQL("run", "INSERT INTO ywot_tile VALUES(null, ?, ?, ?, ?, ?, ?)", next_, [WLD_ID, " ".repeat(tileArea), QD.tileY, QD.tileX, JSON.stringify(prse), dat])
				}
			}
			function next_() {
				callback([200, "", false, AddCookie])
			}
		}
	}
}

module.exports.unprotect = function(req, callback) {
	var queryData = "";
	var error = false;
	var AddCookie;
	req.on('data', function(data) {
		queryData += data;
		if (queryData.length > 1000000) {
			queryData = "";
			callback([413, ""])
			error = true
			req.connection.destroy();
		}
	});
	req.on('end', checkaccess);
	function checkaccess() {
		QD = $.querystring.parse(queryData)
		world_get_or_create(QD.namespace, next)
		var WLDDATA = {};
		function next(a, b) {
			WLDDATA = b;
			manageDefaultCookie(req.headers.cookie, next2);
		}
		function next2(a, b) {
			var data = a[1];
			if(data.id === WLDDATA.owner_id) {
				tileaccess()
			} else {
				callback([403, "", false, AddCookie])
			}
			
			AddCookie = a[0]
		}
	}
	function tileaccess() {
		if(error) return;
		var QD = $.querystring.parse(queryData)
		world_get_or_create(QD.namespace, res_)
		function res_(WLD_ID) {
			$.execSQL("get", "SELECT * FROM ywot_tile WHERE world_id=? AND tileY=? AND tileX=?", tilecall, [WLD_ID, QD.tileY, QD.tileX])
			function tilecall(a, b) {
				if(b) {
					var prse = JSON.parse(b.properties);
					prse.protected = false
					$.execSQL("run", "UPDATE ywot_tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?", next_, [JSON.stringify(prse), WLD_ID, QD.tileY, QD.tileX])
				}
			}
			function next_() {
				callback([200, ""])
			}
		}
	}
}

module.exports.coordlink = function(req, callback) {
	var queryData = "";
	var error = false;
	var AddCookie;
	req.on('data', function(data) {
		queryData += data;
		if (queryData.length > 1000000) {
			queryData = "";
			callback([413, ""])
			error = true
			req.connection.destroy();
		}
	});
	req.on('end', checkaccess);
	function checkaccess() {
		QD = $.querystring.parse(queryData)
		world_get_or_create(QD.namespace, next)
		var WLDDATA = {};
		function next(a, b) {
			WLDDATA = b;
			manageDefaultCookie(req.headers.cookie, next2);
		}
		function next2(a, b) {
			AddCookie = a[0]
			var data = a[1];
			if(data.id === WLDDATA.owner_id) {
				tileaccess()
			} else {
				callback([403, "", false, AddCookie])
			}
		}
	}
	function tileaccess() {
		if(error) return;
		var QD = $.querystring.parse(queryData)
		world_get_or_create(QD.namespace, res_)
		function res_(WLD_ID) {
			$.execSQL("get", "SELECT * FROM ywot_tile WHERE world_id=? AND tileY=? AND tileX=?", tilecall, [WLD_ID, QD.tileY, QD.tileX])
			function tilecall(a, b) {
				if(b) {
					var prse = JSON.parse(b.properties);
					if(prse.cell_props === undefined) {
						prse.cell_props = {};
					}
					if(prse.cell_props[QD.charY] === undefined) {
						prse.cell_props[QD.charY] = {};
					}
					if(prse.cell_props[QD.charY][QD.charX] === undefined) {
						prse.cell_props[QD.charY][QD.charX] = {};
					}
					prse.cell_props[QD.charY][QD.charX].link = {
						'type': 'coord',
						'link_tileY': QD.link_tileY,
						'link_tileX': QD.link_tileX
					}
					$.execSQL("run", "UPDATE ywot_tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?", next_, [JSON.stringify(prse), WLD_ID, QD.tileY, QD.tileX])
				} else {
					var prse = {};
					prse.cell_props = {};
					prse.cell_props[QD.charY] = {};
					prse.cell_props[QD.charY][QD.charX] = {}
					prse.cell_props[QD.charY][QD.charX].link = {
						'type': 'coord',
						'link_tileY': QD.link_tileY,
						'link_tileX': QD.link_tileX
					};
					var dat = $.make_date(Date.now());
					$.execSQL("run", "INSERT INTO ywot_tile VALUES(null, ?, ?, ?, ?, ?, ?)", next_, [WLD_ID, " ".repeat(tileArea), QD.tileY, QD.tileX, JSON.stringify(prse), dat])
				}
			}
			function next_() {
				callback([200, ""])
			}
		}
	}
}

module.exports.urllink = function(req, callback) {
	var queryData = "";
	var error = false;
	var AddCookie;
	req.on('data', function(data) {
		queryData += data;
		if (queryData.length > 1000000) {
			queryData = "";
			callback([413, ""])
			error = true
			req.connection.destroy();
		}
	});
	req.on('end', checkaccess);
	function checkaccess() {
		QD = $.querystring.parse(queryData)
		world_get_or_create(QD.namespace, next)
		var WLDDATA = {};
		function next(a, b) {
			WLDDATA = b;
			manageDefaultCookie(req.headers.cookie, next2);
		}
		function next2(a, b) {
			AddCookie = a[0]
			var data = a[1];
			if(data.id === WLDDATA.owner_id) {
				tileaccess()
			} else {
				callback([403, "", false, AddCookie])
			}
		}
	}
	function tileaccess() {
		if(error) return;
		var QD = $.querystring.parse(queryData)
		world_get_or_create(QD.namespace, res_)
		function res_(WLD_ID) {
			$.execSQL("get", "SELECT * FROM ywot_tile WHERE world_id=? AND tileY=? AND tileX=?", tilecall, [WLD_ID, QD.tileY, QD.tileX])
			function tilecall(a, b) {
				if(b) {
					var prse = JSON.parse(b.properties);
					if(prse.cell_props === undefined) {
						prse.cell_props = {};
					}
					if(prse.cell_props[QD.charY] === undefined) {
						prse.cell_props[QD.charY] = {};
					}
					if(prse.cell_props[QD.charY][QD.charX] === undefined) {
						prse.cell_props[QD.charY][QD.charX] = {};
					}
					prse.cell_props[QD.charY][QD.charX].link = {
						'type': 'url',
						'url': QD.url
					}
					$.execSQL("run", "UPDATE ywot_tile SET properties=? WHERE world_id=? AND tileY=? AND tileX=?", next_, [JSON.stringify(prse), WLD_ID, QD.tileY, QD.tileX])
				} else {
					var prse = {};
					prse.cell_props = {};
					prse.cell_props[QD.charY] = {};
					prse.cell_props[QD.charY][QD.charX] = {}
					prse.cell_props[QD.charY][QD.charX].link = {
						'type': 'url',
						'url': QD.url
					};
					var dat = $.make_date(Date.now());
					$.execSQL("run", "INSERT INTO ywot_tile VALUES(null, ?, ?, ?, ?, ?, ?)", next_, [WLD_ID, " ".repeat(tileArea), QD.tileY, QD.tileX, JSON.stringify(prse), dat])
				}
			}
			function next_() {
				callback([200, ""])
			}
		}
	}
}
function listOwned(data) {
	var ar = [];
	if(data) {
		for(i in data) {
			var DAT = data[i]
			var whiteListCount = 0;
			
			var plural = "";
			if(whiteListCount !== 1) {
				plural = "s"
			}
			ar.push({
				public_writable: DAT.public_writable,
				public_readable: DAT.public_readable,
				whitelist_set_count: whiteListCount,
				conf_url: "/accounts/configure/" + DAT.name + "/",
				get_absolute_url: "/" + DAT.name,
				url: DAT.name,
				pluralize: plural
			})
		}
	}
	return ar;
}

module.exports.profile = function(req, callback) {
	function renderProfile(tmp, data, a, callback, message) {
		var _id = data.id;
		var worldlist = []
		var memberships = [];
			//message = "World \"" + claimed + "\" successfully claimed."
		$.execSQL("all", "SELECT * FROM ywot_world WHERE owner_id=?", members, [_id])
		function members(_a, b) {
			worldlist = listOwned(b)
			$.execSQL("all", "SELECT * FROM ywot_whitelist WHERE user_id=?", wldCall, [_id])
		}
		function wldCall(_a, b) {
			var rta = [];
			if(b) {
				for(i in b) {
					var DAT = b[i]
					rta.push(["SELECT name from ywot_world where id=?", [DAT.world_id]])
				}
			}
			$.returnTables(rta, returnWorldName)
			if(rta.length === 0) returnWorldName(null, undefined)
			function returnWorldName(b) {
				if(b) {
					for(i in b) {
						var DAT = b[i];
						memberships.push({
							get_absolute_url: "/" + DAT.name,
							url: DAT.name
						})
					}
				}
				var output = tmp({
					user_is_authenticated: true,
					user: data.username,
					block_super: "Your World Of Text",
					url_home: "/home/",
					url_profile: "/accounts/profile/",
					url_logout: "/accounts/logout",
					url_auth_login: "/accounts/login/",
					url_registration_register: "/accounts/register/",
					
					message: message,
					csrf_token: "<div style='display:none'><input type='hidden' name='csrfmiddlewaretoken' value='" + data.csrftoken + "' /></div>",
					worlds_owned: worldlist,
					memberships: memberships
				});
				callback([[200, output], null, a[0]])
			}
		}
	}

	function processProfile(ecallback, message) {
		var tmp = $.swig.compileFile("./program/html/templates/profile.html")
		manageDefaultCookie(req.headers.cookie, next)
		function next(a) {
			var data = a[1];
			if(data.authenticated) {
				renderProfile(tmp, data, a, function(a1){
					if(!ecallback) {
						callback(a1[0], a1[1], a1[2])
					} else {
						ecallback(a1[0], a1[1], a1[2])
					}
				}, message)
			} else {
				if(!ecallback) {
					callback([200, ""], null, a[0], "/accounts/login/?next=/accounts/profile/")
				} else {
					ecallback([200, ""], null, a[0], "/accounts/login/?next=/accounts/profile/")
				}
			}
		}
	}
	
	if(req.method === "GET") {
		processProfile()
	}
	if(req.method === "POST") {
		var queryData = "";
		var error;
		req.on('data', function(data) {
			queryData += data;
			if (queryData.length > 1000000) {
				queryData = "";
				callback([413, ""])
				error = true
				req.connection.destroy();
			}
		});
		req.on('end', conf_);
		function conf_() {
			if(error) return;
			QD = $.querystring.parse(queryData)
			manageDefaultCookie(req.headers.cookie, next)
			var access = false;
			var message = "";
			function next(a) {
				var data = a[1];
				var cookie = parseCookie(req.headers.cookie)
				if(data.authenticated && data.csrftoken === QD.csrfmiddlewaretoken) {
					if(QD.worldname.match(/^(\w*)$/g)){
						$.execSQL("get", "SELECT * FROM ywot_world WHERE name=? COLLATE NOCASE", fns, [QD.worldname])
						function fns(a, b) {
							if(b === undefined) {
								access = true
								var dat = $.make_date(Date.now());
								$.execSQL("run", "INSERT INTO ywot_world VALUES(null, ?, ?, ?, ?, 1, 1, '{}')", function(a, b) {
									processProfile(function(a,b,c,d){
										callback(a,b,c,d)
									}, "World \"" + QD.worldname + "\" successfully claimed.")
								}, [QD.worldname, data.id, dat, dat])
							} else {
								if(b.owner_id === null) {
									if(b.owner_id !== data.id) {
										wk = true;
										access = true;
										$.execSQL("run", "UPDATE ywot_world SET owner_id=? WHERE name=?", function(a, b){
											processProfile(function(a,b,c,d){
												callback(a,b,c,d)
											}, "World \"" + QD.worldname + "\" successfully claimed.")
										}, [data.id, QD.worldname])
									} else {
										message = "You already own that world."
									}
								} else {
									message = "That world already has an owner."
								}
							}
							if(!access){
								processProfile(function(a,b,c,d){
									callback(a,b,c,d)
								}, message)
							}
						}
					} else {
						processProfile(function(a,b,c,d){
							callback(a,b,c,d)
						}, "Invalid world name.")
					}
				} else {
					callback([403, "Access denied"])
				}
			}
		}
	}
}

module.exports.private = function(req, callback) {
	var tmp = $.swig.compileFile("./program/html/templates/private.html")
	manageDefaultCookie(req.headers.cookie, next)
	function next(a) {
		var data = a[1];
		var output = tmp({
			user_is_authenticated: data.authenticated,
			user: data.username,
			block_super: "Your World Of Text",
			url_home: "/home/",
			url_profile: "/accounts/profile/",
			url_logout: "/accounts/logout",
			url_auth_login: "/accounts/login/",
			url_registration_register: "/accounts/register/"
		});
		callback([200, output], null, a[0])
	}
}

module.exports.configure = function(req, callback) {
	if(req.method === "GET") {
		var world = csplit($.url.parse(req.url.substr(1)).pathname, "accounts/configure/", 1)[1]
		if(world.charAt(world.length - 1) === "/") {
			world = world.substring(0, world.length - 1);
		}
		var tmp = $.swig.compileFile("./program/html/templates/configure.html")
		manageDefaultCookie(req.headers.cookie, next)
		function next(a) {
			var data = a[1];
			if(data.authenticated) {
				var members = [];
				var worldData = null;
				$.execSQL("get", "SELECT * FROM ywot_world WHERE name=?", w_fs, [world])
				function w_fs(_a, wdat) {
					if(wdat) {
						worldData = wdat
						$.execSQL("all", "SELECT * FROM ywot_whitelist WHERE world_id=?", parseMember, [wdat.id])
						var rta = [];
					} else {
						callback([403, "Access denied"], null, a[0])
					}
					function parseMember(_a, b) {
						if(b) {
							for(i in b) {
								var DAT = b[i]
								rta.push(["SELECT username from auth_user where id=?", [DAT.user_id]])
							}
						}
						$.returnTables(rta, returnUsernames)
					
						if(rta.length === 0) returnUsernames(null)
						function returnUsernames(b) {
							if(b) {
								for(i in b) {
									var DAT = b[i]
									members.push({member_name:DAT.username})
								}
							}
							var access = false;
							if(wdat.owner_id === data.id) {
								access = true;
								var _txt = " selected";
								var public_perm = "none";
								if(worldData.public_writable) {
									public_perm = "write"
								}else if(worldData.public_readable) {
									public_perm = "read"
								}
								
								var op1 = ""
								var op2 = ""
								var op3 = ""
								if(public_perm === "none") op1 = _txt
								if(public_perm === "read") op2 = _txt
								if(public_perm === "write") op3 = _txt
								
								var output = tmp({
									user_is_authenticated: true,
									user: data.username,
									block_super: "Your World Of Text",
									url_home: "/home/",
									url_profile: "/accounts/profile/",
									url_logout: "/accounts/logout",
									url_auth_login: "/accounts/login/",
									url_registration_register: "/accounts/register/",
									
									
									public_perm: public_perm,
									world: world,
									csrf_token: "<div style='display:none'><input type='hidden' name='csrfmiddlewaretoken' value='" + data.csrftoken + "' /></div>",
									members: members,
									go_to_coord: true,
									coordLink: true,
									urlLink: true,
									add_member_message: "test2 is now a member of the \"test123\" world",
									op1: op1,
									op2: op2,
									op3: op3
								});
								callback([200, output], null, a[0])
							}
							if(!access) {
								callback([403, "Access denied"], null, a[0])
							}
						}
					}
				}
			} else {
				callback([200, ""], null, a[0], "/accounts/login/?next=" + $.url.parse(req.url).pathname)
			}
		}
	}
	if(req.method === "POST") {
		var queryData = "";
		var error;
		req.on('data', function(data) {
			queryData += data;
			if (queryData.length > 1000000) {
				queryData = "";
				callback([413, ""])
				error = true
				req.connection.destroy();
			}
		});
		req.on('end', conf_);
		function conf_(){
			if(error) return;
			manageDefaultCookie(req.headers.cookie, next)
			function next(a) {
				var world = csplit($.url.parse(req.url.substr(1)).pathname, "accounts/configure/", 1)[1]
				if(world.charAt(world.length - 1) === "/") {
					world = world.substring(0, world.length - 1);
				}
				
				$.execSQL("get", "SELECT * FROM ywot_world WHERE name=?", w_fs, [world])
				
				function w_fs(_a, b) {
					var data = a[1];
					QD = $.querystring.parse(queryData)
					if(data.authenticated) {
						if(data.id === b.owner_id && QD.csrfmiddlewaretoken === data.csrftoken) {
							if(QD.form === "public_perm") {
								var read = null;
								var write = null;
								if(QD.public_perm === "read") {
									read = 1;
									write = 0;
								}
								if(QD.public_perm === "write") {
									read = 1
									write = 1;
								}
								if(QD.public_perm === "none") {
									read = 0;
									write = 0;
								}
								$.execSQL("run", "UPDATE ywot_world SET (public_readable,public_writable)=(?, ?) WHERE id=?", function(a,b){
									callback([200, ""], null, null, $.url.parse(req.url).pathname)
								}, [read, write, b.id])
							}
						}
					}
				}
			}
		}
	}
}

module.exports.member_autocomplete = function(req, callback) {
	callback([200, "test1\ntest2\ntest3\ntest4"])
}