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

var constants = require('./constants.js');

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
	
    let intent = req.body.queryResult.intent.displayName;
    let userId = req.body.originalDetectIntentRequest.payload.data.sender.id;

    if(!userPrefs) {
        console.log('User not registered');
        let query = `INSERT INTO users_prefs (user_id) VALUES ('${userId}')`;
        pool.query(query);
    }

    var response;
    switch(intent) {
    	case 'weather':
            getWeatherResponse(req.body.queryResult.parameters, userPrefs, (response) => {
                res.json({ fulfillmentText: response});
            });
    	break;
    }

    /*
	res.json({
		"payload": {
			"facebook": {
				"text": "Hello, world"
			}
		}
    });
    */
}

function getWeatherResponse(parameters, userPrefs, callback) {
	let city = userPrefs.city;

	if(parameters && parameters['geo-city'])
		city = parameters['geo-city'];

	weather = weatherByCity(city, (weather) => {
		callback(formatWeatherResponse(weather));
	})
}

function formatWeatherResponse(weather) {
    if(!weather || !weather.main)
      return constants.ERROR_MES;

    if(!weather.name || !weather.main || !weather.main.temp)
      return constants.ERROR_MES;
 
    var response = `The temparature now in ${weather.name} is ${weather.main.temp} celcius.`;  
    let w = weather.weather[0];

    let weatherId = w['id'];
    let weatherDisc = w["description"];

    if(weatherId >= 200 && weatherId < 700) {       
        response += ` And there might be a ${weatherDisc}.`;
    }
    if(weatherId >= 700 && weatherId <= 711 || 
        weatherId >= 741 && weatherId <= 761 ) {         
        response += ` And the atmosphere is ${weatherDisc}y.`;
    }
    if(weatherId == 721) {          
        response += ` And the atmosphere is hazy.`;
    }
    if(weatherId == 731) {          
        response += ` And the atmosphere is sandy with dust whirls.`;
    }
    if(weatherId == 800) {          
        response += ` And the sky is clear today.`;
    }
    if(weatherId > 800) {
        response += ` And the sky has ${weatherDisc}.`; 
    }
    return response;
}

server.post('/webhook', webhookFunction);

