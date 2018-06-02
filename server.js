// for server
const express = require('express');
// parse json
const bodyParser = require('body-parser');
const http = require('http');
// send http requests
const request = require('request');
// openweather api key
const apiKey = '5b30125498a6176dd33bada39617b7d8';

const port = process.env.PORT || 3000;

// create server
const server = express();
server.use(bodyParser.urlencoded( {
    extended: true
}));
// tells the system that you want json to be used
server.use(bodyParser.json());

server.get('/', function(req, res) {
    res.send('Hello, world');
});

// to connect to postgresql
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true
});

// connect database
pool.connect(function (err, client, done) {
    if (err) console.log(err)
    
    server.listen(port, () => {
        console.log("Server is up and running...");
    });
})

webhookFunction = function(req, res) {
	// get user prefrences
    let userId = req.body.originalDetectIntentRequest.payload.data.sender.id;
    let query = `SELECT * FROM users_prefs WHERE user_id='${userId}';`;
   	pool.query(query, (err, result) => {
        if (err) console.log(err);
        makeDecision(req, result.rows[0], res);
    });
}

function makeDecision(req, userPrefs, res) {
	res.json({
		"payload": {
			"facebook": {
				"text": "Hello, world"
			}
		}
	});
}

server.post('/webhook', webhookFunction);

