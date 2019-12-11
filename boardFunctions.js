/*==============================================================================
(C) Copyright 2019 John J Kauflin, All rights reserved. 
-----------------------------------------------------------------------------
DESCRIPTION: NodeJS module to handle board functions.  Communicates with
             the Arduino Mega board, and monitors the following voltage
             sensors to determine energy/power being generated from a
             array of solar panels:
A0 - Voltage level from solar array - using resitor split technique
A1 - PV current (amps from solar panels) - using non-invasive current monitor

Calculation uses these to get watts:
Power (in Watts) = Voltage(in Volts) x Current(in Amps)

-----------------------------------------------------------------------------
Modification History
2019-11-29 JJK  Gave up on raspi-io for now because I need the analog 
                voltage sensors on the Arduino Mega board.  Using johnny-five
                library and StandardFirmata on the Arduino
2019-11-30 JJK  Got the old calculations and the send to a personal emoncms
                working again (using static interval method that emoncms likes)
=============================================================================*/
var dateTime = require('node-datetime');
const get = require('simple-get')
const EventEmitter = require('events');

// Library to control the Arduino board
var five = require("johnny-five");
//var Raspi = require("raspi-io").RaspiIO;

// Set up the configuration store and initial values
//var store = require('json-fs-store')(process.env.STORE_DIR);
var store = require('json-fs-store')("./");
var storeId = 'storeid';
var logArray = [];
var initStoreRec = {
    id: storeId,                // unique identifier
    pvkWhTotal: 9.25,
    pvkwhTotalStart: '2019-12-01',
    avgDailykWh: 2.00,
    desc: 'energy monitor'      // description
};

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
var intervalSeconds = 20;
var metricInterval = intervalSeconds * 1000;
const minutesToMilliseconds = 60 * 1000;
const secondsToMilliseconds = 1000;

var voltageSensor = null;
var currVoltage = 0;
var ampSensor = null;
var currAmperage = 0;
var currWatts = 0;

const analogPinMax = 1023.0;
const arduinoPower = 5.0;
const res1 = 330000.0;
const res2 = 10000.0;
//int mVperAmp = 66; // use 100 for 20A Module and 66 for 30A Module
const mVperAmp = 15.5; // use 100 for 20A Module and 66 for 30A Module
const ACSoffset = 2500;
var tempVoltage = 0;
log("DC VOLTMETER Maximum Voltage: "+(arduinoPower / (res2 / (res1 + res2))));

// Variables to hold sensor values
var numReadings = 10; // Total number of readings to average
var readingsA0 = []; // Array of readings
var indexA0 = 0; // the index of the current reading
var totalA0 = 0; // the running total
var averageA0 = 0.0;
// initialize all the readings to 0:
for (var i = 0; i < numReadings; i++) {
    readingsA0[i] = 0;
}
var arrayFull = false;

var readingsA1 = []; // Array of readings
var indexA1 = 0; // the index of the current reading
var totalA1 = 0; // the running total
var averageA1 = 0.0;
// initialize all the readings to 0:
for (var i = 0; i < numReadings; i++) {
    readingsA1[i] = 0;
}
var arrayFull1 = false;

// Create Johnny-Five board object
// When running Johnny-Five programs as a sub-process (eg. init.d, or npm scripts), 
// be sure to shut the REPL off!
/*
var board = new five.Board({
    repl: false,
    debug: false,
    io: new Raspi()
//    timeout: 12000
});
*/

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

    // If the board is exiting, execute cleanup actions
    this.on("exit", function () {
        log("on EXIT");
        //cleanup actions
    });
    // Handle a termination signal
    process.on('SIGTERM', function () {
        log('on SIGTERM');
        //cleanup actions
    });

    // Start sending metrics 10 seconds after starting (so things are calm and value arrays are full)
    setTimeout(logMetric, 10*secondsToMilliseconds);

    // Define the analog voltage sensors (after waiting a few seconds for things to calm down)
    this.wait(5*secondsToMilliseconds, function () {
        console.log("Initialize sensors");
        voltageSensor = new five.Sensor("A0");
        ampSensor = new five.Sensor("A1");

        voltageSensor.on("change", function () {
            // subtract the last reading:
            totalA0 = totalA0 - readingsA0[indexA0];
            readingsA0[indexA0] = this.value;
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
            // calculate the average when the array is full
            if (arrayFull) {
                averageA0 = totalA0 / numReadings;
                // Calculate the current voltage
                // currVoltage = ((averageA0 / analogPinMax) * arduinoPower) / (res2 / (res1 + res2));
                // 11/30/2019 JJK - Adjust to -30
                currVoltage = ((averageA0 / (analogPinMax - 30)) * arduinoPower) / (res2 / (res1 + res2));
            }
        });

        ampSensor.on("change", function () {
            // subtract the last reading:
            totalA1 = totalA1 - readingsA1[indexA1];
            readingsA1[indexA1] = this.value;
            // add the reading to the total:
            totalA1 = totalA1 + readingsA1[indexA1];
            // advance to the next position in the array: 
            indexA1 = indexA1 + 1;
            // if we're at the end of the array...
            if (indexA1 >= numReadings) {
                // ...wrap around to the beginning:
                indexA1 = 0;
                arrayFull1 = true;
            }
            // calculate the average:
            if (arrayFull1) {
                averageA1 = totalA1 / numReadings;
                //tempVoltage = (averageA1 / analogPinMax) * 5010; // Gets you mV    
                //tempVoltage = (averageA1 / analogPinMax) * 5000; // Gets you mV    
                // 11/30/2019 JJK - Adjustment to 5006
                tempVoltage = (averageA1 / analogPinMax) * 5006; // Gets you mV    
                currAmperage = ((tempVoltage - ACSoffset) / mVperAmp);
                //log("averageA1 = "+averageA1+", tempVoltage = "+tempVoltage+", currAmperage = "+currAmperage);
                //averageA1 = 512.5, tempVoltage = 2509.8973607038124, currAmperage = 0.6385394002459619
                //const mVperAmp = 15.5; // use 100 for 20A Module and 66 for 30A Module
                //const ACSoffset = 2500; 
            }
        });
    });
   
    log("End of board.on (initialize) event");

}); // board.on("ready", function() {


// Send metric values to a website
function logMetric() {
    // Just set low values to zero
    if (currVoltage < 2.0) {
        currVoltage = 0.0;
        currAmperage = 0.0;
    }

    // Calculate current PV watts from voltage and amps
    currWatts = currVoltage * currAmperage;

    // Construct the JSON structure and URL to send values to the emoncms web site
    metricJSON = "{" + "pvVolts:" + currVoltage.toFixed(2) +
        ",pvAmps:" + currAmperage.toFixed(2) +
        ",pvWatts:" + currWatts.toFixed(2) +
        "}";
    emoncmsUrl = EMONCMS_INPUT_URL + "&json=" + metricJSON;
    //log("logMetric, metricJSON = "+metricJSON);

    // Use this if we need to limit the send to between the hours of 6 and 20
    //var date = new Date();
    //var hours = date.getHours();
    //if (hours > 6 && hours < 20) {
    //}

    // Call the simple GET function to make the web HTTP request
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
  //if (boardMessage.relay3 != null) {
  //  setRelay(HEAT,boardMessage.relay3);
  // }

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
}

function updateConfig(inStoreRec) {
    sr = inStoreRec;
    log("updateConfig, targetTemperature = " + sr.targetTemperature);
    _saveStoreRec();
}

module.exports = {
    getStoreRec,
    updateConfig
};
