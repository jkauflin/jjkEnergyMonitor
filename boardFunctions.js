/*==============================================================================
(C) Copyright 2018 John J Kauflin, All rights reserved. 
-----------------------------------------------------------------------------
DESCRIPTION: NodeJS module to handle board functions.  Communicates with
             the Arduino Mega board
-----------------------------------------------------------------------------
Modification History
2018-01-06 JJK  Initial version
2018-01-14 JJK  Got moisture sensor working and sending data to emoncms
2018-03-06 JJK  Got relays working to control electric systems
2018-03-10 JJK  Testing production relays
2018-03-11 JJK  Adding emoncms logging of relay activity, and using 
                setTimeout to turn air ventiliation ON and OFF
2018-03-13 JJK  Added logic to run lights for 18 hours
2018-03-25 JJK  Added logging of moisture sensor data
2018-03-26 JJK  Working on control of water relay
2018-03-29 JJK  Added 10 value arrays for smoothing
2018-03-31 JJK  Swapped the arduino and relays boards, and re-ordered the
                initialization sequence to solve the board timeout errors
2018-04-01 JJK  Working on initialization stability
                Doubled the board initialization timeout from 10 to 20 secs
                Added set relays OFF on exit
                Delay set of initial relays and air toggle
2018-04-02 JJK  Added node-webcam to take selfies of environment
                Added water for X seconds when lights are turned on
2018-04-05 JJK  Working on clean board initializations
                Removed moisture sensor (wasn't really giving good info)
2018-04-06 JJK  Re-working metrics logging to give consistent values to
                web ecomcms.
2018-04-07 JJK  Added adjustment to airDuration based on tempature (if it
                drops below 70 increase duration)
2018-04-14 JJK  Added toggleHeat and separate from air ventilation
2018-04-15 JJK  Modified to turn heat on when air goes off
2018-04-22 JJK  Working well with the Pi - check selfie and water timing
2018-05-14 JJK  Added store to save application configuration values
2018-05-18 JJK  Modified to accept configuration updates from web client
2018-06-18 JJK  Added lightDuration to store rec
2018-08-19 JJK  Turned off camera, added important dates and description
2018-09-30 JJK  Turned metrics back on to track tempature
2019-09-27 JJK  Testing new digital relay
2019-10-01 JJK  Checking JSON store functions, and 4 channel solid state relay
2019-10-02 JJK  Added a log message array and store rec save method.
                Getting the 4 channel relay working.  Checking metric sends
2019-10-11 JJK  Testing service shutdown
2019-10-13 JJK  Getting it Production ready and implementing an audit array
2019-10-20 JJK  Added new fields for germination and bloom dates
2019-11-03 JJK  Making sure watering is working
2019-11-06 JJK  Modifying the air/heat toggle to give the tempature
                adjustment more range to operate
=============================================================================*/
var dateTime = require('node-datetime');
const get = require('simple-get')
const EventEmitter = require('events');

// Library to control the Arduino board
var five = require("johnny-five");

// Set up the configuration store and initial values
//var store = require('json-fs-store')(process.env.STORE_DIR);
var store = require('json-fs-store')("./");
var storeId = 'storeid';
var logArray = [];
var initStoreRec = {
    id: storeId,                // unique identifier
    desc: 'Blanket Flower',           // description
    daysToGerm: '7 to 15',
    daysToBloom: '90 to 180',
    germinationStart: '2019-10-13',       // date seeds were planted
    germinationDate: '',        // date the seeds germinated or sprouted
    estBloomDate: '2020-01-13',              // 
    bloomDate: '',              // 
    harvestDate: '',            // harvest start date
    cureDate: '',               // curing start date
    productionDate: '',         // production complete date
    targetTemperature: 77,      // degrees fahrenheit
    airInterval: 2,             // minutes
    airDuration: 2,             // minutes
    heatInterval: 1,            // minutes  NOT USED
    heatDuration: 1,            // minutes
    heatDurationMin: 0.5,       // minutes
    heatDurationMax: 1.5,       // minutes
    lightDuration: 18,          // hours
    waterDuration: 20           // seconds
};

