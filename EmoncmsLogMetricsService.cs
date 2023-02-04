/*==============================================================================
(C) Copyright 2016,2019,2021,2023 John J Kauflin, All rights reserved. 
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
2022-09-10 JJK  Removed pvWattsOut because the watts is now post-inverter
2023-02-04 JJK  Converted from NodeJS to .NET C# to install and run as a
                Windows background worker service on a windows box
                (still trying to figure out how to access user secrets
                through the dependency injected configuration object)
=============================================================================*/

using System.Text.Json;
using System.Text.Json.Nodes;

namespace App.WindowsService;

public sealed class EmoncmsLogMetricsService
{
    private static HttpClient httpClient = new HttpClient();
    private static string jsonStr = " ";

    static async Task GetAsync(string urlParam)
    {
        //log($"urlParam = {urlParam}");
        using HttpResponseMessage response = await httpClient.GetAsync(urlParam);
        response.EnsureSuccessStatusCode();
    }

    static async Task GetAsyncJson(string urlParam)
    {
        //log($"urlParam = {urlParam}");
        using HttpResponseMessage response = await httpClient.GetAsync(urlParam);
        response.EnsureSuccessStatusCode();
        jsonStr = await response.Content.ReadAsStringAsync();
    }

    //public string LogMetrics(IConfiguration _configuration)
    public MetricData LogMetrics(MetricData metricData, string smartPlugUrl, string emoncmsInputUrl, string weatherUrl)
    {
        // Get values from user secrets
        /*
        var smartPlugUrl = _configuration.GetSection("SMART_PLUG_URL").Value;
        var emoncmsInputUrl = _configuration.GetSection("EMONCMS_INPUT_URL").Value;
        var weatherUrl = _configuration.GetSection("WEATHER_URL").Value;
        */

        // Call the weather OpenAPI to get weather value
        jsonStr = "";
        GetAsyncJson(weatherUrl).Wait();
        if (!string.IsNullOrEmpty(jsonStr))
        {
            /*
            coord ValueKind=Object Value={"lon":-84.1123,"lat":39.8353}
            weather ValueKind=Array Value=[{"id":801,"main":"Clouds","description":"few clouds","icon":"02d"}]
            base ValueKind=String Value=stations
            main ValueKind=Object Value={"temp":36.55,"feels_like":26.08,"temp_min":34.25,"temp_max":38.75,"pressure":1025,"":37}
            visibility ValueKind=Number Value=10000
            wind ValueKind=Object Value={"speed":19.57,"deg":190,"gust":25.32}
            clouds ValueKind=Object Value={"all":20}
            dt ValueKind=Number Value=1675534508
            sys ValueKind=Object Value={"type":1,"id":4087,"country":"US","sunrise":1675514519,"sunset":1675551522}
            timezone ValueKind=Number Value=-18000
            id ValueKind=Number Value=0
            name ValueKind=String Value=Dayton
            cod ValueKind=Number Value=200
            */

            try
            {
                var jsonRoot = JsonNode.Parse(jsonStr);
                var weather = jsonRoot["weather"][0];
                metricData.weather = (int)weather["id"];
                var weatherMain = jsonRoot["main"];
                metricData.weatherTemp = (float)weatherMain["temp"];
                metricData.weatherFeels = (float)weatherMain["feels_like"];
                metricData.weatherPressure = (int)weatherMain["pressure"];
                metricData.weatherHumidity = (int)weatherMain["humidity"];
                metricData.weatherDateTime = (int)jsonRoot["dt"];
            }
            catch (Exception ex)
            {
                // Ignore errors for now
            }

        }

        // Call the REST API to get values from the smart plug sensor
        /* Example of the URL format and data available from the smart plub
            /sensor/kauf_plug_voltage
        {"id":"sensor-kauf_plug_voltage","state":"122.2 V","value":122.2453}
            /sensor/kauf_plug_current
        {"id":"sensor-kauf_plug_current","state":"0.03 A","value":0.026108}
            /sensor/kauf_plug_power
        {"id":"sensor-kauf_plug_power","state":"0.4 W","value":0.379758}
        */
        jsonStr = "";
        GetAsyncJson(smartPlugUrl + "/sensor/kauf_plug_voltage").Wait();
        if (!string.IsNullOrEmpty(jsonStr))
        {
            try
            {
                var jsonRoot = JsonNode.Parse(jsonStr);
                var tempFloat = (float)jsonRoot["value"];
                metricData.pvVolts = tempFloat.ToString("n2");
            }
            catch (Exception ex)
            {
                // Ignore errors for now
            }
        }
        jsonStr = "";
        GetAsyncJson(smartPlugUrl + "/sensor/kauf_plug_current").Wait();
        if (!string.IsNullOrEmpty(jsonStr))
        {
            try
            {
                var jsonRoot = JsonNode.Parse(jsonStr);
                var tempFloat = (float)jsonRoot["value"];
                metricData.pvAmps = tempFloat.ToString("n2");
            }
            catch (Exception ex)
            {
                // Ignore errors for now
            }

        }
        jsonStr = "";
        GetAsyncJson(smartPlugUrl + "/sensor/kauf_plug_power").Wait();
        if (!string.IsNullOrEmpty(jsonStr))
        {
            try
            {
                var jsonRoot = JsonNode.Parse(jsonStr);
                var tempFloat = (float)jsonRoot["value"];
                metricData.pvWatts = tempFloat.ToString("n2");
            }
            catch (Exception ex)
            {
                // Ignore errors for now
            }
        }

        // Use this if we need to limit the send to between the hours of 6 and 20
        int currHour = DateTime.Now.Hour;
        if (currHour > 5 && currHour < 20)
        {
            try
            {
                var tempUrl = emoncmsInputUrl + "&fulljson=" + JsonSerializer.Serialize<MetricData>(metricData);
                // Send the data to the emoncms running on the website
                GetAsync(tempUrl).Wait();
            }
            catch (Exception ex)
            {
                // Ignore errors for now
            }
        }

        return metricData;
    }

}
