
using Microsoft.Extensions.Configuration;
using System.ComponentModel;
using System.Net;
using Microsoft.Azure.Cosmos;
using Container = Microsoft.Azure.Cosmos.Container;

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
        string? smartPlugUrl;
        string? weatherUrl;
        string? emoncmsInputUrl;
        string? jjkwebStorageConnStr;
        string? azureDBEndpointUri;
        string? azureDBPrimaryKey;

        CosmosClient cosmosClient;

        try
        {
            // Get configuration parameters from the Secrets JSON (not checked into source code control)
            IConfigurationRoot config = new ConfigurationBuilder()
                .AddUserSecrets<Program>()
                .Build();
            string intervalSecsStr = config["INTERVAL_SECONDS"];
            if (!string.IsNullOrEmpty(intervalSecsStr))
            {
                //throw new Exception("Configuration INTERVAL_SECONDS is NULL");
                intervalSeconds = int.Parse(intervalSecsStr);
            }
            smartPlugUrl = config["SMART_PLUG_URL"];
            emoncmsInputUrl = config["EMONCMS_INPUT_URL"];
            azureDBEndpointUri = config["AzureDBEndpointUri"];
            azureDBPrimaryKey = config["AzureDBPrimaryKey"];

            // Create a new instance of the Cosmos Client
            cosmosClient = new CosmosClient(azureDBEndpointUri, azureDBPrimaryKey,
                new CosmosClientOptions()
                {
                    ApplicationName = "jjkEnergyMonitor"
                }
            );

            // Use the Cosmos Client to construct objects for the Point and Total containers
            Container metricPointContainer = cosmosClient.GetContainer("MetricsDB", "MetricPoint");
            Container metricTotalContainer = cosmosClient.GetContainer("MetricsDB", "MetricTotal");

            // Construct the data object to hold values between calls
            var metricData = new MetricData();
            metricData.metricDateTime = DateTime.Now;
            metricData.plug_voltage = 0.0f;
            metricData.plug_current = 0.0f;
            metricData.plug_power = 0.0f;
            metricData.kWh_bucket_DAY = 0.0f;
            metricData.kWh_bucket_YEAR = 0.0f;

            // Get the current DAY and YEAR totals
            int dayVal = int.Parse(metricData.metricDateTime.ToString("yyyyMMdd"));
            var queryText = $"SELECT * FROM c WHERE c.id = \"DAY\" AND c.TotalBucket = {dayVal} ";
            var feed = metricTotalContainer.GetItemQueryIterator<MetricTotal>(queryText);
            while (feed.HasMoreResults)
            {
                var response = await feed.ReadNextAsync();
                foreach (var item in response)
                {
                    metricData.kWh_bucket_DAY = float.Parse(item.TotalValue);
                }
            }

            dayVal = int.Parse(metricData.metricDateTime.ToString("yyyy"));
            queryText = $"SELECT * FROM c WHERE c.id = \"YEAR\" AND c.TotalBucket = {dayVal} ";
            feed = metricTotalContainer.GetItemQueryIterator<MetricTotal>(queryText);
            while (feed.HasMoreResults)
            {
                var response = await feed.ReadNextAsync();
                foreach (var item in response)
                {
                    metricData.kWh_bucket_YEAR = float.Parse(item.TotalValue);
                }
            }

            // Call the metric log service in a loop until stop requested
            while (!stoppingToken.IsCancellationRequested)
            {
                metricData = _logMetricsService.LogMetrics(metricData, metricPointContainer, metricTotalContainer, smartPlugUrl, emoncmsInputUrl);

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