/*==============================================================================
(C) Copyright 2019,2021,2022 John J Kauflin, All rights reserved. 
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
2020-04-09 JJK  Got running on a Pi Zero, removed events and web functions
2021-03-05 JJK  Adding a call to weather API to get current weather 
                conditions to add to feed info
2021-03-07 JJK  Updated to use fetch instead of get for HTTP calls
2021-09-18 JJK  Get working at new house (same setup, outside)
2021-10-22 JJK  Added currWattsOut for an estimated value of the watts
                being produced (post inverter)
2022-04-02 JJK  Updated to use newest version of node-fetch
                >>>>> hold off for now, v3 has breaking changes for ES6
                went back to v2 for now
2022-04-17 JJK  Working on error handling - implementing a overall try/catch
                for the main executable code
2022-04-30 JJK  Implemented the startBoard function to re-start the
                sensors periodically or after a FETCH failure
2022-05-05 JJK  Change sensor frequency from default 25ms to 250ms to keep
                it from overloading (trying to find the problem of
                hang-ups on BBB)
2022-05-07 JJK  Looking at re-starting the board as well to reset the 
                sensors - restart the board every hour and see if it hangs
                up again (then check for repeating value condition to 
                reset the board?)
2022-05-12 JJK  Found out trying to "reset" the board and sensors by 
                re-creating the johnny-five object didn't seem to do
                anything, go giving up on re-starting the board, and 
                just put in a RuntimeMaxSec on the systemd service to
                re-start that every X seconds
2022-05-15 JJK  Adding counter for duplicate values
2022-07-31 JJK  Working on monitor for new panels setup
2022-08-03 JJK  Got old sensors working for new setup
=============================================================================*/
const fetch = require('node-fetch');
//import fetch from 'node-fetch';

// Library to control the Arduino board
var five = require("johnny-five");
//var Raspi = require("raspi-io").RaspiIO;
//var BeagleBone = require('beaglebone-io');

// Global variables
const EMONCMS_INPUT_URL = process.env.EMONCMS_INPUT_URL;
const WEATHER_URL = process.env.WEATHER_URL;
var emoncmsUrl = "";
//var metricJSON = "";
//var intervalSeconds = 20;
var intervalSeconds = 15;
var metricInterval = intervalSeconds * 1000;
var weatherInterval = (intervalSeconds*2) * 1000;
const minutesToMilliseconds = 60 * 1000;
const secondsToMilliseconds = 1000;

var voltageSensor = null;
var currVoltage = 0;
var ampSensor = null;
var currAmperage = 0;
var currWatts = 0;
var currWattsOut = 0;

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

const analogPinMax = 1023.0;
const arduinoPower = 5.0;
const res1 = 330000.0;
const res2 = 10000.0;
//int mVperAmp = 66; // use 100 for 20A Module and 66 for 30A Module
const mVperAmp = 15.5; // use 100 for 20A Module and 66 for 30A Module
const ACSoffset = 2500;
var tempVoltage = 0;
log("Max. voltage = arduinoPower / (res2 / (res1 + res2))");
log("Device (arduino) power voltage: "+arduinoPower);
log("                    Resistor 1: "+res1);
log("                    Resistor 2: "+res2);
log("  DC VOLTMETER Maximum Voltage: "+(arduinoPower / (res2 / (res1 + res2))));
// DC VOLTMETER Maximum Voltage: 170


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
var prevHours = 0;
var currVoltagePrev = 0;
var currAmperagePrev = 0;
var duplicateCnt = 0;
var board = null;

startBoard();
    

