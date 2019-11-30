/*==============================================================================
 * (C) Copyright 2017,2019 John J Kauflin, All rights reserved. 
 *----------------------------------------------------------------------------
 * DESCRIPTION: Client-side JS functions and logic for web app
 *----------------------------------------------------------------------------
 * Modification History
 * 2017-09-08 JJK 	Initial version 
 * 2017-12-29 JJK	Initial controls and WebSocket communication
 * 2018-04-02 JJK   Added control to manually trigger watering
 * 2018-05-19 JJK   Added update of configuration store record values
 * 2018-06-18 JJK   Added lightDuration
 * 2018-08-19 JJK   Added description and dates
 * 2019-09-22 JJK   Getting it going again
 * 2019-09-28 JJK   Implemented modules concept and moved common methods to
 *                  util.js
 * 2019-11-30 JJK   Updated for EnergyMonitor
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

    //=================================================================================================================
    // Bind events
    $UpdateButton.click(_update);
    _lookup();

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

    //=================================================================================================================
    // This is what is exposed from this Module
    return {};

})(); // var main = (function(){
