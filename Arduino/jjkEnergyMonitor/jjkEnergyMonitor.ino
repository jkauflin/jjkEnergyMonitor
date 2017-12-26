/*==============================================================================
 * (C) Copyright 2015 John J Kauflin, All rights reserved. 
 *----------------------------------------------------------------------------
 * DESCRIPTION: Monitor energy levels from an off-grid, battery backed, 
 *              PV array, and post them to emoncms.
 * A0 - Voltage level from battery array - using resitor split
 * A1 - PV current (amps from solar panels)- using current monitor
 * A2 - Irms (amps used post-inverter) - using non-invasive monitor
 *----------------------------------------------------------------------------
 * Modification History
 * 2015-07-24 JJK   Installed the 1st solar panel
 * 2015-07-25 JJK   Initial version with PV current, battery volt, and 
 *                  usage ampsm
 * 2015-07-26 JJK   Got the float conversion and the send to emoncms working
 * 2015-08-01 JJK   Working from the laptop to monitor send data problem
 * 2015-08-03 JJK   Removed the Ethernet internet requests - just writing 
 *                  data to the serial bus (reading it from a C# windows
 *                  service which then does the http get to emoncms)
 * 2016-06-25 JJK   Now using a Beaglebone Black to read the USB and send
 *                  the data to my jjk emoncms.
 * 2016-07-16 JJK   Divide the pvAmps by 2 because I looped it twice.
 * 2016-09-09 JJK   Back to the arduino
 * 2016-10-16 JJK   Got the voltage meter working correctly for the new
 *                  configuration (2 in series, those 2 in parallel - 
 *                  generating up to 40 volts).  Working on Amp meter.
 * 2016-10-17 JJK   Got non-invasive amp meter working again.
 * 2017-12-23 JJK   Moved to Raspberry Pi for Arduino IDE to Uno for deploy
 *                  Also changed send interval from 10 to 30 seconds
 *============================================================================*/

#include <SPI.h>

unsigned long currentMillis;
long previousMillis = 0;
 
// the follow variables is a long because the time, measured in miliseconds,
// will quickly become a bigger number than can be stored in an int.
// Send data to emoncms every 60 seconds
long sendSeconds = 30;
long sendDataInterval = sendSeconds * 1000;

char strBuffer[90];

float pvVolts = 0.0;
float pvAmps = 0.0;
char pvVoltsStr[10];
char pvAmpsStr[10];

//float arduinoPower = 4.7;
//float arduinoPower = 5.0;
//float arduinoPower = 5.181;
//float arduinoPower = 5.345;
float arduinoPower = 5.0;
float pinVoltage = 0.0;
/*
float res1 = 100000;
float res2 = 10000;
float res1 = 22000.0;
float res2 = 4700.0;
*/
float res1 = 330000.0;
float res2 = 10000.0;


//int mVperAmp = 66; // use 100 for 20A Module and 66 for 30A Module
int mVperAmp = 15.5; // use 100 for 20A Module and 66 for 30A Module
int ACSoffset = 2500; 
float tempVoltage = 0.0;

// Define arrays for smoothing out input values
// Define the number of samples to keep track of.  The higher the number,
// the more the readings will be smoothed, but the slower the output will
// respond to the input.  Using a constant rather than a normal variable lets
// use this value to determine the size of the readings array.
const int numReadings = 10;

int readingsA0[numReadings];      // the readings from the analog input
int indexA0 = 0;                  // the index of the current reading
int totalA0 = 0;                  // the running total
int averageA0 = 0;                // the average

int readingsA1[numReadings];      // the readings from the analog input
int indexA1 = 0;                  // the index of the current reading
int totalA1 = 0;                  // the running total
int averageA1 = 0;                // the average


