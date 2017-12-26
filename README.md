# jjkenergymonitor
jjkEnergyMonitor is my nodejs program to update my website running emoncms.  Emoncms collects data and visualizes metrics.  This script responds to serial port messages from an Arduino that is monitoring the volts,amps, and watts from a solar panel array, forms it into a URL and sends it to the emoncms website.

The Arduino code is included in the Arduino folder.