//logList: logArray

// Structure to hold current configuration values
var sr = initStoreRec;

// Get values from the application storage record
store.load(storeId, function(err, inStoreRec){
    if (err) {
        // Create one if it does not exist (with initial values)
        store.add(initStoreRec, function (err) {
            if (err) {
                throw err;
            }
        });
    } else {
        // Get current values from the store record
        sr = inStoreRec;
    }
});

// Requires webcam utility - sudo apt-get install fswebcam
/*
var nodeWebcam = require( "node-webcam" );
//Default options 
var nodewebcamOptions = {
  //Picture related 
  width: 1280,
  height: 720,
  quality: 100,
  //Delay to take shot 
  delay: 0,
  //Save shots in memory 
  //saveShots: true,
  saveShots: false,
  // [jpeg, png] support varies 
  // Webcam.OutputTypes 
  output: "jpeg",
  //Which camera to use 
  //Use Webcam.list() for results 
  //false for default device 
  device: false,
  // [location, buffer, base64] 
  // Webcam.CallbackReturnTypes 
  callbackReturn: "location",
  //Logging 
  verbose: false
};
*/

// Global variables
const EMONCMS_INPUT_URL = process.env.EMONCMS_INPUT_URL;
var emoncmsUrl = "";
var metricJSON = "";

//var intervalSeconds = 30;
//var intervalSeconds = 10;
var intervalSeconds = 30;
var metricInterval = intervalSeconds * 1000;
var thermometer = null;
var currTemperature = sr.targetTemperature;
const TEMPATURE_MAX = sr.targetTemperature + 1.0;
const TEMPATURE_MIN = sr.targetTemperature - 1.0;
const minutesToMilliseconds = 60 * 1000;
const secondsToMilliseconds = 1000;

var relays = null;
const LIGHTS = 0;
const WATER = 1;
const AIR = 2;
const HEAT = 3;
const relayNames = ["lights", "water", "air",  "heat"];
const relayMetricON = 72;
const relayMetricOFF = relayMetricON-1;
const relayMetricValues = [relayMetricOFF,relayMetricOFF,relayMetricOFF,relayMetricOFF];

const OFF = 0;
const ON = 1;
var currAirVal = OFF;
var currHeatVal = OFF;
var currLightsVal = OFF;
var date;
var hours = 0;
var airTimeout = 1.0;

// Variables to hold sensor values
var numReadings = 10;   // Total number of readings to average
var readingsA0 = [];    // Array of readings
var indexA0 = 0;        // the index of the current reading
var totalA0 = 0;        // the running total
// initialize all the readings to 0:
for (var i = 0; i < numReadings; i++) {
    readingsA0[i] = 0;     
}
var arrayFull = false;

// Create Johnny-Five board object
// When running Johnny-Five programs as a sub-process (eg. init.d, or npm scripts), 
// be sure to shut the REPL off!
var board = new five.Board({
    repl: false,
    debug: false
//    timeout: 12000
});

// State variables
var boardReady = false;

board.on("error", function () {
    log("*** Error in Board ***");
    boardReady = false;
}); // board.on("error", function() {

