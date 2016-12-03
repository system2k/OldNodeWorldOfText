var http = require("http");
var url = require("url");
var sql = require("sqlite3").verbose(); // sqlite3
var fs = require("fs"); // file system
var prompt = require("./program/lib/edited_modules/prompt.js"); // prompter (ask questions/get answers)
var conf = require("./program/lib/parseConfig.js"); // lex _settings file
var server = require("./program/nwot/server.js"); // main server script
var mime = require("./program/lib/mime.js"); // figure out the mime type
var swig = require("swig"); // html templating engine (like Djangos)
var querystring = require("querystring"); // parse querystrings
var listdir = require("./program/lib/listdir.js");
var crypto = require('crypto'); // hash algorithm
var domain = require('domain');

var DATABASE_NAME = "ywot.sqlite";

var _static = {};
var _staticPath = "./program/html/static/";
var _staticURL = "static/";

var _template = {};
var _templatePath = "./program/html/templates/";

var SETTINGS = conf.lexConfig("./_settings.txt");
listdir(_static, _staticPath, _staticURL);
listdir(_template, _templatePath, "");

prompt.message = ""; // do not display "prompt" before each question
prompt.delimiter = ""; // do not display ":" after "prompt"
prompt.colors = false; // disable dark gray color in a black console

var prompt_account_properties = {
	properties: {
		username: {
			message: 'Username: ',
			validator: /^[a-zA-Z\s\-]+$/,
			warning: 'Username must be only letters, spaces, or dashes'
		},
		password: {
			description: 'Password: ',
			replace: '*',
			hidden: true
		},
		confirmpw: {
			description: 'Password (again): ',
			replace: '*',
			hidden: true
		}
	}
};

var prompt_account_yesno = {
	properties: {
		yes_no_account: {
			message: "You just installed the server, which means you don\'t have any superusers defined.\nWould you like to create one now? (yes/no):",
			validator: /^[a-zA-Z\s\-]+$/,
			warning: 'Username must be only letters, spaces, or dashes'
		}
	}
};

var create_tables_grps = {}; // stores numbers which represent the amount of tables added. the key name is the group name.

var default_tables = ["CREATE TABLE \"auth_group\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"name\" varchar(80) NOT NULL UNIQUE\r\n)\r\n","\r\nCREATE TABLE \"auth_group_permissions\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"group_id\" integer NOT NULL,\r\n    \"permission_id\" integer NOT NULL REFERENCES \"auth_permission\" (\"id\"),\r\n    UNIQUE (\"group_id\", \"permission_id\")\r\n)\r\n","\r\nCREATE TABLE \"auth_message\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"user_id\" integer NOT NULL REFERENCES \"auth_user\" (\"id\"),\r\n    \"message\" text NOT NULL\r\n)\r\n","\r\nCREATE TABLE \"auth_permission\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"name\" varchar(50) NOT NULL,\r\n    \"content_type_id\" integer NOT NULL,\r\n    \"codename\" varchar(100) NOT NULL,\r\n    UNIQUE (\"content_type_id\", \"codename\")\r\n)\r\n","\r\nCREATE TABLE \"auth_user\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"username\" varchar(30) NOT NULL UNIQUE,\r\n    \"first_name\" varchar(30) NOT NULL,\r\n    \"last_name\" varchar(30) NOT NULL,\r\n    \"email\" varchar(75) NOT NULL,\r\n    \"password\" varchar(128) NOT NULL,\r\n    \"is_staff\" bool NOT NULL,\r\n    \"is_active\" bool NOT NULL,\r\n    \"is_superuser\" bool NOT NULL,\r\n    \"last_login\" datetime NOT NULL,\r\n    \"date_joined\" datetime NOT NULL\r\n)\r\n","\r\nCREATE TABLE \"auth_user_groups\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"user_id\" integer NOT NULL,\r\n    \"group_id\" integer NOT NULL REFERENCES \"auth_group\" (\"id\"),\r\n    UNIQUE (\"user_id\", \"group_id\")\r\n)\r\n","\r\nCREATE TABLE \"auth_user_user_permissions\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"user_id\" integer NOT NULL,\r\n    \"permission_id\" integer NOT NULL REFERENCES \"auth_permission\" (\"id\"),\r\n    UNIQUE (\"user_id\", \"permission_id\")\r\n)\r\n","\r\nCREATE TABLE \"django_content_type\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"name\" varchar(100) NOT NULL,\r\n    \"app_label\" varchar(100) NOT NULL,\r\n    \"model\" varchar(100) NOT NULL,\r\n    UNIQUE (\"app_label\", \"model\")\r\n)\r\n","\r\nCREATE TABLE \"django_session\" (\r\n    \"session_key\" varchar(40) NOT NULL PRIMARY KEY,\r\n    \"session_data\" text NOT NULL,\r\n    \"expire_date\" datetime NOT NULL\r\n)\r\n","\r\nCREATE TABLE \"django_site\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"domain\" varchar(100) NOT NULL,\r\n    \"name\" varchar(50) NOT NULL\r\n)\r\n","\r\nCREATE TABLE \"registration_registrationprofile\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"user_id\" integer NOT NULL UNIQUE REFERENCES \"auth_user\" (\"id\"),\r\n    \"activation_key\" varchar(40) NOT NULL\r\n)\r\n","\r\nCREATE TABLE \"ywot_edit\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"user_id\" integer REFERENCES \"auth_user\" (\"id\"),\r\n    \"ip\" char(15),\r\n    \"world_id\" integer NOT NULL REFERENCES \"ywot_world\" (\"id\"),\r\n    \"time\" datetime NOT NULL,\r\n    \"content\" text NOT NULL\r\n)\r\n","\r\nCREATE TABLE \"ywot_tile\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"world_id\" integer NOT NULL REFERENCES \"ywot_world\" (\"id\"),\r\n    \"content\" varchar(128) NOT NULL,\r\n    \"tileY\" integer NOT NULL,\r\n    \"tileX\" integer NOT NULL,\r\n    \"properties\" text NOT NULL,\r\n    \"created_at\" datetime NOT NULL,\r\n    UNIQUE (\"world_id\", \"tileY\", \"tileX\")\r\n)\r\n","\r\nCREATE TABLE \"ywot_whitelist\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"user_id\" integer NOT NULL REFERENCES \"auth_user\" (\"id\"),\r\n    \"world_id\" integer NOT NULL REFERENCES \"ywot_world\" (\"id\"),\r\n    \"created_at\" datetime NOT NULL,\r\n    \"updated_at\" datetime NOT NULL,\r\n    UNIQUE (\"user_id\", \"world_id\")\r\n)\r\n","\r\nCREATE TABLE \"ywot_world\" (\r\n    \"id\" integer NOT NULL PRIMARY KEY,\r\n    \"name\" text NOT NULL UNIQUE,\r\n    \"owner_id\" integer REFERENCES \"auth_user\" (\"id\"),\r\n    \"created_at\" datetime NOT NULL,\r\n    \"updated_at\" datetime NOT NULL,\r\n    \"public_readable\" bool NOT NULL,\r\n    \"public_writable\" bool NOT NULL,\r\n    \"properties\" text NOT NULL\r\n)"]; // the default table names and arguments

