/*==============================================================================
(C) Copyright 2016,2019 John J Kauflin, All rights reserved. 
-----------------------------------------------------------------------------
DESCRIPTION: Main nodejs server to run the web and control functions for
                the solar energy monitor
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
2018-08-10 JJK  Modified to only send to emoncms between 6am and 8pm
-----------------------------------------------------------------------------
2019-09-08 JJK  Upgraded to Raspbian Buster and NodeJS v10
2019-09-28 JJK  Re-implementing web display and updates to config values
2019-11-11 JJK  Pulling in the newest NodeJS coding ideas and getting the
                Energy Monitor working again using just a Pi
2019-11-29 JJK  I got a voltage converter and soldered the pins, then 
                realized I needed analog voltage inputs to read the energy
                monitor sensors, so I went back to using an Arduino mega.
                Installed Examples --> Firmata --> StandardFirmata through
                the IDE
2020-04-09 JJK  Got it working on a Pi Zero
=============================================================================*/

// Read environment variables from the .env file
require('dotenv').config();
//NODE_ENV=
//DEBUG=
//HOST=
//WEB_PORT=
//WS_PORT=
//EMONCMS_INPUT_URL=
//STORE_DIR=
//IMAGES_DIR=

var WEB_PORT = process.env.WEB_PORT;

// General handler for any uncaught exceptions
process.on('uncaughtException', function (e) {
  console.log("UncaughtException, error = " + e);
  console.error(e.stack);
  // Stop the process
  // 2017-12-29 JJK - Don't stop for now, just log the error
	//process.exit(1);
});

// Create a web server
const http = require('http');
const url = require('url');
var dateTime = require('node-datetime');
const express = require('express');
var app = express();
var httpServer = http.createServer(app);

app.use('/',express.static('public'));
app.use(express.json());

// jjk new
app.use(function (err, req, res, next) {
    console.error(err.stack)
    res.status(500).send('Something broke!')
})

// Have the web server listen for requests
httpServer.listen(WEB_PORT,function() {
    console.log("Live at Port " + WEB_PORT + " - Let's rock!");
});

// Include the Arduino board functions
var boardFunctions = require('./boardFunctions.js');

/*
app.get('/GetValues', function (req, res, next) {
    res.send(JSON.stringify(boardFunctions.getStoreRec()));
});

app.post('/UpdateConfig', function (req, res, next) {
    boardFunctions.updateConfig(req.body);
    res.send(JSON.stringify(boardFunctions.getStoreRec()));
});

*/