function startBoard() {
    log("===== Starting board initialization =====");
    board = null;
    voltageSensor = null;
    ampSensor = null;

    try {
        // Create Johnny-Five board object
        // When running Johnny-Five programs as a sub-process (eg. init.d, or npm scripts), 
        // be sure to shut the REPL off!
        board = new five.Board({
            // io: new BeagleBone(),
            repl: false,
            debug: false
            // timeout: 12000
        });
    
        board.on("error", function () {
            log("*** Error in Board ***");
        }); // board.on("error", function() {
        
        //-------------------------------------------------------------------------------------------------------
        // When the board is ready, create and intialize global component objects (to be used by functions)
        //-------------------------------------------------------------------------------------------------------
        // When the board is ready, create and intialize global component objects (to be used by functions)
        board.on("ready", function () {
            log("*** board ready ***")
        
            var led = new five.Led()
            log(">>>>> blink default LED")
            led.blink()

            /*
            log(">>>>>>> REBOOT <<<<<<<");
            const { exec } = require('child_process');
            exec('ls | reboot', (err, stdout, stderr) => {
              if (err) {
                //some err occurred
                console.error(err)
              } else {
               // the *entire* stdout and stderr (buffered)
               console.log(`stdout: ${stdout}`);
               console.log(`stderr: ${stderr}`);
              }
            });
            */

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
        
/*

>>> ampSensor this.value = 518
Split core A3 = 432
>>> ampSensor this.value = 519
Split core A3 = 413
$$$$$ Voltage Sensor this.value = 235
>>> ampSensor this.value = 518
Split core A3 = 817
$$$$$ Voltage Sensor this.value = 240
Split core A3 = 670
$$$$$ Voltage Sensor this.value = 237
>>> ampSensor this.value = 519
Split core A3 = 509
$$$$$ Voltage Sensor this.value = 234
>>> ampSensor this.value = 517
Split core A3 = 226
$$$$$ Voltage Sensor this.value = 238
>>> ampSensor this.value = 519
$$$$$ Voltage Sensor this.value = 242
Split core A3 = 592
$$$$$ Voltage Sensor this.value = 242
>>> ampSensor this.value = 517
Split core A3 = 627
$$$$$ Voltage Sensor this.value = 238
>>> ampSensor this.value = 519
Split core A3 = 497
$$$$$ Voltage Sensor this.value = 241
>>> ampSensor this.value = 518
Split core A3 = 566
$$$$$ Voltage Sensor this.value = 236
Split core A3 = 652
$$$$$ Voltage Sensor this.value = 241
>>> ampSensor this.value = 516
Split core A3 = 811
$$$$$ Voltage Sensor this.value = 238
>>> ampSensor this.value = 518
Split core A3 = 785
$$$$$ Voltage Sensor this.value = 235
Split core A3 = 245
$$$$$ Voltage Sensor this.value = 240
Split core A3 = 318
$$$$$ Voltage Sensor this.value = 236
>>> ampSensor this.value = 519
Split core A3 = 543
$$$$$ Voltage Sensor this.value = 234
Split core A3 = 823
$$$$$ Voltage Sensor this.value = 240
Split core A3 = 649
$$$$$ Voltage Sensor this.value = 237
>>> ampSensor this.value = 518
Split core A3 = 420
$$$$$ Voltage Sensor this.value = 238
>>> ampSensor this.value = 516
Split core A3 = 337
$$$$$ Voltage Sensor this.value = 236
>>> ampSensor this.value = 520
Split core A3 = 642
>>> ampSensor this.value = 518
Split core A3 = 413
$$$$$ Voltage Sensor this.value = 235
Split core A3 = 511
$$$$$ Voltage Sensor this.value = 238
Split core A3 = 304
>>> ampSensor this.value = 520

*/

            // Define the analog voltage sensors (after waiting a few seconds for things to calm down)
            this.wait(4*secondsToMilliseconds, function () {
                log("$$$$$ Starting sensors");
                /*
                var voltageSensor2 = new five.Sensor("A3");
                voltageSensor2.on("change", function () {
                    log("Split core A3 = "+this.value)
                });
                */

                voltageSensor = new five.Sensor("A0");
                ampSensor = new five.Sensor("A1");
                // The freq: option caused it not to give values - need to check that
                //voltageSensor = new five.Sensor({
                //    pin: "A0", 
                //    freq: 250
                //});
                //ampSensor = new five.Sensor({
                //    pin: "A1", 
                //    freq: 250
                //});

                voltageSensor.on("change", function () {
                    //log("$$$$$ Voltage Sensor this.value = "+this.value);

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
                    //log(">>> ampSensor this.value = "+this.value);
                    
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

                        //averageA1 = 201.9, tempVoltage = 987.9876832844575, currAmperage = -97.54918172358339
                        //>>> logMetric, {"pvVolts":"35.06","pvAmps":"0.00","pvWatts":"0.00","pvWattsOut":"0.00",
                        
                    }
                });
            });
        
            // Start fetching weather after a few seconds
            setTimeout(fetchWeather, 5*secondsToMilliseconds);
            // Start sending metrics X seconds after starting (so things are calm and value arrays are full)
            setTimeout(logMetric, 10*secondsToMilliseconds);
            
            log("End of board.on (initialize) event");
        
        }); // board.on("ready", function() {
    
    } catch (err) {
        log('Error in main initialization, err = '+err);
        console.error(err.stack);
    } finally {
        // turn things off?
    }
} // end of startBoard

