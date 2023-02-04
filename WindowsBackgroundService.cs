
namespace App.WindowsService;

public sealed class WindowsBackgroundService : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly EmoncmsLogMetricsService _logMetricsService;
    private readonly ILogger<WindowsBackgroundService> _logger;

    public WindowsBackgroundService(
        IConfiguration configuration,
        EmoncmsLogMetricsService logMetricsService,
        ILogger<WindowsBackgroundService> logger) =>
        (_configuration, _logMetricsService, _logger) = (configuration, logMetricsService, logger);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        int intervalSeconds = 10;
        string smartPlugUrl = "";
        string emoncmsInputUrl = "";
        string weatherUrl = "";
        try
        {
            /*
            string intervalSecsStr = _configuration.GetSection("INTERVAL_SECONDS").Value;
            if (string.IsNullOrEmpty(intervalSecsStr))
            {
                throw new Exception("Configuration INTERVAL_SECONDS is NULL");
            }
            int intervalSeconds = int.Parse(intervalSecsStr);
            */
            int pos = 0;
            string tempStr;
            //foreach (string line in File.ReadLines("D:/Projects/jjkEnergyMonitor/.env"))
            foreach (string line in File.ReadLines("E:/jjkPublish/.env"))
            {
                pos = line.IndexOf('=');
                tempStr = line.Substring(pos + 1);
                if (line.Contains("INTERVAL_SECONDS"))
                {
                    intervalSeconds = int.Parse(tempStr);
                }
                else if (line.Contains("SMART_PLUG_URL"))
                {
                    smartPlugUrl = tempStr;
                }
                else if (line.Contains("EMONCMS_INPUT_URL"))
                {
                    emoncmsInputUrl = tempStr;
                }
                else if (line.Contains("WEATHER_URL"))
                {
                    weatherUrl = tempStr;
                }
            }

            var metricData = new MetricData();
            metricData.pvVolts = "";
            metricData.pvAmps = "";
            metricData.pvWatts = "";
            metricData.weather = 0;
            metricData.weatherTemp = 0.0F;
            metricData.weatherFeels = 0.0F;
            metricData.weatherPressure = 0;
            metricData.weatherHumidity = 0;
            metricData.weatherDateTime = 0;

            while (!stoppingToken.IsCancellationRequested)
            {
                metricData = _logMetricsService.LogMetrics(metricData, smartPlugUrl, emoncmsInputUrl, weatherUrl);

                //_logger.LogWarning("Metrics successfully logged to EMONCMS");
                await Task.Delay(TimeSpan.FromSeconds(intervalSeconds), stoppingToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error logging to EMONCMS, Message = {ex.Message}");

            // Terminates this process and returns an exit code to the operating system.
            // This is required to avoid the 'BackgroundServiceExceptionBehavior', which
            // performs one of two scenarios:
            // 1. When set to "Ignore": will do nothing at all, errors cause zombie services.
            // 2. When set to "StopHost": will cleanly stop the host, and log errors.
            //
            // In order for the Windows Service Management system to leverage configured
            // recovery options, we need to terminate the process with a non-zero exit code.
            Environment.Exit(1);
        }
    }
}
