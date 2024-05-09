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
2023-02-07 JJK  Corrected the error handling to not fail on errors
2023-03-18 JJK  Corrected pvWatts conversion from "n2" to "F2"
-----------------------------------------------------------------------------
2024-05-02 JJK  Modified to update metrics into Azure Cosmos DB NoSQL
                entities as part of migration of website to Azue SWA
2024-05-09 JJK  Completed development to log the point and total entities
                into the Cosmos DB containers
=============================================================================*/

using Microsoft.Azure.Cosmos;
using System.ComponentModel;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Container = Microsoft.Azure.Cosmos.Container;

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

    private float getFloatValue(string jsonStr)
    {
        float tempFloat = 0.0f;
        if (!string.IsNullOrEmpty(jsonStr))
        {
            var jsonRoot = JsonNode.Parse(jsonStr);
            tempFloat = (float)jsonRoot["value"];
        }
        return tempFloat;
    }


    public MetricData LogMetrics(MetricData metricData, Container metricPointContainer, Container metricTotalContainer, string smartPlugUrl, string emoncmsInputUrl)
    {
        // Limit the metric send to between the hours of 6:00am and 9:00pm
        int currHour = DateTime.Now.Hour;
        if (currHour < 6 || currHour >= 21)
        {
            return metricData;
        }

        var prev_plug_power = metricData.plug_power;
        var prev_metricDateTime = metricData.metricDateTime;

        try
        {
            // Call the REST API to get values from the smart plug sensor
            /* Example of the URL format and data available from the smart plub
                /sensor/kauf_plug_voltage
            {"id":"sensor-kauf_plug_voltage","state":"122.2 V","value":122.2453}
                /sensor/kauf_plug_current
            {"id":"sensor-kauf_plug_current","state":"0.03 A","value":0.026108}
                /sensor/kauf_plug_power
            {"id":"sensor-kauf_plug_power","state":"0.4 W","value":0.379758}
            */
            metricData.plug_voltage = 0.0f;
            metricData.plug_current = 0.0f;
            metricData.plug_power = 0.0f;

            // Get the values by making a RESTful call to the smart plug on the local network
            jsonStr = "";
            GetAsyncJson(smartPlugUrl + "/sensor/kauf_plug_voltage").Wait();
            metricData.plug_voltage = getFloatValue(jsonStr);
            jsonStr = "";
            GetAsyncJson(smartPlugUrl + "/sensor/kauf_plug_current").Wait();
            metricData.plug_current = getFloatValue(jsonStr);
            jsonStr = "";
            GetAsyncJson(smartPlugUrl + "/sensor/kauf_plug_power").Wait();
            metricData.plug_power = getFloatValue(jsonStr);

            metricData.metricDateTime = DateTime.Now;

            MetricPoint metricPoint = new MetricPoint
            {
                id = Guid.NewGuid().ToString(),
                PointDay = int.Parse(metricData.metricDateTime.ToString("yyyyMMdd")),
                PointDateTime = metricData.metricDateTime,
                PointYearMonth = int.Parse(metricData.metricDateTime.ToString("yyyyMM")),
                PointDayTime = int.Parse(metricData.metricDateTime.ToString("yyHHmmss")),
                pvVolts = metricData.plug_voltage.ToString("F2"),
                pvAmps = metricData.plug_current.ToString("F2"),
                pvWatts = metricData.plug_power.ToString("F2")
            };

            // Insert a new entity into the Cosmos DB Metric Point container
            metricPointContainer.CreateItemAsync<MetricPoint>(metricPoint, new PartitionKey(metricPoint.PointDay));

            // After the 1st call, calculate the power since the last call and add it to the DAY and YEAR buckets
            if (prev_plug_power > 0.00f)
            {
                TimeSpan metricDuration = metricData.metricDateTime - prev_metricDateTime;

                float powerDiff = (float)(Math.Abs(metricData.plug_power - prev_plug_power) / 2.0);
                float durationPower = prev_plug_power + powerDiff;
                if (prev_plug_power > metricData.plug_power)
                {
                    durationPower = metricData.plug_power + powerDiff;
                }

                metricData.kWh_bucket_DAY += (durationPower / 1000) * (float)metricDuration.TotalHours;
                metricData.kWh_bucket_YEAR += (durationPower / 1000) * (float)metricDuration.TotalHours;

                //Console.WriteLine("");
                //Console.WriteLine($"{metricData.metricDateTime.ToString("MM/dd/yyyy HH:mm:ss")}, power = {metricData.plug_power}, prev = {prev_plug_power}");
                //Console.WriteLine($"    duration (TotalHours) = {metricDuration.TotalHours}, power = {durationPower}, kWh = {(durationPower / 1000 * metricDuration.TotalHours)}");
                //Console.WriteLine($"    metricData.kWh_bucket_DAY  = {metricData.kWh_bucket_DAY} ");
                //Console.WriteLine($"    metricData.kWh_bucket_YEAR = {metricData.kWh_bucket_YEAR} ");

                // Update the DAY bucket Total
                MetricTotal metricTotal = new MetricTotal
                {
                    id = "DAY",
                    TotalBucket = int.Parse(metricData.metricDateTime.ToString("yyyyMMdd")),
                    LastUpdateDateTime = metricData.metricDateTime,
                    TotalValue = metricData.kWh_bucket_DAY.ToString("F2")
                };
                metricTotalContainer.UpsertItemAsync<MetricTotal>(metricTotal, new PartitionKey(metricTotal.TotalBucket));

                // Update the YEAR bucket Total
                metricTotal = new MetricTotal
                {
                    id = "YEAR",
                    TotalBucket = int.Parse(metricData.metricDateTime.ToString("yyyy")),
                    LastUpdateDateTime = metricData.metricDateTime,
                    TotalValue = metricData.kWh_bucket_YEAR.ToString("F2")
                };
                metricTotalContainer.UpsertItemAsync<MetricTotal>(metricTotal, new PartitionKey(metricTotal.TotalBucket));
            }

            MetricDataOld metricDataOld = new MetricDataOld();
            metricDataOld.pvVolts = metricData.plug_voltage.ToString("F2");
            metricDataOld.pvAmps = metricData.plug_current.ToString("F2");
            metricDataOld.pvWatts = metricData.plug_power.ToString("F2");

            var tempUrl = emoncmsInputUrl + "&fulljson=" + JsonSerializer.Serialize<MetricDataOld>(metricDataOld);

            // Send the data to the emoncms running on the website
            GetAsync(tempUrl).Wait();
        }
        catch (Exception ex)
        {
            // Ignore errors for now
        }

        return metricData;
    }

}