// Send metric values to a website
function logMetric() {
    // Just set low values to zero
    if (currVoltage < 2.0) {
        currVoltage = 0.0;
        currAmperage = 0.0;
    }
    if (currAmperage < 0.0) {
        currAmperage = 0.0;
    }

    // Check if the numbers are repeating
    if (currVoltage == currVoltagePrev && currAmperage == currAmperagePrev && currAmperage > 0
        ) {
        duplicateCnt++;
    }
    currVoltagePrev = currVoltage;
    currAmperagePrev = currAmperage;
    if (duplicateCnt > 10) {
        // Re-start the service
        // *** figure out how to do this ***
        log("++++++++++ over 10 DUPLICATE values detected ++++++++++");
        duplicateCnt = 0;
    }


    // Calculate current PV watts from voltage and amps
    currWatts = currVoltage * currAmperage;

    // Get estimate of the power from the new grid-tie inverter
    // 4 panels which is 1/2 of the 8 panels in the first grid-tie inverter
    var estimatedSecondInverterWatts = currWatts * 0.50;
    // Add estimated power to the watts out total
    currWatts = currWatts + estimatedSecondInverterWatts;

    // Get an estimate of the post-inverter watts (losing say 12%)
    currWattsOut = currWatts * 0.88;

    metricData.pvVolts = currVoltage.toFixed(2);
    metricData.pvAmps = currAmperage.toFixed(2);
    metricData.pvWatts = currWatts.toFixed(2);
    metricData.pvWattsOut = currWattsOut.toFixed(2);

    // Use this if we need to limit the send to between the hours of 6 and 20
    var date = new Date();
    var hours = date.getHours();
    if (hours > 5 && hours < 20) {
        log(`>>> logMetric, ${JSON.stringify(metricData).substring(0,105)}`);

        /*
        if (hours == 6 && prevHours > 18) {
            prevHours = 0;
        }

        // Restart the sensors every hour
        if (hours > prevHours) {
            prevHours = hours;
            log("!!!!! Restarting Board !!!!!!");
            startBoard();
        }
        */
        
        emoncmsUrl = EMONCMS_INPUT_URL+"&fulljson="+JSON.stringify(metricData);
        fetch(emoncmsUrl)
            .then(checkResponseStatus)
            .then(res => res.json())
            //.then(json => console.log(json))
            .catch(err => handleFetchError(err));
    }

    // Set the next time the function will run
    setTimeout(logMetric, metricInterval);
}

function handleFetchError(err) {
    log(" >>> FETCH ERROR: "+err);

    // Restart sensors if there is a Fetch error
    //startBoard();
}

function fetchWeather() {
    // Use this if we need to limit the send to between the hours of 6 and 20
    var date = new Date();
    var hours = date.getHours();
    if (hours > 6 && hours < 20) {
        fetch(WEATHER_URL)
            .then(checkResponseStatus)
            .then(res => res.json())
            .then(json => {
                metricData.weather = json.weather[0].id;
                metricData.weatherTemp = json.main.temp;
                metricData.weatherFeels = json.main.feels_like;
                metricData.weatherPressure = json.main.pressure;
                metricData.weatherHumidity = json.main.humidity;
                metricData.weatherDateTime = json.dt;
            })
            .catch(err => handleFetchError(err));
    }

    setTimeout(fetchWeather, weatherInterval);
}

function checkResponseStatus(res) {
    if(res.ok){
        //log(`Fetch reponse is OK: ${res.status} (${res.statusText})`);
        return res
    } else {
        //throw new Error(`The HTTP status of the reponse: ${res.status} (${res.statusText})`);
        log(`Fetch reponse is NOT OK: ${res.status} (${res.statusText})`);
    }
}

function log(inStr) {
    //var logStr = dateTime.create().format('Y-m-d H:M:S') + " " + inStr;
    /*
    var td = new Date();

    var tempMonth = td.getMonth() + 1;
    if (td.getMonth() < 9) {
        tempMonth = '0' + (td.getMonth() + 1);
    }
    var tempDay = td.getDate();
    if (td.getDate() < 10) {
        tempDay = '0' + td.getDate();
    }
    var formattedDate = td.getFullYear() + '-' + tempMonth + '-' + tempDay;

    //var dateStr = `${td.toDateString()} ${td.getHours()}:${td.getMinutes()}:${td.getSeconds()}.${td.getMilliseconds()}`;
    var dateStr = `${formattedDate} ${td.getHours()}:${td.getMinutes()}:${td.getSeconds()}.${td.getMilliseconds()}`;
    console.log(dateStr + " " + inStr);
    */
    console.log(inStr);
}

module.exports = {
};
