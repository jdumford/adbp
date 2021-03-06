var express = require('express');
var request = require('request');
var querystring = require('querystring');

var router = express.Router();

var async = require('async');
var oracledb = require('oracledb');
var dbConfig = require('../dbconfig.js');

var client_id = '55ca26e27b504f9599192446f26b25cb';
var client_secret = '44dce2df9d474eeea72e3e52b94badff';
var redirect_uri = 'https://34.224.122.69:8888/callback/';

var stateKey = 'spotify_auth_state';
var webtoken = 'webplayer-token';
var userIDcookie = 'uid-cookie';
var dbhelper = require('../dbhelpers.js');

var show_stream_counter = 0;

//get request for a view named index
router.get('/', function(req, res){
    if (!req.cookies[webtoken]){
        res.redirect('/login');
    }
    else{
        res.render('index');
        console.log('home');
    }
});

/*
router.get('/profile', function(req, res){
    if (!req.cookies[webtoken]){
        res.redirect('/login');
    }
    else{
	res.render('profile');
        console.log('profile');
    }

});

router.get('/stream', function(req, res){
    if (!req.cookies[webtoken]){
        res.redirect('/login');
    }
    else{
	res.render('stream');
	console.log('stream');
    }

});
*/
router.get('/login', function(req, res){
	res.render('login', { title: 'Login', layout: 'loglayout' });
	console.log('login');
})

router.get('/logout', function(req, res){
        res.clearCookie(webtoken);
        res.redirect('/login');
});