log("===== Starting board initialization =====");
//-------------------------------------------------------------------------------------------------------
// When the board is ready, create and intialize global component objects (to be used by functions)
//-------------------------------------------------------------------------------------------------------
// When the board is ready, create and intialize global component objects (to be used by functions)
board.on("ready", function () {
    log("*** board ready ***");
    boardReady = true;

    log("Initializing relays");
    relays = new five.Relays([10, 11, 12, 13]);

    // Start the function to toggle air ventilation ON and OFF
    log("Starting Air toggle interval");
    setTimeout(toggleAir, 1000);

    // If the board is exiting, turn all the relays off
    this.on("exit", function () {
        log("on EXIT");
        turnRelaysOFF();
    });
    // Handle a termination signal
    process.on('SIGTERM', function () {
        log('on SIGTERM');
        turnRelaysOFF();
    });
    //[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
    //    process.on(eventType, cleanUpServer.bind(null, eventType));
    //})

    // Define the thermometer sensor
    this.wait(2000, function () {
        // This requires OneWire support using the ConfigurableFirmata
        log("Initialize tempature sensor");
        thermometer = new five.Thermometer({
            controller: "DS18B20",
            pin: 2
        });

        thermometer.on("change", function () {
            // subtract the last reading:
            totalA0 = totalA0 - readingsA0[indexA0];
            readingsA0[indexA0] = this.fahrenheit;
            // add the reading to the total:
            totalA0 = totalA0 + readingsA0[indexA0];
            // advance to the next position in the array: 
            indexA0 = indexA0 + 1;
            // if we're at the end of the array...
            if (indexA0 >= numReadings) {
                // ...wrap around to the beginning:
                indexA0 = 0;
                arrayFull = true;
            }
            // calculate the average:
            if (arrayFull) {
                currTemperature = (totalA0 / numReadings).toFixed(2);
            }

            // Check to adjust the duration of ventilation and heating according to tempature
            if (currTemperature < TEMPATURE_MIN) {
                sr.heatDuration = sr.heatDurationMax;
            }
            if (currTemperature > TEMPATURE_MAX) {
                sr.heatDuration = sr.heatDurationMin;
            }

        }); // on termometer change
    });

    // Start sending metrics 4 seconds after starting (so things are calm)
    setTimeout(logMetric, 4000);

    log("End of board.on (initialize) event");

}); // board.on("ready", function() {

function turnRelaysOFF() {
    log("Setting relays OFF");
    setRelay(LIGHTS, OFF);
    setRelay(AIR, OFF);
    setRelay(HEAT, OFF);
    setRelay(WATER, OFF);
}

function setRelay(relayNum, relayVal) {
    if (relayVal) {
        // If value is 1 or true, set the relay to turn ON and let the electricity flow
        //relays[relayNum].open();
        relays[relayNum].on();
        //console.log(relayNames[relayNum]+" ON");
        //relayMetricValues[relayNum] = relayMetricON + (relayNum * 2);
        relayMetricValues[relayNum] = relayMetricON + relayNum;
    } else {
        // If value is 0 or false, set the relay to turn OFF and stop the flow of electricity
        //relays[relayNum].close();
        relays[relayNum].off();
        //console.log(relayNames[relayNum]+" OFF");
        relayMetricValues[relayNum] = relayMetricOFF;
    }
}

// Function to toggle air ventilation ON and OFF
function toggleAir() {
  airTimeout = sr.airInterval;

  if (currAirVal == OFF) {
    //log("Turning Air ON");
    setRelay(AIR,ON);
    currAirVal = ON;
    airTimeout = sr.airDuration;
  } else {
    //log("Turning Air OFF");
    setRelay(AIR,OFF);
    currAirVal = OFF;
    airTimeout = sr.airInterval;
    // When the air goes off, turn the heat on
    if (currHeatVal == OFF) {
      setTimeout(turnHeatOn,0);
    }
  }

  date = new Date();
  hours = date.getHours();
  //log("lightDuration = "+sr.lightDuration+", hours = "+hours);
  if (hours > (sr.lightDuration - 1)) {
    if (currLightsVal == ON) {
      setRelay(LIGHTS,OFF);
      currLightsVal = OFF;
    }
  } else {
    if (currLightsVal == OFF) {
      setRelay(LIGHTS,ON);
      currLightsVal = ON;
      // Take a selfie when you turn the lights on
      //setTimeout(letMeTakeASelfie, 100);

      // Water the plants for a few seconds when the light come on
      setTimeout(waterThePlants, 500);
    }
  }

  // Recursively call the function with the current timeout value  
  setTimeout(toggleAir,airTimeout * minutesToMilliseconds);

} // function toggleAir() {

// Function to turn air ventilation in/heat ON
function turnHeatOn() {
  //log("Turning Heat ON");
  setRelay(HEAT,ON);
  currHeatVal = ON;
  // Queue up function to turn the heat back off after the duration time
  setTimeout(turnHeatOff,sr.heatDuration * minutesToMilliseconds);
}
// Function to turn air ventilation in/heat OFF
function turnHeatOff() {
  //log("Turning Heat OFF");
  setRelay(HEAT,OFF);
  currHeatVal = OFF;
}