void setup() {
  // Open serial communications and wait for port to open:
  Serial.begin(9600);
    
  Serial.println("------------------------------");
  Serial.println("DC VOLTMETER");
  Serial.print("Maximum Voltage: ");
  Serial.print((int)(arduinoPower / (res2 / (res1 + res2))));
  Serial.println("V");
  Serial.print("Send interval seconds: ");
  Serial.println((int)sendSeconds);
  Serial.println("------------------------------");
  Serial.println("");
   
  delay(1000);

  // initialize all the readings to 0: 
  for (int thisReading = 0; thisReading < numReadings; thisReading++)
    readingsA0[thisReading] = 0;      
  for (int thisReading = 0; thisReading < numReadings; thisReading++)
    readingsA1[thisReading] = 0;      
  Serial.println("End of setup");

} // End of setup

// Main processing loop
void loop() {
  currentMillis = millis();

  // Get values from analog A0 and A1 pins and average the reading to smooth them out
  
  // subtract the last reading:
  totalA0 = totalA0 - readingsA0[indexA0];         
  
  // read from the sensor:  
  readingsA0[indexA0] = analogRead(A0); 

  // add the reading to the total:
  totalA0 = totalA0 + readingsA0[indexA0];       
  // advance to the next position in the array:  
  indexA0 = indexA0 + 1;                    
  // if we're at the end of the array...
  if (indexA0 >= numReadings) {              
    // ...wrap around to the beginning: 
    indexA0 = 0;                           
  }
  // calculate the average:
  averageA0 = totalA0 / numReadings;         
  //averageA0 = analogRead(A0);

  
  // subtract the last reading:
  totalA1 = totalA1 - readingsA1[indexA1];         
  // read from the sensor:  
  readingsA1[indexA1] = analogRead(A1); 
  // add the reading to the total:
  totalA1 = totalA1 + readingsA1[indexA1];       
  // advance to the next position in the array:  
  indexA1 = indexA1 + 1;                    
  // if we're at the end of the array...
  if (indexA1 >= numReadings) {              
    // ...wrap around to the beginning: 
    indexA1 = 0;                           
  }
  // calculate the average:
  averageA1 = totalA1 / numReadings;         
  //averageA1 = analogRead(A1); 


  pinVoltage = (averageA0 / 1023.0) * arduinoPower;
  pvVolts = pinVoltage / (res2 / (res1 + res2));
  // Ignore small values
  if (pvVolts < 0.2) {
    pvVolts = 0.0;
  }

    // Calculate the amps being produced by the solar panels
    // 10/16/2016 - with no current running through it???
    //battVolts = 0.00, averageA1 = 512, pinVoltage = 2.50

    /*
    Serial.print("pvVolts = ");
    Serial.print(pvVolts);
    Serial.print(", averageA1 = ");
    Serial.println(averageA1);
    */

  // Only check if actually getting something
  /*
  if (averageA1 < 513) { 
    averageA1 = 0;
  }
  */

  tempVoltage = (averageA1 / 1023.0) * 5010; // Gets you mV    
  pvAmps = ((tempVoltage - ACSoffset) / mVperAmp);
  // 7/16/16 - Divide by 2 because I loop it twice
  //pvAmps = pvAmps / 2.0;
  // Ignore small values
  if (pvAmps < 0) {
    pvAmps = 0.0;
  }

    //Serial.print(", pvAmps = ");
    //Serial.println(pvAmps);


  // Post data when the interval has been exceeded
  if(currentMillis - previousMillis > sendDataInterval) {
    previousMillis = currentMillis;
    
    dtostrf(pvVolts,4,3,pvVoltsStr);
    dtostrf(pvAmps,4,3,pvAmpsStr);

    //sprintf(strBuffer,"pvVolts=%s&pvAmps=%s&battVolts=%s&ampsBeingUsed=%s&wattsBeingUsed=%s",pvVoltsStr,pvAmpsStr,battVoltsStr,ampsBeingUsedStr,wattsBeingUsedStr);
    //sprintf(strBuffer,"pvVolts:%s,pvAmps:%s,battVolts:%s,ampsBeingUsed:%s,wattsBeingUsed:%s",pvVoltsStr,pvAmpsStr,battVoltsStr,ampsBeingUsedStr,wattsBeingUsedStr);
    sprintf(strBuffer,"pvVolts:%s,pvAmps:%s",pvVoltsStr,pvAmpsStr);
    Serial.println(strBuffer);
  }

  delay(2);        // delay in between reads for stability            
  delay(100);
} // End of loop