var mimetypes = mime.load();

var dtB = new sql.Database("./program/" + DATABASE_NAME); // opens the database. if no database is found, it's created

var queue = []; // queue for database commands
var to_check = false;

function checkQueue() {
	if(queue.length === 0){
		to_check = false;
		return;
	}
	var mtd = queue[0][0];
	var sql = queue[0][1];
	var clbk = queue[0][2];
	var args = queue[0][3];
	if(mtd === "run" || mtd === "each" || mtd === "get" || mtd === "all") {
		if(!args) {
			if(mtd !== "each") {
				dtB[mtd](sql, function(a, b){
					queue.shift();
					checkQueue();
					try{
						if(clbk) clbk(a, b);
					}catch(e){}
				});
			} else {
				dtB[mtd](sql, function(){}, function(a, b){
					queue.shift();
					checkQueue();
					try{
						if(clbk) clbk(a, b);
					}catch(e){}
				});
			}
		} else {
			if(mtd !== "each") {
				dtB[mtd](sql, args, function(a, b){
					queue.shift();
					checkQueue();
					try{
						if(clbk) clbk(a, b);
					}catch(e){}
				});
			} else {
				dtB[mtd](sql, args, function(){}, function(a, b){
					queue.shift();
					checkQueue();
					try{
						if(clbk) clbk(a, b);
					}catch(e){}
				});
			}
		}
	} else {
		queue.shift();
		checkQueue();
	}
};

function runServer() {
	var data = { // take the important variables to be accessed by the server module.
		SETTINGS: SETTINGS,
		http: http,
		_static: _static,
		_template: _template,
		url: url,
		mimetypes: mimetypes,
		swig: swig,
		querystring: querystring,
		returnTables: returnTables,
		createTables: createTables,
		execSQL: execSQL,
		escape_sql: escape_sql,
		make_date: make_date,
		encryptHash: encryptHash,
		checkHash: checkHash,
		domain: domain
	};
	server.begin(data); // begin the server with the data.
};

function encryptHash(user, pass) {
	var name = "@" + user + pass;
	var hash = "$" + crypto.createHash('sha512WithRSAEncryption').update(name).digest('hex');
	return hash;
};

function checkHash(hash, user, pass) {
	return encryptHash(user, pass) === hash;
};

checkQueue();

function execSQL(mtd, sql, clbk, args) { // execute the sql (pushes into the queue instead)
	var ar = [mtd, sql, clbk]
	if(args) ar.push(args)
	queue.push(ar)
	if(to_check === false) {
		checkQueue();
		to_check = true;
	}
};

