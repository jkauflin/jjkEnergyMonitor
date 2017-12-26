/*==============================================================================
(C) Copyright 2016 John J Kauflin, All rights reserved. 
-----------------------------------------------------------------------------
DESCRIPTION: Functions to execute Admin operations
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
=============================================================================*/

// General handler for any uncaught exceptions
process.on('uncaughtException', function (er) {
	console.log("UncaughtException in jjkEnergyMonitor, error = "+er);
	console.error(er.stack);
	// Stop the process
	process.exit(1);
});

//Non-Printable characters - Hex 01 to 1F, and 7F
const nonPrintableCharsStr = "[\x01-\x1F\x7F]";
//"g" global so it does more than 1 substitution
const regexNonPrintableChars = new RegExp(nonPrintableCharsStr,"g");
function cleanStr(inStr) {
	return inStr.replace(regexNonPrintableChars,'');
}

// Include the request library to make HTTP GET requests
const request = require('request');

// Global variables
const EMONCMS_INPUT_URL = process.env.EMONCMS_INPUT_URL;

const SerialPort = require('serialport');
const Readline = SerialPort.parsers.Readline;
const port = new SerialPort(process.env.PORT_PATH);
const parser = new Readline();
port.pipe(parser);
//parser.on('data', console.log);
parser.on('data', function(data) { 
  //console.log('Data: ' + data);
  if (data.search("pvVolts") >= 0) {
    processData(data);
  }
});

console.log("Starting to monitor output from Arduino serial port...");

// Process the data line from the Arduino
function processData(data) {
  data = cleanStr(data);
  //console.log(data);
  // pvVolts:19.000,pvAmps:12.903,battVolts:13.469,ampsBeingUsed:0.579,wattsBeingUsed:38.238
  // pvVolts:19.000,pvAmps:12.903
  // pvVolts:0.000,pvAmps:0.000
  
  var pvVolts = 0.0;
  var pvAmps = 0.0;
  var pvWatts = 0.0;
  var pvWattsUsed = 0.0;
  var dataArray = data.split(",");

  var tempStr = "";
  var i = 0;
  for (i = 0; i < dataArray.length; i++) { 
    tempStr = dataArray[i];
    if (tempStr.search("pvVolts") >= 0) {
      pvVolts = parseFloat(tempStr.substr(8));
    } else if (tempStr.search("pvAmps") >= 0) {
      pvAmps = parseFloat(tempStr.substr(7));
    }
  }

  pvWatts = pvVolts * pvAmps;
  pvWattsUsed = pvWatts * 0.85;
  
  var sURL = EMONCMS_INPUT_URL + "&json={" + data + ",pvWatts:" + pvWatts.toFixed(3) + ",pvWattsUsed:" + pvWattsUsed.toFixed(3) + "}";
  //console.log("sURL = "+sURL);
  /*
  console.log("data = "+data);
  console.log("data.length = "+data.length);
  for (var j = 0; j < data.length; j++) {
    console.log("data.charCodeAt(%d) = %s",j,data.charCodeAt(j));
  }
  */
  
  // Call the url to send the data to the website
  httpGet(sURL);   
 
} // End of function processData(data) {

//----------------------------------------------------------------------------
// Function to execute an HTTP GET request to a specified URL
//----------------------------------------------------------------------------
//function httpGet(sURL, callback) {
function httpGet(sURL) {
    var options = {
        uri : sURL,
        method : 'GET'
    };
    var res = '';
    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            res = body;
        }
        else {
            res = 'Not Found';
            console.log("Error in response, sURL = "+sURL);
        }
        //callback(res);
    });
} // End of function httpGet(sURL) {

