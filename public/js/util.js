/*==============================================================================
 * (C) Copyright 2015,2016,2017,2018 John J Kauflin, All rights reserved. 
 *----------------------------------------------------------------------------
 * DESCRIPTION: 
 *----------------------------------------------------------------------------
 * Modification History
 * 2015-03-06 JJK 	Initial version 
 * 2015-04-09 JJK   Added Regular Expressions and functions for validating
 * 					email addresses and replacing non-printable characters
 * 2016-05-18 JJK   Added setTextArea
 * 2016-08-14 JJK   Imported data from Access backup of 8/12/2016
 * 2016-08-26 JJK   Went live, and Paypal payments working in Prod!!!
 * 2018-10-14 JJK   Re-factored for modules
 * 2018-10-27 JJK   Modified getJSONfromInputs to just loop through the DIV
 *                  looking for input fields, and added an action parameter
 * 2018-10-28 JJK   Went back to declaring variables in the functions
 * 2018-11-01 JJK   Modified getJSONfromInputs to only include elements with
 *                  an Id and check for checkbox "checked"
 * 2018-12-19 JJK   Added functions to abstract screen activities such as
 *                  display, search, edit, and update
 * 2019-09-28 JJK   Modified the JSON inputs method to accept DEV object
 *                  or name string.  Modified the AJAX calls to use new
 *                  promises to check result
 *============================================================================*/
 var util = (function(){
    'use strict';  // Force declaration of variables before use (among other things)
    //=================================================================================================================
    // Private variables for the Module

    //=================================================================================================================
    // Variables cached from the DOM
    var $document = $(document);
    var $ajaxError = $document.find(".ajaxError");
    var $wildcard = $('*');
    var $resetval = $document.find(".resetval");
    //var $Date = $document.find(".Date");

    //=================================================================================================================
    // Bind events
    // General AJAX error handler to log the exception and set a message in DIV tags with a ajaxError class
    /* 2019-09-28 JJK - Commented out (just handle within the AJAX calls)
    $document.ajaxError(function (e, xhr, settings, exception) {
        console.log("ajax exception = " + exception);
        console.log("ajax url = " + settings.url);
        console.log("xhr.responseText = " + xhr.responseText);
        defaultCursor();
        $ajaxError.html("An Error has occurred (see console log)");
    });
    */

    // Auto-close the collapse menu after clicking a non-dropdown menu item (in the bootstrap nav header)
    $document.on('click', '.navbar-collapse.in', function (e) {
        if ($(e.target).is('a') && $(e.target).attr('class') != 'dropdown-toggle') {
            $(this).collapse('hide');
        }
    });

    // Using addClear plug-in function to add a clear button on input text fields
    //$resetval.addClear();

     // Initialize Date picker library
     /*
     $Date.datetimepicker({
         timepicker: false,
         format: 'Y-m-d'
     });
     */

    //=================================================================================================================
    // Module methods
    function sleep(milliseconds) {
        var start = new Date().getTime();
        for (var i = 0; i < 1e7; i++) {
            if ((new Date().getTime() - start) > milliseconds) {
                break;
            }
        }
    }

    function urlParam(name) {
        var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
        if (results == null) {
            return null;
        }
        else {
            return results[1] || 0;
        }
    }
    /*
    example.com?param1=name&param2=&id=6
        urlParam('param1');     // name
        urlParam('id');         // 6
        rlParam('param2');      // null
    */

    var validEmailAddrRegExStr = "^((\"([ !#$%&'()*+,\\-./0-9:;<=>?@A-Z[\\]^_`a-z{|}~]|\\\\[ !\"#$%&'()*+,\\-./0-9:;<=>?@A-Z[\\\\\\]^_`a-z{|}~])*\"|([!#$%&'*+\\-/0-9=?A-Z^_`a-z{|}~]|\\\\[ !\"#$%&'()*+,\\-./0-9:;<=>?@A-Z[\\\\\\]^_`a-z{|}~])+)(\\.(\"([ !#$%&'()*+,\\-./0-9:;<=>?@A-Z[\\]^_`a-z{|}~]|\\\\[ !\"#$%&'()*+,\\-./0-9:;<=>?@A-Z[\\\\\\]^_`a-z{|}~])*\"|([!#$%&'*+\\-/0-9=?A-Z^_`a-z{|}~]|\\\\[ !\"#$%&'()*+,\\-./0-9:;<=>?@A-Z[\\\\\\]^_`a-z{|}~])+))*)@([a-zA-Z0-9]([-a-zA-Z0-9]*[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([-a-zA-Z0-9]*[a-zA-Z0-9])?)*\\.(?![0-9]*\\.?$)[a-zA-Z0-9]{2,}\\.?)$";
    var validEmailAddr = new RegExp(validEmailAddrRegExStr, "g");
    /*
    if (validEmailAddr.test(inStr)) {
        resultStr = '<b style="color:green;">VALID</b>';
    } else {
        resultStr = '<b style="color:red;">INVALID</b>';
    }
    */

    // Non-Printable characters - Hex 01 to 1F, and 7F
    var nonPrintableCharsStr = "[\x01-\x1F\x7F]";
    // "g" global so it does more than 1 substitution
    var regexNonPrintableChars = new RegExp(nonPrintableCharsStr, "g");
    function cleanStr(inStr) {
        return inStr.replace(regexNonPrintableChars, '');
    }

    // Filter out commas (for CSV outputs)
    var commaHexStr = "[\x2C]";
    var regexCommaHexStr = new RegExp(commaHexStr, "g");
    function csvFilter(inVal) {
        return inVal.toString().replace(regexCommaHexStr, '');
    }

    //Replace every ascii character except decimal and digits with a null, and round to 2 decimal places
    var nonMoneyCharsStr = "[\x01-\x2D\x2F\x3A-\x7F]";
    //"g" global so it does more than 1 substitution
    var regexNonMoneyChars = new RegExp(nonMoneyCharsStr, "g");
    function formatMoney(inAmount) {
        var inAmountStr = '' + inAmount;
        inAmountStr = inAmountStr.replace(regexNonMoneyChars, '');
        return parseFloat(inAmountStr).toFixed(2);
    }

    function formatDate(inDate) {
        var tempDate = inDate;
        if (tempDate == null) {
            tempDate = new Date();
        }
        var tempMonth = tempDate.getMonth() + 1;
        if (tempDate.getMonth() < 9) {
            tempMonth = '0' + (tempDate.getMonth() + 1);
        }
        var tempDay = tempDate.getDate();
        if (tempDate.getDate() < 10) {
            tempDay = '0' + tempDate.getDate();
        }
        return tempDate.getFullYear() + '-' + tempMonth + '-' + tempDay;
    }

    function waitCursor() {
        $wildcard.css('cursor', 'progress');
        $ajaxError.html("");
    }
    /*
    commented out because it messed up the cursor in other functions - put it individually around JSON services
    $document.ajaxComplete(function(event, request, settings) {
        $wildcard.css('cursor', 'default');
    });
    */
    function defaultCursor() {
        $wildcard.css('cursor', 'default');
    }

    // Helper functions for setting UI components from data
    function setBoolText(inBool) {
        var tempStr = "NO";
        if (inBool) {
            tempStr = "YES";
        }
        return tempStr;
    }
    function setCheckbox(checkVal) {
        var tempStr = '';
        if (checkVal == 1) {
            tempStr = 'checked=true';
        }
        return '<input type="checkbox" ' + tempStr + ' disabled="disabled">';
    }
    //function setCheckboxEdit(checkVal, idName) {
    function setCheckboxEdit(idName, checkVal) {
        var tempStr = '';
        if (checkVal == 1) {
            tempStr = 'checked=true';
        }
        return '<input id="' + idName + '" type="checkbox" ' + tempStr + '>';
    }
    function setInputText(idName, textVal, textSize) {
        return '<input id="' + idName + '" name="' + idName + '" type="text" class="form-control input-sm resetval" value="' + textVal + '" size="' + textSize + '" maxlength="' + textSize + '">';
    }
    function setTextArea(idName, textVal, rows) {
        return '<textarea id="' + idName + '" class="form-control input-sm" rows="' + rows + '">' + textVal + '</textarea>';
    }
    function setInputDate(idName, textVal, textSize) {
        return '<input id="' + idName + '" type="text" class="form-control input-sm Date" value="' + textVal + '" size="' + textSize + '" maxlength="' + textSize + '" placeholder="YYYY-MM-DD">';
    }
    function setSelectOption(optVal, displayVal, selected, bg) {
        var tempStr = '';
        if (selected) {
            tempStr = '<option class="' + bg + '" value="' + optVal + '" selected>' + displayVal + '</option>';
        } else {
            tempStr = '<option class="' + bg + '" value="' + optVal + '">' + displayVal + '</option>';
        }
        return tempStr;
    }

    // Function to get all input objects within a DIV, and extra entries from a map
    // and construct a JSON object with names and values (to pass in POST updates)
    // 2018-08-31 JJK - Modified to check for input DIV name string or object
    // Parameters:
    //   inDiv - DIV (JQuery object or String name) with input fields to include in JSON inputs
    //   paramMap - Structure holding extra parameters to include
    function getJSONfromInputs(inDiv, paramMap) {
        var first = true;
        var jsonStr = '{';

        if (inDiv !== null) {
            // Get all the input objects within the DIV
            var InputsDiv;
            if (inDiv instanceof String) {
                InputsDiv = $("#" + inDiv);
            } else {
                InputsDiv = inDiv;
            }
            var FormInputs = InputsDiv.find("input,textarea,select");

            // Loop through the objects and construct the JSON string
            $.each(FormInputs, function (index) {
                //id = useEmailCheckbox, type = checkbox
                //id = propertyComments, type = text
                // Only include elements that have an "id" in the JSON string
                if (typeof $(this).attr('id') !== 'undefined') {
                    if (first) {
                        first = false;
                    } else {
                        jsonStr += ',';
                    }
                    //console.log("id = " + $(this).attr('id') + ", type = " + $(this).attr("type"));
                    if ($(this).attr("type") == "checkbox") {
                        //console.log("id = " + $(this).attr('id') + ", $(this).prop('checked') = " + $(this).prop('checked'));
                        if ($(this).prop('checked')) {
                            jsonStr += '"' + $(this).attr('id') + '" : 1';
                        } else {
                            jsonStr += '"' + $(this).attr('id') + '" : 0';
                        }
                    } else {
                        jsonStr += '"' + $(this).attr('id') + '" : "' + cleanStr($(this).val()) + '"';
                    }
                }
            });
        }

        if (paramMap !== null) {
            paramMap.forEach(function (value, key) {
                if (first) {
                    first = false;
                } else {
                    jsonStr += ',';
                }
                jsonStr += '"' + key + '" : "' + value + '"';
            });
        }

        jsonStr += '}';
        return jsonStr;
    }

    // Common function to render and display a list of data records in a table
    function displayList(displayFields, list, $ListDisplay, editClass) {
        $ListDisplay.empty();
        var tr;
        $.each(list, function (index, rec) {
            if (index == 0) {
                tr = $('<tr>');
                $.each(rec, function (key, value) {
                    if (displayFields.includes(key)) {
                        tr.append($('<th>').html(key));
                    }
                });
                tr.appendTo($ListDisplay);
            }
            tr = $('<tr>');
            $.each(rec, function (key, value) {
                if (displayFields.includes(key)) {
                    if (key == 'id') {
                        tr.append($('<td>')
                            .append($('<a>').attr('href', "#")
                                .attr('class', editClass)
                                .attr('data-id', value)
                                .html(value)));
                    } else {
                        tr.append($('<td>').html(value));
                    }
                }
            });
            tr.appendTo($ListDisplay);
        });
    }

    // Clear all of the input, textarea, and select fields in a Div
    function clearInputs(InputsDiv) {
        if (InputsDiv !== null) {
            // Get all the input objects within the DIV
            var FormInputs = InputsDiv.find("input,textarea,select");
            // Loop through the objects and construct the JSON string
            $.each(FormInputs, function (index) {
                if (typeof $(this).attr('id') !== 'undefined') {
                    $(this).val("");
                    if ($(this).attr("type") == "checkbox") {
                        if ($(this).prop('checked')) {
                            $(this).prop('checked', false);
                        }
                    }
                }
            });
        }
    }

    // Common function to get data for a given search string, render and display in a table
    //   Parameters:
    //      getDataService      URL string of service to use to query data records (GET)        "getData.PHP"
    //      searchStr           String for parameters for the search query                      "SearchStr=<value to search for>"
    //      displayFields       Array of field names from the query to include in the display   ["id", "Field1", "Field2", "Field3"];
    //      $ListDisplay,       JQuery object for the HTML table in which to render the list    $ModuleDiv.find("#Display tbody");
    //      editClass           String of class attribute to be added to the id field as a link to edit the record      "EditClass"
    function searchDataDisplay(getDataService, searchStr, displayFields, $ListDisplay, editClass) {
        waitCursor();
        $.getJSON(getDataService, searchStr, function (list) {
             displayList(displayFields, list, $ListDisplay, editClass);
             defaultCursor();
        });
    }

    // Common function to get data for a given search string, render and display in a table
    //   Parameters:
    //      getDataService      URL string of service to use to query data records (GET)        "getData.PHP"
    //      searchStr           String for parameters for the search query                      "id=" + event.target.getAttribute("data-id")
    //      $Inputs             JQuery object for the HTML DIV which contains input fields      $ModuleDiv.find("#Input");
    function editDataRecord(getDataService, idStr, $Inputs) {
        waitCursor();
        $.getJSON(getDataService, idStr, function (list) {
            // Set values from the list into HTML input fields
            $.each(list, function (index, rec) {
                $.each(rec, function (key, value) {
                    $Inputs.find("#" + key).val(value);
                });
            });
            defaultCursor();
        });
    }
    
    //   Parameters:
    //      updateDataService   URL string of service to use to update data records (POST)      "updateData.PHP"
    //      displayFields       Array of field names from the query to include in the display   ["id", "Field1", "Field2", "Field3"];
    //      $Inputs             JQuery object for the HTML DIV which contains input fields      $ModuleDiv.find("#Input");
    //      paramMap            Map of extra parameters to add to the POST
    //      $ListDisplay,       JQuery object for the HTML table in which to render the list    $ModuleDiv.find("#Display tbody");
    //      editClass           String of class attribute to be added to the id field as a link to edit the record      "EditClass"
    function updateDataRecord(updateDataService, $Inputs, paramMap, displayFields, $ListDisplay, editClass) {
        //console.log("getJSONfromInputs() = " + getJSONfromInputs($Inputs, paramMap));
        waitCursor();

        $.ajax(url, {
            type: "POST",
            contentType: "application/json",
            data: getJSONfromInputs($Inputs, paramMap),
            dataType: "json"
            //dataType: "html"
        })
        .done(function (response) {
            //Ajax request was successful.
            //$("#" + outDiv).html(response);
            // Render the list 
            displayList(displayFields, response, $ListDisplay, editClass);
            defaultCursor();
            clearInputs($Inputs);
        })
        .fail(function (xhr, status, error) {
            //Ajax request failed.
            displayError("An error occurred in the update - see log");
            console.log('Error in AJAX request to ' + url + ', xhr = ' + xhr.status + ': ' + xhr.statusText +
                ', status = ' + status + ', error = ' + error);
            alert('Error in AJAX request to ' + url + ', xhr = ' + xhr.status + ': ' + xhr.statusText +
                ', status = ' + status + ', error = ' + error);
        });
    }

    // Common function to display error messages in fields with an ajaxError class
    function displayError(errorMessage) {
        $ajaxError.html(errorMessage);
    }

    //=================================================================================================================
    // This is what is exposed from this Module
    return {
        sleep:              sleep,
        urlParam:           urlParam,
        cleanStr:           cleanStr,
        csvFilter:          csvFilter,
        formatMoney:        formatMoney,
        formatDate:         formatDate,
        waitCursor:         waitCursor,
        defaultCursor:      defaultCursor,
        setBoolText:        setBoolText,
        setCheckbox:        setCheckbox,
        setCheckboxEdit:    setCheckboxEdit,
        setInputText:       setInputText,
        setTextArea:        setTextArea,
        setInputDate:       setInputDate,
        setSelectOption:    setSelectOption,
        getJSONfromInputs:  getJSONfromInputs,
        clearInputs:        clearInputs,
        displayList:        displayList,
        searchDataDisplay:  searchDataDisplay,
        editDataRecord:     editDataRecord,
        updateDataRecord:   updateDataRecord,
        displayError:       displayError
    };
        
})(); // var util = (function(){