dtB.serialize(function(){
	extr();
})

var letters_low = "abcdefghijklmnopqrstuvwxyz";
var letters_high = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function toUpper(str) {
	var len = str.length;
	str = str.split("");
	for(var i = 0; i < len; i++) {
		for(var f = 0; f < 26; f++) {
			if(letters_low.charAt(f) === str[i]) {
				str[i] = letters_high.charAt(f);
			}
		}
	}
	return str.join("");
}
var id_0 = 0;
function createTables(list, callback) {
	var grp = id_0;
	id_0++;
	if(create_tables_grps[grp] === undefined) {
		create_tables_grps[grp] = 0
	}
	for(i in list) {
		var sql = list[i];
		var args = null;
		if(typeof sql === "object") {
			args = sql[1]
			sql = sql[0];
		}
		if(!args) {
			execSQL("run", sql, function(){
				create_tables_grps[grp]++;
				if(create_tables_grps[grp] >= list.length) {
					delete create_tables_grps[grp]
					callback();
				}
			})
		} else {
			execSQL("run", sql, function(){
				create_tables_grps[grp]++;
				if(create_tables_grps[grp] >= list.length) {
					delete create_tables_grps[grp]
					callback();
				}
			}, args)
		}
	}
}

var return_tables_grps = {}

function returnTables(list, callback) {
	var grp = id_0;
	id_0++;
	var data = [];
	if(return_tables_grps[grp] === undefined) {
		return_tables_grps[grp] = 0
	}
	for(i in list) {
		var sql = list[i];
		var args = null;
		if(typeof sql === "object") {
			args = sql[1]
			sql = sql[0];
		}
		if(!args) {
			execSQL("get", sql, function(a, b){
				return_tables_grps[grp]++;
				data.push(b)
				if(return_tables_grps[grp] >= list.length) {
					delete return_tables_grps[grp]
					callback(data);
				}
			})
		} else {
			execSQL("get", sql, function(a, b){
				return_tables_grps[grp]++;
				data.push(b)
				if(return_tables_grps[grp] >= list.length) {
					delete return_tables_grps[grp]
					callback(data);
				}
			}, args)
		}
	}
}

function escape_sql(str) {
	str = str.replace(/'/g, "''")
	str = str.replace(/\"/g, "\"\"")
	return str
}
function pad_string(string, count, character) {
	var CS = character.repeat(count);
	var SJ = CS + string;
	return SJ.slice(-count);
}

function make_date(tst) {
    var date = new Date(tst);
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var year = date.getFullYear();
    var hour = date.getHours();
    var minute = date.getMinutes();
    var second = date.getSeconds();
	var milli = date.getMilliseconds();
	var compile = year + "-" + pad_string(month, 2, "0") + "-" + pad_string(day, 2, "0") + " " + pad_string(hour, 2, "0") + ":" + pad_string(minute, 2, "0") + ":" + pad_string(second, 2, "0") + "." + pad_string(milli, 3, "0") + "000"
    return compile;
};

//true/false:
//var var_ = result ? 1 : 0;



function extr() {
	passFunc = function(err, result) {
		if(result['password'] !== result['confirmpw']) {
			console.log("Error: Your passwords didn't match.")
			prompt.get(prompt_account_properties, passFunc);
		}else{
			var Date_ = make_date(Date.now())
			var passHash = encryptHash(result["username"], result['password'])
			execSQL("run", "INSERT INTO auth_user VALUES(null, ?, '', '', '', ?, 1, 1, 1, ?, ?)", function(a, b){
				console.log("Superuser created successfully.\n");
				runServer();
			}, [result["username"], passHash, Date_, Date_]) // using "null" for row index will automatically assign it one.
		}
	}
	yesNoAccount = function(err, result) {
		var re = result['yes_no_account'];
		if(toUpper(re) === "YES") {
			prompt.get(prompt_account_properties, passFunc);
		}
		if(toUpper(re) === "NO") {
			runServer()
		}
		if(toUpper(re) !== "YES" && toUpper(re) !== "NO") {
			console.log("Please enter either \"yes\" or \"no\" (not case sensitive):");
			prompt.get(prompt_account_yesno, yesNoAccount);
		}
	}
	fs.readFile("./program/checkstate.json", "utf8", function(a, data) {
		if(a !== null) {
			console.log("Setting up default tables...")
			createTables(default_tables, function(){
				console.log("Tables successfully set up.")
				var writeData = {
					"created": Date.now()
				}
				fs.writeFile("./program/checkstate.json", JSON.stringify(writeData), function(b) {
					prompt.start();
					prompt.get(prompt_account_yesno, yesNoAccount);
				})
			}, "def_tab")
		} else {
			runServer()
		}
	})
}