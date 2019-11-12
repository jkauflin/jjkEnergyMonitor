/*==============================================================================
 * (C) Copyright 2017,2019 John J Kauflin, All rights reserved. 
 *----------------------------------------------------------------------------
 * DESCRIPTION: Client-side JS functions and logic for web app
 *----------------------------------------------------------------------------
 * Modification History
 * 2017-09-08 JJK 	Initial version 
 * 2017-12-29 JJK	Initial controls and WebSocket communication
 * 2018-04-02 JJK   Added control to manually trigger watering
 * 2018-05-19 JJK  Added update of configuration store record values
 * 2018-06-18 JJK  Added lightDuration
 * 2018-08-19 JJK  Added description and dates
 * 2019-09-22 JJK  Getting it going again
 * 2019-09-28 JJK  Implemented modules concept and moved common methods to
 *                 util.js
 *============================================================================*/
var main = (function () {
    'use strict';

    //=================================================================================================================
    // Private variables for the Module
    var isTouchDevice = 'ontouchstart' in document.documentElement;
    var storeRec = null;

    //=================================================================================================================
    // Variables cached from the DOM
    var $document = $(document);
    var $desc = $document.find("#desc");

    var $daysToGerm = $document.find("#daysToGerm");
    var $daysToBloom = $document.find("#daysToBloom");
    var $germinationStart = $document.find("#germinationStart");
    var $estBloomDate = $document.find("#estBloomDate");
    var $bloomDate = $document.find("#bloomDate");

    var $germinationDate = $document.find("#germinationDate");
    var $harvestDate = $document.find("#harvestDate");
    var $cureDate = $document.find("#cureDate");
    var $productionDate = $document.find("#productionDate");
    var $targetTemperature = $document.find("#targetTemperature");
    var $airInterval = $document.find("#airInterval");
    var $airDuration = $document.find("#airDuration");
    var $heatInterval = $document.find("#heatInterval");
    var $heatDuration = $document.find("#heatDuration");
    var $heatDurationMin = $document.find("#heatDurationMin");
    var $heatDurationMax = $document.find("#heatDurationMax");
    var $lightDuration = $document.find("#lightDuration");
    var $waterDuration = $document.find("#waterDuration");
    var $waterSeconds = $document.find("#waterSeconds");
    var $ClearLogButton = $document.find("#ClearLogButton");
    var $UpdateButton = $document.find("#UpdateButton");
    var $WaterButton = $document.find("#WaterButton");
    var $Inputs = $document.find("#InputValues");

    //var $altAddress = $moduleDiv.find("#altAddress");
    var $LogMessageDisplay = $("#LogMessageDisplay").find('tbody');

    //=================================================================================================================
    // Bind events
    $ClearLogButton.click(_clearLog);
    $UpdateButton.click(_update);
    $WaterButton.click(_water);
    _lookup();

	$("#LightsButton")
	    .mousedown(function () {
	        if (!isTouchDevice) {
	            lightsPushed();
	        }
	    })
	    .mouseup(function () {
	        if (!isTouchDevice) {
	            lightsReleased();
	        }
	    })
	    .on('touchstart', function () {
	        if (isTouchDevice) {
	            lightsPushed();
	        }
	    })
	    .on('touchend', function () {
	        if (isTouchDevice) {
	            lightsReleased();
	        }
	    });

	$("#Relay1Button")
	    .mousedown(function () {
	        if (!isTouchDevice) {
	            relay1Pushed();
	        }
	    })
	    .mouseup(function () {
	        if (!isTouchDevice) {
	            relay1Released();
	        }
	    })
	    .on('touchstart', function () {
	        if (isTouchDevice) {
	            relay1Pushed();
	        }
	    })
	    .on('touchend', function () {
	        if (isTouchDevice) {
	            relay1Released();
	        }
	    });

	$("#Relay2Button")
	    .mousedown(function () {
	        if (!isTouchDevice) {
	            relay2Pushed();
	        }
	    })
	    .mouseup(function () {
	        if (!isTouchDevice) {
	            relay2Released();
	        }
	    })
	    .on('touchstart', function () {
	        if (isTouchDevice) {
	            relay2Pushed();
	        }
	    })
	    .on('touchend', function () {
	        if (isTouchDevice) {
	            relay2Released();
	        }
	    });

	$("#Relay3Button")
	    .mousedown(function () {
	        if (!isTouchDevice) {
	            relay3Pushed();
	        }
	    })
	    .mouseup(function () {
	        if (!isTouchDevice) {
	            relay3Released();
	        }
	    })
	    .on('touchstart', function () {
	        if (isTouchDevice) {
	            relay3Pushed();
	        }
	    })
	    .on('touchend', function () {
	        if (isTouchDevice) {
	            relay3Released();
	        }
	    });

	$("#Relay4Button")
	    .mousedown(function () {
	        if (!isTouchDevice) {
	            relay4Pushed();
	        }
	    })
	    .mouseup(function () {
	        if (!isTouchDevice) {
	            relay4Released();
	        }
	    })
	    .on('touchstart', function () {
	        if (isTouchDevice) {
	            relay4Pushed();
	        }
	    })
	    .on('touchend', function () {
	        if (isTouchDevice) {
	            relay4Released();
	        }
	    });

	$("#SelfieButton")
	    .mousedown(function () {
	        if (!isTouchDevice) {
	            selfiePushed();
	        }
	    })
	    .on('touchstart', function () {
	        if (isTouchDevice) {
	            selfiePushed();
	        }
	    });



    //=================================================================================================================
    // Module methods
    function _lookup(event) {
        var jqxhr = $.getJSON("GetValues", "", function (storeRec) {
            //console.log("GetValues, storeRec.desc = "+storeRec.desc);
            _renderConfig(storeRec);
        }).fail(function (e) {
            console.log("Error getting environment variables");
        });
    }

    function _renderConfig(storeRec) {
        $desc.val(storeRec.desc);
        $daysToGerm.val(storeRec.daysToGerm);
        $daysToBloom.val(storeRec.daysToBloom);
        $germinationStart.val(storeRec.germinationStart);
        $estBloomDate.val(storeRec.estBloomDate);
        $bloomDate.val(storeRec.bloomDate);

        $germinationDate.val(storeRec.germinationDate);
        $harvestDate.val(storeRec.harvestDate);
        $cureDate.val(storeRec.cureDate);
        $productionDate.val(storeRec.productionDate);

        $targetTemperature.val(storeRec.targetTemperature);
        $airInterval.val(storeRec.airInterval);
        $airDuration.val(storeRec.airDuration);
        $heatInterval.val(storeRec.heatInterval);
        $heatDuration.val(storeRec.heatDuration);
        $heatDurationMin.val(storeRec.heatDurationMin);
        $heatDurationMax.val(storeRec.heatDurationMax);
        $lightDuration.val(storeRec.lightDuration);
        $waterDuration.val(storeRec.waterDuration);

        // loop through and add to a table
        /*
        var tr = '';
        $.each(storeRec.logList, function (index, logRec) {
            tr += '<tr>';
            tr += '<td>' + logRec + '</td>';
            tr += '</tr>';
        });

        $LogMessageDisplay.html(tr);
        */
    }

    function _update(event) {
        var paramMap = null;
        //var paramMap = new Map();
        //paramMap.set('parcelId', event.target.getAttribute("data-Id"));
        //util.updateDataRecord(updateDataService, $Inputs, paramMap, displayFields, $ListDisplay, editClass);

        var url = "UpdateConfig";
        $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            data: util.getJSONfromInputs($Inputs, paramMap),
            dataType: "json"
            //dataType: "html"
        })
        .done(function (storeRec) {
            _renderConfig(storeRec);
        })
        .fail(function (xhr, status, error) {
            //Ajax request failed.
            console.log('Error in AJAX request to ' + url + ', xhr = ' + xhr.status + ': ' + xhr.statusText +
                ', status = ' + status + ', error = ' + error);
            alert('Error in AJAX request to ' + url + ', xhr = ' + xhr.status + ': ' + xhr.statusText +
                ', status = ' + status + ', error = ' + error);
        });
    }

    function _clearLog(event) {
        var jqxhr = $.getJSON("ClearLog", "", function (storeRec) {
            _renderConfig(storeRec);
        }).fail(function (e) {
            console.log("Error clearing log");
        });
    }

    function _water(event) {
        var paramMap = null;
        var paramMap = new Map();
        paramMap.set('waterSeconds', $waterSeconds.val());

        var url = "Water";
        $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            data: util.getJSONfromInputs(null, paramMap),
            dataType: "html"
        })
            .done(function () {
                //console.log("Successful call to Water");
            })
            .fail(function (xhr, status, error) {
                //Ajax request failed.
                console.log('Error in AJAX request to ' + url + ', xhr = ' + xhr.status + ': ' + xhr.statusText +
                    ', status = ' + status + ', error = ' + error);
                alert('Error in AJAX request to ' + url + ', xhr = ' + xhr.status + ': ' + xhr.statusText +
                    ', status = ' + status + ', error = ' + error);
            });
    }

    // General function to send the boardMessage to the server if Websocket is connected
    function wsSend(boardMessage) {
        //if (wsConnected) {
        //	ws.send(boardMessage);
        //}
    }

    function lightsPushed() {
        //console.log("Lights - Pushed");
        //$("#logMessage").html("Button - Pushed");
        wsSend('{"lights" : 1}');
    }

    function lightsReleased() {
        //console.log("Lights - Released");
        //$("#logMessage").html("Button - Released");
        wsSend('{"lights" : 0}');
    }

    function relay1Pushed() {
        wsSend('{"relay1" : 1}');
    }

    function relay1Released() {
        wsSend('{"relay1" : 0}');
    }

    function relay2Pushed() {
        wsSend('{"relay2" : 1}');
    }

    function relay2Released() {
        wsSend('{"relay2" : 0}');
    }

    function relay3Pushed() {
        wsSend('{"relay3" : 1}');
    }

    function relay3Released() {
        wsSend('{"relay3" : 0}');
    }

    function relay4Pushed() {
        wsSend('{"relay4" : 1}');
    }

    function relay4Released() {
        wsSend('{"relay4" : 0}');
    }

    function selfiePushed() {
        wsSend('{"selfie" : 1}');
    }

    //=================================================================================================================
    // This is what is exposed from this Module
    return {};

})(); // var main = (function(){
