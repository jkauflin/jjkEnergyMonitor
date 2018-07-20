/*==============================================================================
(C) Copyright 2018 John J Kauflin, All rights reserved. 
-----------------------------------------------------------------------------
DESCRIPTION: Main nodejs server to run the web and control functions for
                the grow environment monitor
-----------------------------------------------------------------------------
Modification History
2016-06-12 JJK  Initial version to test making http requests to send data
                to emoncms
2016-06-21 JJK  Test recursive loop to run every X seconds
2016-06-22 JJK  HTTP GET to send data to emoncms working
2016-06-24 JJK  Working on getting Serial Port to work reading data from
                Arduino board (getting an error trying to open the port)
2016-06-25 JJK  Worked out understanding the SerialPort library and function
                Got the port open and got good data from the Arduino using
                the readline parser.  Working on loop and http now.
                *** All logic moved over - ready to turn it on !!!
2016-06-26 JJK  Adjusted lowCutoff from 12.45 to 12.40 and high from 13.15 to 13.17
2016-10-17 JJK  Modified to work with new setup of using the grid-tie inverter.
                Take the arduino data on pvVolts and pvAmps, calculate
                pvWatts, and pvWattsUsed and post to JJK emoncms
2017-05-21 JJK  Checking operation
2017-08-26 JJK  Get working again after upgrading OS to Debian 8.9, Node 4.8.4
2017-08-27 JJK  Updated serialport notation and use of parser for Readline
                Added cleanStr to remove the carriage return (13) from the
                end of the data string
2017-12-26 JJK  Got working as a systemd service on BBB after upgrading
                to BBB Debian 9.3 and NodeJS 6.12
2018-07-06 JJK  Back to the BBB after increasing panels from 4 to 6
2018-07-07 JJK  Got it working with the old formulas and logging metrics
                to my website
2018-07-19 JJK  Got an Arduino Mega (SunFounder) to run StandardFirmataPlus
                and the sensors, and got logging to emoncms again
=============================================================================*/

// Read environment variables from the .env file
require('dotenv').config();
//NODE_ENV=
//DEBUG=
//EMONCMS_INPUT_URL=

// General handler for any uncaught exceptions
process.on('uncaughtException', function (e) {
	console.log("UncaughtException, error = "+e);
	console.error(e.stack);
  // Stop the process
  // 2017-12-29 JJK - Don't stop for now, just log the error
	//process.exit(1);
});

const get = require('simple-get')
// When running Johnny-Five programs as a sub-process (eg. init.d, or npm scripts), 
// be sure to shut the REPL off!
var five = require("johnny-five");

var five = require('johnny-five');
//var BeagleBone = require('beaglebone-io');

var voltageSensor = null;
var currVoltage = 0;
var ampSensor = null;
var currAmperage = 0;
var currWatts = 0;

// Global variables
const development = process.env.NODE_ENV !== 'production';
const debug = process.env.DEBUG;
const EMONCMS_INPUT_URL = process.env.EMONCMS_INPUT_URL;
var emoncmsUrl = "";
var metricJSON = "";

//var intervalSeconds = 30;
var intervalSeconds = 20;
var intVal = intervalSeconds * 1000;
var currMs;
var nextSendMsVoltage = 0;
var nextSendMsAmperage = 0;
const OFF = 0;
const ON = 1;

const analogPinMax = 1023.0;
const arduinoPower = 5.0;
const res1 = 330000.0;
const res2 = 10000.0;
//int mVperAmp = 66; // use 100 for 20A Module and 66 for 30A Module
const mVperAmp = 15.5; // use 100 for 20A Module and 66 for 30A Module
const ACSoffset = 2500; 
var tempVoltage = 0;
//console.log("DC VOLTMETER Maximum Voltage: "+(arduinoPower / (res2 / (res1 + res2))));

const minutesToMilliseconds = 60 * 1000;
const secondsToMilliseconds = 1000;
var date;
var hours = 0;

// Variables to hold sensor values
var numReadings = 10;   // Total number of readings to average
var readingsA0 = [];    // Array of readings
var indexA0 = 0;        // the index of the current reading
var totalA0 = 0;        // the running total
var averageA0 = 0.0;
// initialize all the readings to 0:
for (var i = 0; i < numReadings; i++) {
    readingsA0[i] = 0;     
}
var arrayFull = false;

var readingsA1 = [];    // Array of readings
var indexA1 = 0;        // the index of the current reading
var totalA1 = 0;        // the running total
var averageA1 = 0.0;
// initialize all the readings to 0:
for (var i = 0; i < numReadings; i++) {
    readingsA1[i] = 0;     
}
var arrayFull1 = false;

