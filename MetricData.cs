
namespace App.WindowsService
{
    public class MetricData
    {
        public DateTime metricDateTime { get; set; }
        public float plug_voltage { get; set; }
        public float plug_current { get; set; }
        public float plug_current_max { get; set; }
        public float plug_power { get; set; }
        public float plug_power_max { get; set; }
        public float kWh_bucket_DAY { get; set; }
        public float kWh_bucket_YEAR { get; set; }
    }
}
