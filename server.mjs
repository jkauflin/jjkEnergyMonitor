/*==============================================================================
(C) Copyright 2016,2019,2021,2022 John J Kauflin, All rights reserved. 
-----------------------------------------------------------------------------
DESCRIPTION:  Monitor and logging program to get sensor data from a 
              smart plug monitoring the energy production of a grid-tie
              solar array and send it to a website running emoncms, where
              it can visualize the data and make it available publically
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
2021-01-09 JJK  Get working on Pi Zero (removed web app part)
2021-09-18 JJK  Get working at new house (same setup, but outside)
2022-04-02 JJK  Updated packages to get web calls working again
2022-08-10 JJK  Giving up on trying to do my own sensoring, arduino, and
                Pi, and just using a smart plug with open source monitoring
                but still sending values to emoncms on my website
                (plug is a KAUF smart plug running ESPHome REST API)
=============================================================================*/
// Read environment variables from the .env file
import * as dotenv from 'dotenv'
dotenv.config()
import fetch from 'node-fetch';

// Global variables
const SMART_PLUG_URL = process.env.SMART_PLUG_URL;
const EMONCMS_INPUT_URL = process.env.EMONCMS_INPUT_URL;
const WEATHER_URL = process.env.WEATHER_URL;
var emoncmsUrl = "";
var intervalSeconds = 15;
var metricInterval = intervalSeconds * 1000;
var weatherInterval = (intervalSeconds*2) * 1000;
const minutesToMilliseconds = 60 * 1000;
const secondsToMilliseconds = 1000;

var metricData = {
    pvVolts: 0,
    pvAmps: 0,
    pvWatts: 0,
    pvWattsOut: 0,
    weather: 0,
    weatherTemp: 0,
    weatherFeels: 0,
    weatherPressure: 0,
    weatherHumidity: 0,
    weatherDateTime: 0,
}

// General handler for any uncaught exceptions
process.on('uncaughtException', function (e) {
    console.log("UncaughtException, error = " + e);
    console.error(e.stack);
    // Stop the process
    // 2017-12-29 JJK - Don't stop for now, just log the error
	//process.exit(1);
});


log("===== Starting Energy Monitor =====");
// Start fetching weather after a few seconds
setTimeout(fetchWeather, 5*secondsToMilliseconds);

// Start sending metrics X seconds after starting
setTimeout(checkSensor, 10*secondsToMilliseconds);


// Send metric values to a website
function checkSensor() {
    /* Example of the URL format and data available from the smart plub
        /sensor/kauf_plug_voltage
    {"id":"sensor-kauf_plug_voltage","state":"122.2 V","value":122.2453}
        /sensor/kauf_plug_current
    {"id":"sensor-kauf_plug_current","state":"0.03 A","value":0.026108}
        /sensor/kauf_plug_power
    {"id":"sensor-kauf_plug_power","state":"0.4 W","value":0.379758}
    */

        // Call the REST API to get values from the smart plug sensor
    fetch(SMART_PLUG_URL+'/sensor/kauf_plug_voltage').then(res => res.json()).then(json => {
        metricData.pvVolts = json.value.toFixed(2);
    }).catch(err => handleFetchError(err));

    fetch(SMART_PLUG_URL+'/sensor/kauf_plug_current').then(res => res.json()).then(json => {
        metricData.pvAmps = json.value.toFixed(2);
    }).catch(err => handleFetchError(err));

    fetch(SMART_PLUG_URL+'/sensor/kauf_plug_power').then(res => res.json()).then(json => {
        metricData.pvWatts = json.value.toFixed(2);
        metricData.pvWattsOut = json.value.toFixed(2);
    }).catch(err => handleFetchError(err));

    // Use this if we need to limit the send to between the hours of 6 and 20
    var date = new Date();
    var hours = date.getHours();
    if (hours > 5 && hours < 20) {
        //log(`>>> logMetric, ${JSON.stringify(metricData).substring(0,105)}`);
        //log(`>>> logMetric, ${JSON.stringify(metricData)}`);

        // Send the data to the emoncms running on the website
        emoncmsUrl = EMONCMS_INPUT_URL+"&fulljson="+JSON.stringify(metricData);
        fetch(emoncmsUrl).catch(err => handleFetchError(err));
    }

    // Set the next time the function will run
    setTimeout(checkSensor, metricInterval);
}

function fetchWeather() {
    // Get local weather data from the open REST API
    fetch(WEATHER_URL).then(res => res.json()).then(json => {
        metricData.weather = json.weather[0].id
        metricData.weatherTemp = json.main.temp
        metricData.weatherFeels = json.main.feels_like
        metricData.weatherPressure = json.main.pressure
        metricData.weatherHumidity = json.main.humidity
        metricData.weatherDateTime = json.dt
    }).catch(err => handleFetchError(err));

    //log(`weatherTemp = ${metricData.weatherTemp}`)

    setTimeout(fetchWeather, weatherInterval);
}

/*
    //.then(checkResponseStatus)  *** why bother checking it if you are not going to do any thing ***
function checkResponseStatus(res) {
    if(res.ok){
        //log(`Fetch reponse is OK: ${res.status} (${res.statusText})`);
        return res
    } else {
        //throw new Error(`The HTTP status of the reponse: ${res.status} (${res.statusText})`);
        log(`Fetch reponse is NOT OK: ${res.status} (${res.statusText})`);
    }
}
*/
function handleFetchError(err) {
    //log(" >>> FETCH ERROR: "+err);
}

function paddy(num, padlen, padchar) {
    var pad_char = typeof padchar !== 'undefined' ? padchar : '0';
    var pad = new Array(1 + padlen).join(pad_char);
    return (pad + num).slice(-pad.length);
}
//var fu = paddy(14, 5); // 00014
//var bar = paddy(2, 4, '#'); // ###2

function log(inStr) {
    let td = new Date();
    let tempMonth = td.getMonth() + 1;
    let tempDay = td.getDate();
    let formattedDate = td.getFullYear() + '-' + paddy(tempMonth,2) + '-' + paddy(tempDay,2);
    var dateStr = `${formattedDate} ${paddy(td.getHours(),2)}:${paddy(td.getMinutes(),2)}:${paddy(td.getSeconds(),2)}.${td.getMilliseconds()}`;
    console.log(dateStr + " " + inStr);
}