/*
var board = new BeagleBone();
 
board.on('ready', function () {
  this.pinMode('A0', this.MODES.ANALOG);
  this.analogRead('A0', function (value) {
    console.log("BBB A0 = "+value);
  });
});

  io: new BeagleBone(),
*/

// Create Johnny-Five board object
var board = new five.Board({
  repl: false,
  debug: true,
  timeout: 12000
});

board.on("error", function() {
  boardEvent.emit("error", "*** Error in Board ***");
}); // board.on("error", function() {

board.on("message", function(event) {
  console.log("Received a %s message, from %s, reporting: %s", event.type, event.class, event.message);
});

console.log("============ Starting board initialization ================");
//-------------------------------------------------------------------------------------------------------
// When the board is ready, create and intialize global component objects (to be used by functions)
//-------------------------------------------------------------------------------------------------------
board.on("ready", function() {
  console.log("board is ready");

  // Define the voltage sensor
  this.wait(5000, function() {
    console.log("Initialize sensors");
    voltageSensor = new five.Sensor("A0");
    //voltageSensor = new five.Sensor("P9_39");
    ampSensor = new five.Sensor("A1");
    //ampSensor = new five.Sensor("P9_37");
  
    // Scale the sensor's data from 0-1023 to 0-10 and log changes
    voltageSensor.on("change", function() {
      //console.log(this.scaleTo(0, 10));

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
      // calculate the average:
      if (arrayFull) {
        currVoltage
        averageA0 = totalA0 / numReadings;        
        //pinVoltage = (averageA0 / 1023.0) * arduinoPower;
        currVoltage = ((averageA0 / analogPinMax) * arduinoPower) / (res2 / (res1 + res2));
      }

      currMs = Date.now();
      //console.log("Tempature = "+this.fahrenheit + "°F");
      //if (currMs > nextSendMsVoltage && currTemperature > 60.0 && currTemperature < 135.0 && arrayFull) {
      if (currMs > nextSendMsVoltage && arrayFull) {
        setTimeout(logMetric);
        //console.log("currVoltage = "+currVoltage);
        nextSendMsVoltage = currMs + intVal;
      }

    });

    // Scale the sensor's data from 0-1023 to 0-10 and log changes
    ampSensor.on("change", function() {
      //console.log(this.scaleTo(0, 10));
      //console.log("A1 value = "+this.value);

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
        tempVoltage = (averageA1 / analogPinMax) * 5000; // Gets you mV    
        currAmperage = ((tempVoltage - ACSoffset) / mVperAmp);
        //console.log("averageA1 = "+averageA1+", tempVoltage = "+tempVoltage+", currAmperage = "+currAmperage);
        //averageA1 = 512.5, tempVoltage = 2509.8973607038124, currAmperage = 0.6385394002459619
        //const mVperAmp = 15.5; // use 100 for 20A Module and 66 for 30A Module
        //const ACSoffset = 2500; 
      }

      currMs = Date.now();
      //console.log("Tempature = "+this.fahrenheit + "°F");
      //if (currMs > nextSendMsVoltage && currTemperature > 60.0 && currTemperature < 135.0 && arrayFull) {
      if (currMs > nextSendMsAmperage && arrayFull1) {
        setTimeout(logMetric);
        //console.log("currAmperage = "+currAmperage);
        nextSendMsAmperage = currMs + intVal;
      }

    });


  });

  console.log("End of board.on (initialize) event");
  console.log(" ");

  // If the board is exiting, turn all the relays off
  this.on("exit", function() {
    console.log("EXIT - cleaning up");
    //setRelay(LIGHTS,OFF);
  });

}); // board.on("ready", function() {


function logMetric() {
  if (currVoltage < 2.0) {
    currVoltage = 0.0;
    currAmperage = 0.0;
  }
  currWatts = currVoltage * currAmperage;
  //pvWattsUsed = pvWatts * 0.85;
  //var sURL = EMONCMS_INPUT_URL + "&json={" + data + ",pvWatts:" + pvWatts.toFixed(3) + ",pvWattsUsed:" + pvWattsUsed.toFixed(3) + "}";

  metricJSON = "{" + "pvVolts:"+currVoltage
      +",pvAmps:"+currAmperage
      +",pvWatts:"+currWatts
      +"}";
  emoncmsUrl = EMONCMS_INPUT_URL + "&json=" + metricJSON;
  //console.log("logMetric, metricJSON = "+metricJSON);

  get.concat(emoncmsUrl, function (err, res, data) {
    if (err) {
      console.error("Error in logMetric send, metricJSON = "+metricJSON);
      console.error("err = "+err);
    } else {
      //console.log(res.statusCode) // 200 
      //console.log(data) // Buffer('this is the server response') 
    }
  });

}

