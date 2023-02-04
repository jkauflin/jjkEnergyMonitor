# jjkenergymonitor
jjkEnergyMonitor is a program to update my website running emoncms.  Emoncms collects data and visualizes metrics.  

The program monitors a KAUF Energy Monitoring Smart Plug to get volts, amps, and watts being generated from grid-tie inverters plugged into solar planels. The script forms the data into a URL and sends it to the emoncms website for visualization on my website

The program is currently implemented as a .NET C# background worker service installed as Windows service
