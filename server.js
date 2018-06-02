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
    
    let intent = '';
    let userId = '0';
    if(req.body) {
        if(req.body.queryResult && req.body.queryResult.intent && req.body.queryResult.intent.displayName)
            intent = req.body.queryResult.intent.displayName;
        if(req.body.originalDetectIntentRequest && req.body.originalDetectIntentRequest.payload &&
            req.body.originalDetectIntentRequest.payload.data && req.body.originalDetectIntentRequest.payload.data.sender)
            userId = req.body.originalDetectIntentRequest.payload.data.sender.id;
    }

    if(!userPrefs) {
        console.log('User not registered');
        let query = `INSERT INTO users_prefs (user_id) VALUES ('${userId}')`;
        pool.query(query);
    }

    var parameters = req.body.queryResult.parameters;

    if(intent === 'naked-location' || intent === 'location-sent') {
        console.log('Naked location');
        if(intent === 'location-sent') {
            parameters['lat'] = req.body.originalDetectIntentRequest.payload.data.postback.data.lat;
            parameters['long'] = req.body.originalDetectIntentRequest.payload.data.postback.data.long; 
            console.log(parameters['lat'] + " " + parameters['long']);
        } 
        if(userPrefs.context === constants.CONTEXT_LOC) {
            intent = 'location';
        } else {
            intent = 'weather';
        }
    }

    switch(intent) {
        case 'weather':
            getWeatherResponse(req.body.queryResult.parameters, userPrefs, (response) => sendResponse(response, res));
            break;
        case 'location':
            getLocationResponse(req.body.queryResult.parameters, userPrefs, (response) => sendResponse(response, res));
            break;;
        case 'outfit':
            getOutfitResponse(req.body.queryResult.parameters, userPrefs, (response) => sendResponse(response, res));
        break;
        case 'outfit-suggestion':
            getOutfitSuggestion(req.body.queryResult.parameters, userPrefs, (response) => sendResponse(response, res));
        break;

    }
    
}

function sendResponse(response, res) {
    res.json({
		"payload": {
			"facebook": {
                "text": response,
                "quick_replies":[
                    {
                      "content_type":"location"
                    }
                  ]
			}
		}
    });
}