// Send metric values to a website
function logMetric() {
    metricJSON = "{" + "tempature:" + currTemperature
        + ",heatDuration:" + sr.heatDuration
        + "," + relayNames[0] + ":" + relayMetricValues[0]
        + "," + relayNames[1] + ":" + relayMetricValues[1]
        + "," + relayNames[2] + ":" + relayMetricValues[2]
        + "," + relayNames[3] + ":" + relayMetricValues[3]
        + "}";
    emoncmsUrl = EMONCMS_INPUT_URL + "&json=" + metricJSON;

    get.concat(emoncmsUrl, function (err, res, data) {
        if (err) {
            log("Error in logMetric send, metricJSON = " + metricJSON);
            log("err = " + err);
        } else {
            //log("Server statusCode = "+res.statusCode) // 200 
            //log("Server response = "+data) // Buffer('this is the server response') 
            //log("logMetric send, metricJSON = " + metricJSON);
        }
    });

    // Set the next time the function will run
    setTimeout(logMetric, metricInterval);
}

function webControl(boardMessage) {
  if (boardMessage.relay3 != null) {
    setRelay(HEAT,boardMessage.relay3);
  }
  if (boardMessage.relay4 != null) {
    //setRelay(WATER,boardMessage.relay4);
    if (boardMessage.relay4 == 1) {
      setTimeout(waterThePlants);
    }
  }

  if (boardMessage.selfie != null) {
    setTimeout(letMeTakeASelfie);
  }

  // If send a new store rec, replace the existing and store it to disk
  if (boardMessage.storeRec != null) {
    sr = boardMessage.storeRec;
    store.add(sr, function(err) {
      if (err) {
        //throw err;
        console.log("Error updating store rec, err = "+err);
      }
    });
  }

} // function webControl(boardMessage) {


function letMeTakeASelfie() {
  /*
  setTimeout(() => {
    //console.log("Taking a selfie with fswebcam capture");
    // figure out how to save a weekly picture
    nodeWebcam.capture(process.env.IMAGES_DIR+"genvImage", nodewebcamOptions, function( err, data ) {
      if (err != null) {
        console.log("Error with webcam capture, err = "+err);
      }
      //var image = "<img src='" + data + "'>";
      //setRelay(HEAT,OFF);
    });
  }, 100);
  */
}

function waterThePlants() {
    log("Watering the plants, waterDuration = "+sr.waterDuration);
    setRelay(WATER,ON);
    setTimeout(() => {
        log("Watering the plants OFF");
        setRelay(WATER,OFF);
    }, sr.waterDuration * secondsToMilliseconds);
}

function _waterOn(waterSeconds) {
    log("Turning Water ON, seconds = " + waterSeconds);
    setRelay(WATER, ON);
    setTimeout(() => {
        log("Turning Water OFF");
        setRelay(WATER, OFF);
    }, waterSeconds * secondsToMilliseconds);
}

function getStoreRec() {
    return sr;
}

function _saveStoreRec() {
    sr.id = storeId;
    //sr.logList = logArray;
    store.add(sr, function (err) {
        if (err) {
            //throw err;
            log("Error updating store rec, err = " + err);
        }
    });
}

function log(inStr) {
    var logStr = dateTime.create().format('Y-m-d H:M:S') + " " + inStr;
    console.log(logStr);
    //logArray.push(logStr);
    //_saveStoreRec();
}

function updateConfig(inStoreRec) {
    sr = inStoreRec;
    log("updateConfig, targetTemperature = " + sr.targetTemperature);
    _saveStoreRec();
}

function clearLog() {
    logArray.length = 0;
    _saveStoreRec();
}

function water(inRec) {
    _waterOn(inRec.waterSeconds);
}

module.exports = {
    getStoreRec,
    updateConfig,
    clearLog,
    water
};