router.get('/login/spotify', function(req, res) {
  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email user-read-currently-playing ' +
  'user-read-playback-state user-modify-playback-state streaming user-read-birthdate';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

router.get('/callback', function(req, res) {
    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;
    
    if (state === null || (storedState && state !== storedState)) {
	console.log(error);
	res.redirect('/login' +
		     querystring.stringify({
			 error: 'state_mismatch'
		     }));
    }
    else {
	res.clearCookie(stateKey);
	res.clearCookie('streamID');
	var authOptions = {
	    url: 'https://accounts.spotify.com/api/token',
	    form: {
		code: code,
		redirect_uri: redirect_uri,
		grant_type: 'authorization_code'
	    },
      headers: {
          'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
	    json: true
	};
	
	function setUserCookie(id){
	    res.cookie(userIDcookie, id)
	}

	request.post(authOptions, function(error, response, body) {
	    if (!error && response.statusCode === 200) {
		res.cookie(webtoken, body.access_token);
		var options = {
		    url: 'https://api.spotify.com/v1/me',
		    headers: { 'Authorization': 'Bearer ' + body.access_token},
		    json: true
		};
		var userID = {id : ""}
		request.get(options, function(error, response, user_info) {
		    dbhelper.ExecuteQuery(dbhelper.addUser, [user_info["id"]], res)
		    var tokens = req.app.get('tokens');
		    tokens[user_info['id']] = {
                'access': body.access_token,
			'refresh': body.refresh_token,
			'name': user_info["display_name"]
		    }
		    req.app.set('tokens', tokens)
		    setUserCookie(user_info["id"])
            res.redirect('/');
		});
		
	    }
	    // invalid token
	    
	    else {
		res.redirect('/#' +
			     querystring.stringify({
				 error: 'invalid_token'
			     }));
	    }
	});
    }
});

function getStream(res, t, tokens, streams){
    var token_count = Object.keys(tokens).length
    var options = {
	url: 'https://api.spotify.com/v1/me/player/currently-playing',
	type: "GET",
	headers: {
	    'Accept': 'application/json',
	    'Content-Type':'application/json'
	},
	json:true
    }
    
    options.headers.Authorization = 'Bearer ' + tokens[t].access;
    request.get(options, function(error, response, body) {
	if (body == null) {
	}else{
	    var stream = {
		streamerID: t,
		streamerName: tokens[t].name,
		songID: body.item.id,
		name: body.item.name,
		artist: body.item.artists[0].name,
		album: body.item.album.name,
		album_cover: body.item.album.images[0].url
		}
	    streams.push(stream)
	}
	show_stream_counter += 1
	if(show_stream_counter == token_count){
	    res.jsonp(streams);
	    }
    });
}


//uses access tokens of streaming friends to get info about what they're playing
router.get("/friends-streaming", function (req, res) {
    var tokens = req.app.get('tokens');
    show_stream_counter = 0;
    var streams = []
    var token_count = Object.keys(tokens).length
    var options = {
	url: 'https://api.spotify.com/v1/me/player/currently-playing',
	type: "GET",
	headers: {
	    'Accept': 'application/json',
	    'Content-Type':'application/json'
	},
	json:true
    }

    for(var t in tokens){
	getStream(res, t, tokens, streams);
    }

});

router.get("/live-streams", function(req, res) {
    dbhelper.getProcResults(dbhelper.getLiveStreams, [], res)
});

var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

/*
var getQueue = function (conn, cb) {
  conn.execute(
    "begin "
    + "getPack.getQueue(:sid);"
    + "end;",
    {sid : 1},
    function(err) { return cb(err, conn) });
  }*/


router.get("/getqueue", function (req, res) {
    dbhelper.getProcResults(dbhelper.getQueue, [req.query.streamID], res)
});


router.get("/addToQueue", function (req, res) {
    var query = dbhelper.addtoQueue
    var params = [req.query.streamID, req.query.id]
    dbhelper.ExecuteQuery(query, params);
    res.jsonp({status:'done'})
  });



  router.get("/playedSong", function (req, res) {
    var query = dbhelper.playedSong
    var params = [parseInt(req.query.stid), req.query.sid]
    dbhelper.ExecuteQuery(query, params);
    res.jsonp({status:'done'})
  });

  router.get("/upvoteSong", function (req, res) {
    var query = dbhelper.upVoteSong
    var params = [parseInt(req.query.streamID),
        req.query.userID, req.query.queuesongID]
    dbhelper.ExecuteQuery(query, params);
    res.jsonp({status:'done'})
  });


  router.get("/downvoteSong", function (req, res) {
    var query = dbhelper.downVoteSong
    var params = [parseInt(req.query.streamID),
        req.query.userID, req.query.queuesongID]
    dbhelper.ExecuteQuery(query, params);
    res.jsonp({status:'done'})
  });

  router.get("/getFollowersCount", function (req, res) {
    var query = dbhelper.getFollowersCount
    var params = [parseInt(req.query.streamID),
        req.query.userID, req.query.queuesongID]
    dbhelper.ExecuteQuery(query, params)
    res.jsonp({status:'done'})
  });


  router.get("/getFolloweesCount", function (req, res) {
    var query = dbhelper.getFolloweesCount
    var params = [parseInt(req.query.streamID),
        req.query.userID, req.query.queuesongID]
    dbhelper.ExecuteQuery(query, params)
    res.jsonp({status:'done'})
  });


router.get("/startStream", function (req, res) {
    var query = dbhelper.startStream;
    var params = [req.query.hostid, req.query.description, req.query.acc];
    dbhelper.getProcResults(query, params, res)
});


  router.get("/joinStream", function (req, res) {
    var query = dbhelper.joinStream
    var params = [parseInt(req.query.streamID), req.query.userID]
    console.log(params)
    dbhelper.ExecuteQuery(query, params)
    res.jsonp({status:'done'})
  });


  router.get("/leaveStream", function (req, res) {
    var query = dbhelper.leaveStream
    var params = [parseInt(req.query.streamID),
        req.query.userID, req.query.queuesongID]
    dbhelper.ExecuteQuery(query, params)
    res.jsonp({status:'done'})
  });


  router.get("/getUserPrivacy", function (req, res) {
    var query = dbhelper.getUserPrivacy
    var params = [parseInt(req.query.streamID),
        req.query.userID, req.query.queuesongID]
    dbhelper.ExecuteQuery(query, params)
    res.jsonp({status:'done'})
  });


module.exports = router;