function getWeatherResponse(parameters, userPrefs, callback) {
    setContext(constants.CONTEXT_WEATHER, userPrefs);

    if(parameters['lat'] && parameters['long']) {
        weatherByCoordinates(parameters['long'], parameters['lat'], (weather) => {
            callback(formatWeatherResponse(weather));
            return;
        });
        return;
    }
    let city = userPrefs.city;
    if(parameters && parameters['geo-city'])
        city = parameters['geo-city'];
    if(!city && !userPrefs.city && !userPrefs.latitude) {
        callback('Please tell the city you live in.');
        context = constants.CONTEXT_LOC;
        setContext(constants.CONTEXT_LOC, userPrefs);
        return;
    } 
    if(!city) {
        weatherByCoordinates(userPrefs.longitude, userPrefs.latitude, (weather) => {
            callback(formatWeatherResponse(weather));
        });        
    }
    else {
        weatherByCity(city, (weather) => {
            callback(formatWeatherResponse(weather));
        })
    }
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

function getLocationResponse(parameters, userPrefs, callback) {
    if(!parameters) {
        return constants.ERROR_MES;
    }
    if(parameters['long'] && parameters['lat']) {
        let query = `UPDATE users_prefs SET city=NULL, longitude=${parameters['long']}, latitude=${parameters['lat']} WHERE user_id='${userPrefs.user_id}';`;
        pool.query(query, (err, result) => {
            if (err) console.log(err);
            callback(`Your coordinates have been updated. I will memorize that.`);
        });
        return;
    }
    let city = parameters['geo-city'];
    let country = parameters['geo-country'];
    let user_id = userPrefs.user_id;
    console.log(city);
    console.log(country);

    if(!city) {
        callback('Tell me the city you live in, or pin it from the map.');
        setContext(constants.CONTEXT_LOC, userPrefs);
        return;
    }

    let query = `UPDATE users_prefs SET city='${city}', longitude=NULL, latitude=NULL WHERE user_id='${user_id}';`;
    pool.query(query, (err, result) => {
        if (err) console.log(err);
        callback(`You live in ${city}. I will memorize that.`);
    });
    setContext(constants.CONTEXT_WEATHER, userPrefs);
}

function weatherByCity(city, callback) {
    let url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${apiKey}`;
    let weather = null;
    request(url, (err, response, body) => {
        if(err) {
            weather = null;
        } else {
            weather = JSON.parse(body);
        }
        callback(weather);
    });
}

function weatherByCoordinates(longitude, latitude, callback) {
    console.log(longitude + " " + latitude);
    let url = `http://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${apiKey}`;
    let weather = null;
    request(url, (err, response, body) => {
        if(err) {
            weather = null;
        } else {
            weather = JSON.parse(body);
        }
        callback(weather);
    });
} 

function getWeather(params, callback) {
    if(params.longitude) {
        weatherByCoordinates(params.longitude, params.latitude, callback);
        return;
    }
    if(params.long) {
        weatherByCoordinates(params.long, params.lat, callback);
        return;
    }
    if(params.city) {
        weatherByCity(params.city, callback);
        return;
    }
}

function setContext(context, userPrefs) {
    if(context === userPrefs.context) return;
    let query = `UPDATE users_prefs SET context='${context}' WHERE user_id='${userPrefs.user_id}';`;
    pool.query(query, (err, result) => {
        if (err) console.log(err);
    });
    console.log("Changing context to " + context);
}

function getOutfitResponse(parameters, userPrefs, callback) {
    let city = userPrefs.city;
    let long = userPrefs.longitude;
    let lat = userPrefs.latitude;
    let outfit = parameters['clothes'];
    if(!city && !lat && !long) {
        callback('Please tell me what city you live in.');
        setContext(constants.CONTEXT_LOC, userPrefs);
        return;
    }

    getWeather(userPrefs, (weather) => {
        if(!weather || !weather.main || !weather.main.temp) {
            callback(constants.ERROR_MES);
            return;
        }
        var appropriate = false;
        let tmp = weather.main.temp;

        if(tmp > 30) {
            if(constants.HOT_WEATHER.indexOf(outfit) > -1) {
                appropriate = true;
            }
        } else if (tmp > 20) {
            if(constants.WARM_WEATHER.indexOf(outfit) > -1) {
                appropriate = true;
            }
        } else {
            if(constants.COLD_WEATHER.indexOf(outfit) > -1) {
                appropriate = true;
            }
        }

        weather.weather.forEach(element => {
            let weatherId = element['id'];
            if(weatherId > 200 && weatherId < 600) {
                if(constants.RAIN.indexOf(outfit) > -1) {
                    appropriate = true;
                }
            } else if (weatherId < 700) {
                if(constants.SNOW.indexOf(outfit) > -1) {
                    appropriate = true;
                }
            } else if (weatherId >= 800) {
                if(constants.SUN.indexOf(outfit) > -1) {
                    appropriate = true;
                }
            }
        });
        
        if(appropriate) {
            callback(constants.OUTFIT_YES[Math.floor(Math.random()*constants.OUTFIT_YES.length)]);
        } else {
            callback(constants.OUTFIT_NO[Math.floor(Math.random()*constants.OUTFIT_NO.length)]); 
        }  
    });
    setContext(constants.CONTEXT_WEATHER, userPrefs);
}

function getOutfitSuggestion(parameters, userPrefs, callback) {
    setContext(constants.CONTEXT_WEATHER, userPrefs);

    let city = userPrefs.city;
    let long = userPrefs.longitude;
    let lat = userPrefs.latitude;

    if(!city && !lat && !long) {
        callback('Please tell me what city you live in.');
        setContext(constants.CONTEXT_LOC, userPrefs);
        return;
    }

    getWeather(userPrefs, (weather) => {
        if(!weather || !weather.main || !weather.main.temp) {
            callback(constants.ERROR_MES);
            return;
        }

        var done = false;
        weather.weather.forEach(element => {
            let weatherId = element['id'];
            if(weatherId > 200 && weatherId < 600) {
                callback("You should bring an umbrella. It's raining!");
                done = true;
            } else if (weatherId < 700) {
                callback("You should wear heavy clothes. Bring a jacket with you, it's snowing!");
                done = true;;
            } 
        });
        if(done) return;
        let tmp = weather.main.temp;

        if(tmp > 30) {
            callback("It's hot out there! You should wear a shirt");
            return;
        } else if (tmp > 20) {
            callback('The weather is warm. Maybe put on a sleeve shirt')
            return;
        } else {
            callback('It\'s cold. Put on a jacket');
            return;
        }
    });
}
server.post('/webhook', webhookFunction);
